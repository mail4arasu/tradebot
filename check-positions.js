// Simple position checker script
// Run with: node check-positions.js

const fetch = require('node-fetch') // You might need: npm install node-fetch

const API_BASE = 'https://niveshawealth.in'

async function checkPositions() {
  try {
    console.log('🔍 Checking positions via API...')
    
    const response = await fetch(`${API_BASE}/api/admin/position-reconciliation?action=check`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    })
    
    if (!response.ok) {
      console.error(`❌ API Error: ${response.status} ${response.statusText}`)
      const errorText = await response.text()
      console.error('Error details:', errorText)
      return
    }
    
    const data = await response.json()
    
    if (data.success) {
      console.log('\n✅ Position reconciliation check completed!')
      console.log('📊 Summary:')
      console.log(`  Total positions: ${data.summary.total}`)
      console.log(`  ✅ Keep open: ${data.summary.keepOpen}`)
      console.log(`  🔄 Reconcile closed: ${data.summary.reconcileClosed}`)
      console.log(`  ⚠️ Manual review: ${data.summary.manualReview}`)
      
      if (data.results && data.results.length > 0) {
        console.log('\n📋 Detailed Results:')
        console.log('=' * 80)
        
        data.results.forEach((result, index) => {
          console.log(`\n${index + 1}. Position: ${result.positionId}`)
          console.log(`   Symbol: ${result.symbol} (${result.exchange})`)
          console.log(`   TradeBot Qty: ${result.tradeботQuantity}`)
          console.log(`   Zerodha Qty: ${result.zerodhaQuantity}`)
          console.log(`   Zerodha Status: ${result.zerodhaStatus}`)
          console.log(`   Recommended Action: ${result.recommendedAction}`)
          console.log(`   Reason: ${result.reconciliationReason}`)
        })
        
        // Show positions that need reconciliation
        const toReconcile = data.results.filter(r => r.recommendedAction === 'RECONCILE_CLOSED')
        if (toReconcile.length > 0) {
          console.log('\n🔄 POSITIONS TO RECONCILE:')
          console.log('-' * 50)
          toReconcile.forEach(pos => {
            console.log(`${pos.positionId} - ${pos.symbol} (${pos.reconciliationReason})`)
          })
          
          console.log(`\n💡 To execute reconciliation, run:`)
          console.log(`node reconcile-positions.js`)
        }
        
      } else {
        console.log('\n✅ No open positions found in database')
      }
      
    } else {
      console.error('❌ API returned error:', data.error)
    }
    
  } catch (error) {
    console.error('❌ Error checking positions:', error.message)
    console.error('\n💡 Make sure:')
    console.error('  1. The server is running')
    console.error('  2. You have installed node-fetch: npm install node-fetch')
    console.error('  3. The API endpoint is accessible')
  }
}

async function reconcilePositions() {
  try {
    console.log('🔄 Executing position reconciliation...')
    
    // First, get the positions to reconcile
    console.log('1. Checking positions...')
    const checkResponse = await fetch(`${API_BASE}/api/admin/position-reconciliation?action=check`)
    const checkData = await checkResponse.json()
    
    if (!checkData.success) {
      console.error('❌ Failed to check positions:', checkData.error)
      return
    }
    
    const toReconcile = checkData.results.filter(r => r.recommendedAction === 'RECONCILE_CLOSED')
    
    if (toReconcile.length === 0) {
      console.log('✅ No positions need reconciliation')
      return
    }
    
    console.log(`2. Found ${toReconcile.length} positions to reconcile...`)
    
    // Execute reconciliation
    const response = await fetch(`${API_BASE}/api/admin/position-reconciliation`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        action: 'reconcile',
        dryRun: false,
        positions: checkData.results
      })
    })
    
    if (!response.ok) {
      console.error(`❌ Reconciliation API Error: ${response.status}`)
      return
    }
    
    const data = await response.json()
    
    if (data.success) {
      console.log('✅ Reconciliation completed successfully!')
      console.log(`📊 Reconciled ${data.reconciled} positions`)
      
      if (data.positionsReconciled && data.positionsReconciled.length > 0) {
        console.log('\n🔄 Reconciled positions:')
        data.positionsReconciled.forEach(pos => {
          console.log(`  - ${pos.positionId} (${pos.symbol}): ${pos.reason}`)
        })
      }
    } else {
      console.error('❌ Reconciliation failed:', data.error)
    }
    
  } catch (error) {
    console.error('❌ Error executing reconciliation:', error.message)
  }
}

// Main execution
const command = process.argv[2]

if (command === 'reconcile') {
  reconcilePositions()
} else {
  checkPositions()
}

console.log('\n💡 Usage:')
console.log('  node check-positions.js        # Check positions only')
console.log('  node check-positions.js reconcile  # Execute reconciliation')