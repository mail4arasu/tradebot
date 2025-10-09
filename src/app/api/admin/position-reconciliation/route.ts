import { NextRequest, NextResponse } from 'next/server'
import { 
  performManualPositionReconciliation, 
  executePositionReconciliation,
  generateReconciliationReport,
  type PositionReconciliationResult
} from '@/utils/manualPositionReconciliation'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const action = searchParams.get('action') || 'check'
    
    console.log(`🔍 Position reconciliation API called with action: ${action}`)
    
    if (action === 'check') {
      // Perform reconciliation check without making changes
      console.log('📊 Performing position reconciliation check...')
      
      const results = await performManualPositionReconciliation()
      const report = generateReconciliationReport(results)
      
      return NextResponse.json({
        success: true,
        action: 'check',
        results,
        report,
        summary: {
          total: results.length,
          keepOpen: results.filter(r => r.recommendedAction === 'KEEP_OPEN').length,
          reconcileClosed: results.filter(r => r.recommendedAction === 'RECONCILE_CLOSED').length,
          manualReview: results.filter(r => r.recommendedAction === 'MANUAL_REVIEW').length
        }
      })
      
    } else if (action === 'report') {
      // Generate detailed report
      const results = await performManualPositionReconciliation()
      const report = generateReconciliationReport(results)
      
      return new NextResponse(report, {
        headers: {
          'Content-Type': 'text/plain',
          'Content-Disposition': `attachment; filename="position_reconciliation_${new Date().toISOString().split('T')[0]}.txt"`
        }
      })
      
    } else {
      return NextResponse.json({
        error: 'Invalid action',
        availableActions: ['check', 'report'],
        usage: {
          check: 'GET /api/admin/position-reconciliation?action=check',
          report: 'GET /api/admin/position-reconciliation?action=report'
        }
      }, { status: 400 })
    }
    
  } catch (error) {
    console.error('❌ Position reconciliation API error:', error)
    return NextResponse.json({
      error: 'Internal server error',
      details: error.message
    }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { action, dryRun = true, positions } = body
    
    console.log(`🔄 Position reconciliation POST action: ${action}, dryRun: ${dryRun}`)
    
    if (action === 'reconcile') {
      let results: PositionReconciliationResult[]
      
      if (positions && Array.isArray(positions)) {
        // Use provided positions
        results = positions
      } else {
        // Perform fresh check
        results = await performManualPositionReconciliation()
      }
      
      // Execute reconciliation
      await executePositionReconciliation(results, dryRun)
      
      const positionsToReconcile = results.filter(r => r.recommendedAction === 'RECONCILE_CLOSED')
      
      return NextResponse.json({
        success: true,
        action: 'reconcile',
        dryRun,
        reconciled: positionsToReconcile.length,
        positionsReconciled: positionsToReconcile.map(p => ({
          positionId: p.positionId,
          symbol: p.symbol,
          reason: p.reconciliationReason
        })),
        message: dryRun 
          ? `DRY RUN: Would reconcile ${positionsToReconcile.length} positions`
          : `Successfully reconciled ${positionsToReconcile.length} positions`
      })
      
    } else if (action === 'reconcile-specific') {
      // Reconcile specific position IDs
      const { positionIds } = body
      
      if (!positionIds || !Array.isArray(positionIds)) {
        return NextResponse.json({
          error: 'positionIds array required for reconcile-specific action'
        }, { status: 400 })
      }
      
      // Get all results and filter to specific positions
      const allResults = await performManualPositionReconciliation()
      const specificResults = allResults.filter(r => positionIds.includes(r.positionId))
      
      if (specificResults.length === 0) {
        return NextResponse.json({
          error: 'No matching positions found for provided IDs'
        }, { status: 404 })
      }
      
      await executePositionReconciliation(specificResults, dryRun)
      
      return NextResponse.json({
        success: true,
        action: 'reconcile-specific',
        dryRun,
        requested: positionIds.length,
        found: specificResults.length,
        reconciled: specificResults.filter(r => r.recommendedAction === 'RECONCILE_CLOSED').length,
        results: specificResults
      })
      
    } else {
      return NextResponse.json({
        error: 'Invalid action',
        availableActions: ['reconcile', 'reconcile-specific'],
        usage: {
          reconcile: 'POST /api/admin/position-reconciliation { "action": "reconcile", "dryRun": true }',
          'reconcile-specific': 'POST /api/admin/position-reconciliation { "action": "reconcile-specific", "positionIds": ["pos1", "pos2"], "dryRun": true }'
        }
      }, { status: 400 })
    }
    
  } catch (error) {
    console.error('❌ Position reconciliation POST error:', error)
    return NextResponse.json({
      error: 'Internal server error',
      details: error.message
    }, { status: 500 })
  }
}