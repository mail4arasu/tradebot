// Quick test endpoint accessible via URL
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '../../../../lib/auth'

const BACKTEST_VM_URL = 'http://10.160.0.3:4000'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const backtestId = searchParams.get('id') || 'bt_1759574778009_3721hpGgw'

    console.log(`🔧 Quick test for backtest: ${backtestId}`)

    const results = {
      backtestId,
      timestamp: new Date().toISOString(),
      tests: []
    }

    // Test 1: VM result endpoint
    try {
      const resultResponse = await fetch(`${BACKTEST_VM_URL}/api/backtest/result/${backtestId}`, {
        method: 'GET',
        signal: AbortSignal.timeout(8000)
      })
      
      const resultData = resultResponse.ok ? await resultResponse.json() : await resultResponse.text()
      results.tests.push({
        test: 'VM Result Endpoint',
        url: `${BACKTEST_VM_URL}/api/backtest/result/${backtestId}`,
        status: resultResponse.status,
        success: resultResponse.ok,
        data: resultData
      })
    } catch (error: any) {
      results.tests.push({
        test: 'VM Result Endpoint',
        success: false,
        error: error.message
      })
    }

    // Test 2: VM status endpoint
    try {
      const statusResponse = await fetch(`${BACKTEST_VM_URL}/api/backtest/status/${backtestId}`, {
        method: 'GET',
        signal: AbortSignal.timeout(8000)
      })
      
      const statusData = statusResponse.ok ? await statusResponse.json() : await statusResponse.text()
      results.tests.push({
        test: 'VM Status Endpoint',
        url: `${BACKTEST_VM_URL}/api/backtest/status/${backtestId}`,
        status: statusResponse.status,
        success: statusResponse.ok,
        data: statusData
      })
    } catch (error: any) {
      results.tests.push({
        test: 'VM Status Endpoint',
        success: false,
        error: error.message
      })
    }

    // Test 3: VM list endpoint
    try {
      const listResponse = await fetch(`${BACKTEST_VM_URL}/api/backtest/list`, {
        method: 'GET',
        signal: AbortSignal.timeout(8000)
      })
      
      const listData = listResponse.ok ? await listResponse.json() : await listResponse.text()
      results.tests.push({
        test: 'VM List Endpoint',
        url: `${BACKTEST_VM_URL}/api/backtest/list`,
        status: listResponse.status,
        success: listResponse.ok,
        data: listData,
        foundBacktest: listData.backtests ? listData.backtests.find((bt: any) => 
          bt.id === backtestId || bt.backtestId === backtestId
        ) : null
      })
    } catch (error: any) {
      results.tests.push({
        test: 'VM List Endpoint',
        success: false,
        error: error.message
      })
    }

    // Analysis
    const hasResults = results.tests.some(test => 
      test.success && test.data && 
      (test.data.result || (test.data.status && test.data.status.result) || test.foundBacktest)
    )

    return NextResponse.json({
      success: true,
      backtestId,
      hasResults,
      results,
      summary: hasResults ? 
        '✅ Results found in VM!' : 
        '❌ No results found in any VM endpoint',
      nextStep: hasResults ?
        'Results are available - need to fix automatic fetching' :
        'VM has no results - recommend switching to local backtest engine'
    })

  } catch (error: any) {
    console.error('Quick test error:', error)
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 })
  }
}