const { MongoClient } = require('mongodb')
const crypto = require('crypto')

// Configuration
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017'
const MONGODB_DB = process.env.MONGODB_DB || 'tradebot'
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY

// Encryption utilities
function decrypt(encryptedText) {
  if (!ENCRYPTION_KEY) {
    throw new Error('ENCRYPTION_KEY not found in environment variables')
  }
  
  try {
    const textParts = encryptedText.split(':')
    const iv = Buffer.from(textParts.shift(), 'hex')
    const encryptedData = Buffer.from(textParts.join(':'), 'hex')
    const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv)
    
    let decrypted = decipher.update(encryptedData)
    decrypted = Buffer.concat([decrypted, decipher.final()])
    
    return decrypted.toString()
  } catch (error) {
    throw new Error(`Decryption failed: ${error.message}`)
  }
}

// Zerodha API client (simplified)
class ZerodhaAPI {
  constructor(apiKey, apiSecret, accessToken) {
    this.apiKey = apiKey
    this.apiSecret = apiSecret
    this.accessToken = accessToken
    this.baseUrl = 'https://api.kite.trade'
  }

  async getPositions() {
    try {
      const response = await fetch(`${this.baseUrl}/portfolio/positions`, {
        headers: {
          'Authorization': `token ${this.apiKey}:${this.accessToken}`,
          'X-Kite-Version': '3'
        }
      })
      
      if (!response.ok) {
        throw new Error(`API request failed: ${response.status}`)
      }
      
      return await response.json()
    } catch (error) {
      console.error('Error fetching positions:', error)
      throw error
    }
  }
}

// Position validation function
async function validatePositionInZerodha(position, zerodhaClient) {
  try {
    const positionsResponse = await zerodhaClient.getPositions()
    const zerodhaPositions = positionsResponse.data?.net || []
    
    // Find matching position by symbol and exchange
    const matchedPosition = zerodhaPositions.find(zPos => 
      zPos.tradingsymbol === position.symbol && 
      zPos.exchange === position.exchange &&
      Math.abs(zPos.quantity) > 0 // Only consider non-zero positions
    )
    
    if (matchedPosition) {
      return {
        existsInZerodha: true,
        zerodhaQuantity: matchedPosition.quantity,
        zerodhaPrice: matchedPosition.average_price || matchedPosition.last_price,
        zerodhaPnl: matchedPosition.pnl || 0
      }
    } else {
      return {
        existsInZerodha: false,
        zerodhaQuantity: 0,
        zerodhaPrice: 0,
        zerodhaPnl: 0
      }
    }
  } catch (error) {
    console.error(`Error validating position ${position.positionId}:`, error)
    throw error
  }
}

// Main reconciliation function
async function reconcilePositions() {
  const client = new MongoClient(MONGODB_URI)
  
  try {
    console.log('🔗 Connecting to MongoDB...')
    await client.connect()
    const db = client.db(MONGODB_DB)
    
    console.log('📊 Fetching open positions...')
    const openPositions = await db.collection('positions').find({
      status: { $in: ['OPEN', 'PARTIAL'] }
    }).toArray()
    
    console.log(`Found ${openPositions.length} open positions in database`)
    
    if (openPositions.length === 0) {
      console.log('✅ No open positions found - database is clean')
      return
    }
    
    const results = []
    
    for (const position of openPositions) {
      console.log(`\n🔍 Checking position: ${position.positionId} (${position.symbol})`)
      
      try {
        // Get user's Zerodha configuration
        const user = await db.collection('users').findOne({ _id: position.userId })
        
        if (!user?.zerodhaConfig?.isConnected) {
          console.log(`❌ User ${position.userId} Zerodha not connected`)
          results.push({
            position: position.positionId,
            symbol: position.symbol,
            status: 'ERROR',
            reason: 'User Zerodha not connected',
            action: 'MANUAL_REVIEW'
          })
          continue
        }
        
        // Initialize Zerodha client
        const zerodhaClient = new ZerodhaAPI(
          decrypt(user.zerodhaConfig.apiKey),
          decrypt(user.zerodhaConfig.apiSecret),
          decrypt(user.zerodhaConfig.accessToken)
        )
        
        // Validate position
        const validation = await validatePositionInZerodha(position, zerodhaClient)
        
        if (validation.existsInZerodha) {
          const quantityMatch = Math.abs(validation.zerodhaQuantity) === Math.abs(position.currentQuantity)
          
          if (quantityMatch) {
            console.log(`✅ Position exists and matches - keep open`)
            results.push({
              position: position.positionId,
              symbol: position.symbol,
              tradeботQty: position.currentQuantity,
              zerodhaQty: validation.zerodhaQuantity,
              status: 'VALID',
              reason: 'Position exists in Zerodha with matching quantity',
              action: 'KEEP_OPEN'
            })
          } else {
            console.log(`⚠️ Position exists but quantity mismatch: TradeBot=${position.currentQuantity}, Zerodha=${validation.zerodhaQuantity}`)
            results.push({
              position: position.positionId,
              symbol: position.symbol,
              tradeботQty: position.currentQuantity,
              zerodhaQty: validation.zerodhaQuantity,
              status: 'MISMATCH',
              reason: `Quantity mismatch: TradeBot=${position.currentQuantity}, Zerodha=${validation.zerodhaQuantity}`,
              action: 'MANUAL_REVIEW'
            })
          }
        } else {
          console.log(`❌ Position not found in Zerodha - needs reconciliation`)
          results.push({
            position: position.positionId,
            symbol: position.symbol,
            tradeботQty: position.currentQuantity,
            zerodhaQty: 0,
            status: 'NOT_FOUND',
            reason: 'Position not found in Zerodha - likely closed manually or externally',
            action: 'RECONCILE_CLOSED'
          })
        }
        
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 500))
        
      } catch (error) {
        console.error(`❌ Error checking position ${position.positionId}:`, error.message)
        results.push({
          position: position.positionId,
          symbol: position.symbol,
          status: 'ERROR',
          reason: `Validation error: ${error.message}`,
          action: 'MANUAL_REVIEW'
        })
      }
    }
    
    // Generate summary
    console.log('\n' + '='.repeat(80))
    console.log('POSITION RECONCILIATION SUMMARY')
    console.log('='.repeat(80))
    
    const summary = {
      total: results.length,
      keepOpen: results.filter(r => r.action === 'KEEP_OPEN').length,
      reconcileClosed: results.filter(r => r.action === 'RECONCILE_CLOSED').length,
      manualReview: results.filter(r => r.action === 'MANUAL_REVIEW').length
    }
    
    console.log(`Total positions checked: ${summary.total}`)
    console.log(`✅ Keep open (valid): ${summary.keepOpen}`)
    console.log(`🔄 Reconcile as closed: ${summary.reconcileClosed}`)
    console.log(`⚠️ Manual review needed: ${summary.manualReview}`)
    
    // Show positions that need reconciliation
    const toReconcile = results.filter(r => r.action === 'RECONCILE_CLOSED')
    if (toReconcile.length > 0) {
      console.log('\n' + '-'.repeat(50))
      console.log('POSITIONS TO RECONCILE AS CLOSED:')
      console.log('-'.repeat(50))
      
      toReconcile.forEach(result => {
        console.log(`Position: ${result.position}`)
        console.log(`Symbol: ${result.symbol}`)
        console.log(`TradeBot Qty: ${result.tradeботQty}`)
        console.log(`Reason: ${result.reason}`)
        console.log('')
      })
      
      // Ask for confirmation to reconcile
      if (process.argv.includes('--execute')) {
        console.log('🔄 Executing reconciliation...')
        
        for (const result of toReconcile) {
          console.log(`Reconciling position: ${result.position}`)
          
          await db.collection('positions').updateOne(
            { positionId: result.position },
            {
              $set: {
                status: 'CLOSED',
                closedAt: new Date(),
                exitReason: 'MANUAL_RECONCILIATION',
                reconciliationNote: result.reason,
                reconciliationTime: new Date(),
                reconciliationType: 'EXTERNAL_MANUAL_EXIT'
              }
            }
          )
          
          // Create audit record
          await db.collection('positionreconciliations').insertOne({
            positionId: result.position,
            symbol: result.symbol,
            originalStatus: 'OPEN',
            newStatus: 'CLOSED',
            reconciliationReason: result.reason,
            tradeботQuantity: result.tradeботQty,
            zerodhaQuantity: result.zerodhaQty,
            reconciliationType: 'MANUAL_SCRIPT_RECONCILIATION',
            reconciliationTime: new Date(),
            reconciliationBy: 'MANUAL_SCRIPT'
          })
        }
        
        console.log(`✅ Successfully reconciled ${toReconcile.length} positions`)
      } else {
        console.log('\n💡 To execute reconciliation, run with --execute flag:')
        console.log('node scripts/reconcile-positions.js --execute')
      }
    }
    
    // Show manual review positions
    const manualReview = results.filter(r => r.action === 'MANUAL_REVIEW')
    if (manualReview.length > 0) {
      console.log('\n' + '-'.repeat(50))
      console.log('POSITIONS REQUIRING MANUAL REVIEW:')
      console.log('-'.repeat(50))
      
      manualReview.forEach(result => {
        console.log(`Position: ${result.position}`)
        console.log(`Symbol: ${result.symbol}`)
        console.log(`Issue: ${result.reason}`)
        console.log('')
      })
    }
    
    console.log('='.repeat(80))
    
  } catch (error) {
    console.error('❌ Reconciliation failed:', error)
    process.exit(1)
  } finally {
    await client.close()
  }
}

// Run reconciliation
console.log('🚀 Starting position reconciliation...')
reconcilePositions().then(() => {
  console.log('✅ Reconciliation completed')
  process.exit(0)
}).catch(error => {
  console.error('❌ Reconciliation failed:', error)
  process.exit(1)
})