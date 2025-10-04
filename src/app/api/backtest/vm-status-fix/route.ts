// VM Status Fix - Extract results from status endpoint when results endpoint fails
import { NextRequest, NextResponse } from 'next/server'

const BACKTEST_VM_URL = 'http://10.160.0.3:4000' // Dedicated backtest-tradebot VM

async function proxyToBacktestVM(path: string): Promise<Response> {
  const url = `${BACKTEST_VM_URL}${path}`
  return fetch(url, {
    method: 'GET',
    signal: AbortSignal.timeout(30000)
  })
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const backtestId = searchParams.get('id')
    
    if (!backtestId) {
      return NextResponse.json({ error: 'Backtest ID required' }, { status: 400 })
    }

    console.log(`🔍 VM Status Fix for: ${backtestId}`)

    // Try status endpoint from dedicated backtest-tradebot VM
    const statusResponse = await proxyToBacktestVM(`/api/backtest/status/${backtestId}`)
    
    if (!statusResponse.ok) {
      return NextResponse.json({
        success: false,
        error: `VM status failed: ${statusResponse.status}`
      }, { status: 404 })
    }
    
    const statusData = await statusResponse.json()
    console.log(`📊 VM status data:`, statusData)
    
    if (statusData.status === 'COMPLETED') {
      // Extract results from status data
      const result = {
        totalReturn: statusData.totalPnL || statusData.result?.totalReturn || 0,
        totalReturnPercent: statusData.totalReturnPercent || statusData.result?.totalReturnPercent || 0,
        winRate: statusData.winRate || statusData.result?.winRate || 0,
        totalTrades: statusData.totalTrades || statusData.result?.totalTrades || 0,
        winningTrades: statusData.winningTrades || statusData.result?.winningTrades || 0,
        losingTrades: statusData.losingTrades || statusData.result?.losingTrades || 0,
        maxDrawdownPercent: statusData.maxDrawdown || statusData.result?.maxDrawdownPercent || 0,
        finalCapital: statusData.finalCapital || statusData.result?.finalCapital || 0,
        sharpeRatio: statusData.sharpeRatio || statusData.result?.sharpeRatio || 0
      }
      
      return NextResponse.json({
        success: true,
        result: result,
        source: 'backtest-tradebot-vm-status',
        backtestId: statusData.id || backtestId,
        vm: 'backtest-tradebot (10.160.0.3)',
        statusData: statusData
      })
    } else {
      return NextResponse.json({
        success: false,
        error: `Backtest not completed. Status: ${statusData.status}`,
        statusData: statusData
      }, { status: 400 })
    }
    
  } catch (error: any) {
    console.error('VM Status Fix error:', error)
    return NextResponse.json({
      success: false,
      error: error.message,
      vm: 'backtest-tradebot (10.160.0.3)'
    }, { status: 500 })
  }
}