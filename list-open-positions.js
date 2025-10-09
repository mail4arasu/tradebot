// Direct MongoDB query to list open positions
// Run with: node list-open-positions.js

const { MongoClient } = require('mongodb')

// Configuration - adjust if needed
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017'
const MONGODB_DB = process.env.MONGODB_DB || 'tradebot'

async function listOpenPositions() {
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
      console.log('✅ No open positions found - database is clean!')
      return
    }
    
    console.log('\n📋 OPEN POSITIONS DETAILS:')
    console.log('=' * 80)
    
    openPositions.forEach((position, index) => {
      console.log(`\n${index + 1}. Position ID: ${position.positionId}`)
      console.log(`   Symbol: ${position.symbol}`)
      console.log(`   Exchange: ${position.exchange}`)
      console.log(`   Status: ${position.status}`)
      console.log(`   Side: ${position.side}`)
      console.log(`   Current Quantity: ${position.currentQuantity}`)
      console.log(`   Entry Price: ${position.entryPrice}`)
      console.log(`   User ID: ${position.userId}`)
      console.log(`   Bot ID: ${position.botId}`)
      console.log(`   Created: ${position.createdAt}`)
      console.log(`   Updated: ${position.updatedAt}`)
      
      if (position.scheduledExitTime) {
        console.log(`   Scheduled Exit: ${position.scheduledExitTime}`)
      }
      
      if (position.entryExecutionId) {
        console.log(`   Entry Execution ID: ${position.entryExecutionId}`)
      }
    })
    
    console.log('\n📊 Summary by Status:')
    const statusCounts = openPositions.reduce((acc, pos) => {
      acc[pos.status] = (acc[pos.status] || 0) + 1
      return acc
    }, {})
    
    Object.entries(statusCounts).forEach(([status, count]) => {
      console.log(`  ${status}: ${count}`)
    })
    
    console.log('\n📊 Summary by Symbol:')
    const symbolCounts = openPositions.reduce((acc, pos) => {
      acc[pos.symbol] = (acc[pos.symbol] || 0) + 1
      return acc
    }, {})
    
    Object.entries(symbolCounts).forEach(([symbol, count]) => {
      console.log(`  ${symbol}: ${count}`)
    })
    
    console.log('\n💡 Next Steps:')
    console.log('  1. Run position reconciliation to check these against Zerodha:')
    console.log('     node check-positions.js')
    console.log('  2. Or use the web interface:')
    console.log('     https://niveshawealth.in/admin/position-reconciliation')
    
  } catch (error) {
    console.error('❌ Error:', error.message)
    
    if (error.message.includes('ECONNREFUSED')) {
      console.error('\n💡 MongoDB connection failed. Check:')
      console.error('  1. MongoDB is running')
      console.error('  2. Connection string is correct')
      console.error('  3. Environment variables are set')
    }
  } finally {
    await client.close()
  }
}

// Run the script
listOpenPositions().then(() => {
  console.log('\n✅ Query completed')
  process.exit(0)
}).catch(error => {
  console.error('❌ Script failed:', error)
  process.exit(1)
})