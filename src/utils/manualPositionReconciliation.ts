import { ObjectId } from 'mongodb'
import clientPromise from '@/lib/mongodb'
import { ZerodhaAPI } from '@/lib/zerodha'
import { decrypt } from '@/lib/encryption'
import { validatePositionInZerodha } from '@/utils/positionValidation'

export interface PositionReconciliationResult {
  positionId: string
  symbol: string
  exchange: string
  userId: string
  currentStatus: string
  zerodhaStatus: 'EXISTS' | 'NOT_EXISTS' | 'ERROR'
  tradeботQuantity: number
  zerodhaQuantity: number
  recommendedAction: 'KEEP_OPEN' | 'RECONCILE_CLOSED' | 'MANUAL_REVIEW'
  reconciliationReason: string
  zerodhaDetails?: any
}

/**
 * Manual position reconciliation utility
 * Checks all open positions against Zerodha and provides reconciliation recommendations
 */
export async function performManualPositionReconciliation(): Promise<PositionReconciliationResult[]> {
  try {
    console.log('🔍 Starting manual position reconciliation...')
    
    const client = await clientPromise
    const db = client.db('tradebot')
    
    // Get all open positions from database
    const openPositions = await db.collection('positions').find({
      status: { $in: ['OPEN', 'PARTIAL'] }
    }).toArray()
    
    console.log(`📊 Found ${openPositions.length} open positions in database`)
    
    if (openPositions.length === 0) {
      console.log('✅ No open positions found - database is clean')
      return []
    }
    
    const reconciliationResults: PositionReconciliationResult[] = []
    
    // Process each position
    for (const position of openPositions) {
      try {
        console.log(`\n🔍 Checking position: ${position.positionId} (${position.symbol})`)
        
        // Get user's Zerodha configuration
        const user = await db.collection('users').findOne({ _id: position.userId })
        if (!user?.zerodhaConfig?.isConnected) {
          reconciliationResults.push({
            positionId: position.positionId,
            symbol: position.symbol,
            exchange: position.exchange,
            userId: position.userId.toString(),
            currentStatus: position.status,
            zerodhaStatus: 'ERROR',
            tradeботQuantity: position.currentQuantity,
            zerodhaQuantity: 0,
            recommendedAction: 'MANUAL_REVIEW',
            reconciliationReason: 'User Zerodha not connected - cannot validate'
          })
          continue
        }
        
        // Validate position in Zerodha
        const validation = await validatePositionInZerodha(position)
        
        let result: PositionReconciliationResult
        
        if (validation.existsInZerodha) {
          // Position exists in Zerodha
          const quantityMatch = Math.abs(validation.zerodhaQuantity) === Math.abs(position.currentQuantity)
          
          result = {
            positionId: position.positionId,
            symbol: position.symbol,
            exchange: position.exchange,
            userId: position.userId.toString(),
            currentStatus: position.status,
            zerodhaStatus: 'EXISTS',
            tradeботQuantity: position.currentQuantity,
            zerodhaQuantity: validation.zerodhaQuantity,
            recommendedAction: quantityMatch ? 'KEEP_OPEN' : 'MANUAL_REVIEW',
            reconciliationReason: quantityMatch 
              ? 'Position exists in Zerodha with matching quantity - keep open'
              : `Quantity mismatch: TradeBot=${position.currentQuantity}, Zerodha=${validation.zerodhaQuantity}`,
            zerodhaDetails: {
              price: validation.zerodhaPrice,
              pnl: validation.zerodhaPnl,
              validationTime: new Date()
            }
          }
        } else {
          // Position does not exist in Zerodha
          result = {
            positionId: position.positionId,
            symbol: position.symbol,
            exchange: position.exchange,
            userId: position.userId.toString(),
            currentStatus: position.status,
            zerodhaStatus: 'NOT_EXISTS',
            tradeботQuantity: position.currentQuantity,
            zerodhaQuantity: 0,
            recommendedAction: 'RECONCILE_CLOSED',
            reconciliationReason: 'Position not found in Zerodha - likely closed manually or externally',
            zerodhaDetails: {
              lastChecked: new Date(),
              positionNotFound: true
            }
          }
        }
        
        reconciliationResults.push(result)
        
        // Log result
        console.log(`📋 Result: ${result.recommendedAction} - ${result.reconciliationReason}`)
        
      } catch (error) {
        console.error(`❌ Error checking position ${position.positionId}:`, error)
        reconciliationResults.push({
          positionId: position.positionId,
          symbol: position.symbol,
          exchange: position.exchange,
          userId: position.userId.toString(),
          currentStatus: position.status,
          zerodhaStatus: 'ERROR',
          tradeботQuantity: position.currentQuantity,
          zerodhaQuantity: 0,
          recommendedAction: 'MANUAL_REVIEW',
          reconciliationReason: `Error during validation: ${error.message}`
        })
      }
    }
    
    // Summary
    console.log('\n📊 Reconciliation Summary:')
    const summary = {
      total: reconciliationResults.length,
      keepOpen: reconciliationResults.filter(r => r.recommendedAction === 'KEEP_OPEN').length,
      reconcileClosed: reconciliationResults.filter(r => r.recommendedAction === 'RECONCILE_CLOSED').length,
      manualReview: reconciliationResults.filter(r => r.recommendedAction === 'MANUAL_REVIEW').length
    }
    
    console.log(`Total positions: ${summary.total}`)
    console.log(`Keep open: ${summary.keepOpen}`)
    console.log(`Reconcile as closed: ${summary.reconcileClosed}`)
    console.log(`Manual review needed: ${summary.manualReview}`)
    
    return reconciliationResults
    
  } catch (error) {
    console.error('❌ Error in position reconciliation:', error)
    throw error
  }
}

/**
 * Execute reconciliation for positions that should be closed
 */
export async function executePositionReconciliation(
  reconciliationResults: PositionReconciliationResult[],
  dryRun: boolean = true
): Promise<void> {
  try {
    const client = await clientPromise
    const db = client.db('tradebot')
    
    const positionsToReconcile = reconciliationResults.filter(
      r => r.recommendedAction === 'RECONCILE_CLOSED'
    )
    
    if (positionsToReconcile.length === 0) {
      console.log('✅ No positions need reconciliation')
      return
    }
    
    console.log(`\n🔄 ${dryRun ? 'DRY RUN' : 'EXECUTING'} reconciliation for ${positionsToReconcile.length} positions...`)
    
    for (const result of positionsToReconcile) {
      console.log(`\n📋 ${dryRun ? 'Would reconcile' : 'Reconciling'} position: ${result.positionId}`)
      console.log(`   Symbol: ${result.symbol}`)
      console.log(`   Reason: ${result.reconciliationReason}`)
      
      if (!dryRun) {
        // Update position status to CLOSED
        await db.collection('positions').updateOne(
          { positionId: result.positionId },
          {
            $set: {
              status: 'CLOSED',
              closedAt: new Date(),
              exitReason: 'MANUAL_RECONCILIATION',
              reconciliationNote: result.reconciliationReason,
              reconciliationTime: new Date(),
              reconciliationType: 'EXTERNAL_MANUAL_EXIT'
            }
          }
        )
        
        // Create reconciliation audit record
        await db.collection('positionreconciliations').insertOne({
          positionId: result.positionId,
          userId: new ObjectId(result.userId),
          symbol: result.symbol,
          exchange: result.exchange,
          originalStatus: result.currentStatus,
          newStatus: 'CLOSED',
          reconciliationReason: result.reconciliationReason,
          tradeботQuantity: result.tradeботQuantity,
          zerodhaQuantity: result.zerodhaQuantity,
          zerodhaStatus: result.zerodhaStatus,
          reconciliationType: 'MANUAL_ADMIN_RECONCILIATION',
          reconciliationTime: new Date(),
          reconciliationBy: 'MANUAL_SCRIPT'
        })
        
        console.log(`✅ Position ${result.positionId} reconciled successfully`)
      }
    }
    
    if (dryRun) {
      console.log('\n💡 This was a DRY RUN - no changes were made to the database')
      console.log('💡 To execute the reconciliation, run with dryRun=false')
    } else {
      console.log('\n✅ Reconciliation completed successfully')
    }
    
  } catch (error) {
    console.error('❌ Error executing reconciliation:', error)
    throw error
  }
}

/**
 * Generate detailed reconciliation report
 */
export function generateReconciliationReport(results: PositionReconciliationResult[]): string {
  const report = []
  
  report.push('=' * 80)
  report.push('POSITION RECONCILIATION REPORT')
  report.push('=' * 80)
  report.push('')
  
  const summary = {
    total: results.length,
    keepOpen: results.filter(r => r.recommendedAction === 'KEEP_OPEN').length,
    reconcileClosed: results.filter(r => r.recommendedAction === 'RECONCILE_CLOSED').length,
    manualReview: results.filter(r => r.recommendedAction === 'MANUAL_REVIEW').length
  }
  
  report.push(`Total Positions Checked: ${summary.total}`)
  report.push(`✅ Keep Open (Valid): ${summary.keepOpen}`)
  report.push(`🔄 Reconcile Closed: ${summary.reconcileClosed}`)
  report.push(`⚠️ Manual Review Needed: ${summary.manualReview}`)
  report.push('')
  
  // Detailed breakdown
  if (summary.reconcileClosed > 0) {
    report.push('POSITIONS TO RECONCILE AS CLOSED:')
    report.push('-' * 50)
    results.filter(r => r.recommendedAction === 'RECONCILE_CLOSED').forEach(result => {
      report.push(`Position ID: ${result.positionId}`)
      report.push(`Symbol: ${result.symbol} (${result.exchange})`)
      report.push(`TradeBot Quantity: ${result.tradeботQuantity}`)
      report.push(`Zerodha Status: ${result.zerodhaStatus}`)
      report.push(`Reason: ${result.reconciliationReason}`)
      report.push('')
    })
  }
  
  if (summary.manualReview > 0) {
    report.push('POSITIONS REQUIRING MANUAL REVIEW:')
    report.push('-' * 50)
    results.filter(r => r.recommendedAction === 'MANUAL_REVIEW').forEach(result => {
      report.push(`Position ID: ${result.positionId}`)
      report.push(`Symbol: ${result.symbol} (${result.exchange})`)
      report.push(`TradeBot Quantity: ${result.tradeботQuantity}`)
      report.push(`Zerodha Quantity: ${result.zerodhaQuantity}`)
      report.push(`Issue: ${result.reconciliationReason}`)
      report.push('')
    })
  }
  
  if (summary.keepOpen > 0) {
    report.push('VALID POSITIONS (KEEP OPEN):')
    report.push('-' * 50)
    results.filter(r => r.recommendedAction === 'KEEP_OPEN').forEach(result => {
      report.push(`Position ID: ${result.positionId}`)
      report.push(`Symbol: ${result.symbol} (${result.exchange})`)
      report.push(`Quantity: ${result.tradeботQuantity} (matches Zerodha)`)
      report.push(`Status: ${result.reconciliationReason}`)
      report.push('')
    })
  }
  
  report.push('=' * 80)
  report.push(`Report generated at: ${new Date().toISOString()}`)
  report.push('=' * 80)
  
  return report.join('\n')
}