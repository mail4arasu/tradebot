// Test backtest data persistence 
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '../../../../lib/auth'

const BACKTEST_VM_URL = 'http://10.160.0.3:4000'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    console.log('🧪 Testing backtest persistence...')
    
    const results = {
      timestamp: new Date().toISOString(),
      tests: []
    }

    // Shorter timeouts to avoid "fetch failed"
    const SHORT_TIMEOUT = 5000 // 5 seconds instead of 10-30

    // Test 1: Start VM backtest with minimal data range
    try {
      console.log('🔄 Starting VM backtest...')
      const vmStartResponse = await fetch(`${BACKTEST_VM_URL}/api/backtest/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          params: {
            botId: 'test-persistence-vm',
            startDate: '2024-01-01',
            endDate: '2024-01-02', // Just 1 day for quick test
            initialCapital: 100000,
            lotSize: 25
          }
        }),
        signal: AbortSignal.timeout(SHORT_TIMEOUT)
      })
      
      const vmStartData = vmStartResponse.ok ? await vmStartResponse.json() : await vmStartResponse.text()
      results.tests.push({
        test: 'VM Backtest Start',
        success: vmStartResponse.ok,
        response: vmStartData,
        backtestId: vmStartData.backtestId || null
      })
    } catch (error: any) {
      results.tests.push({
        test: 'VM Backtest Start',
        success: false,
        error: error.message
      })
    }

    // Test 2: Start local backtest with minimal data range  
    try {
      console.log('🔄 Starting local backtest...')
      const localStartResponse = await fetch(`${request.nextUrl.origin}/api/backtest/local`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Cookie': request.headers.get('cookie') || ''
        },
        body: JSON.stringify({
          startDate: '2024-01-01',
          endDate: '2024-01-02', // Just 1 day for quick test
          initialCapital: 100000,
          symbol: 'NIFTY'
        })
      })
      
      const localStartData = await localStartResponse.json()
      results.tests.push({
        test: 'Local Backtest Start', 
        success: localStartResponse.ok,
        response: localStartData,
        backtestId: localStartData.backtestId || null
      })
    } catch (error: any) {
      results.tests.push({
        test: 'Local Backtest Start',
        success: false,
        error: error.message
      })
    }

    // Wait a moment for backtests to process
    console.log('⏳ Waiting 3 seconds for processing...')
    await new Promise(resolve => setTimeout(resolve, 3000))

    // Test 3: Check if VM shows the new backtest
    try {
      const vmListResponse = await fetch(`${BACKTEST_VM_URL}/api/backtest/list`, {
        method: 'GET',
        signal: AbortSignal.timeout(10000)
      })
      
      const vmListData = await vmListResponse.json()
      results.tests.push({
        test: 'VM List After Start',
        success: vmListResponse.ok,
        response: vmListData,
        analysis: {
          count: vmListData.backtests ? vmListData.backtests.length : 0,
          hasNewBacktest: vmListData.backtests && vmListData.backtests.length > 0
        }
      })
    } catch (error: any) {
      results.tests.push({
        test: 'VM List After Start',
        success: false,
        error: error.message
      })
    }

    // Test 4: Check if local shows the new backtest
    try {
      const localListResponse = await fetch(`${request.nextUrl.origin}/api/backtest/local`, {
        method: 'GET',
        headers: {
          'Cookie': request.headers.get('cookie') || ''
        }
      })
      
      const localListData = await localListResponse.json()
      results.tests.push({
        test: 'Local List After Start',
        success: localListResponse.ok,
        response: localListData,
        analysis: {
          count: localListData.backtests ? localListData.backtests.length : 0,
          hasNewBacktest: localListData.backtests && localListData.backtests.length > 0
        }
      })
    } catch (error: any) {
      results.tests.push({
        test: 'Local List After Start',
        success: false,
        error: error.message
      })
    }

    // Test 5: Check portal database directly
    try {
      const dbCheckResponse = await fetch(`${request.nextUrl.origin}/api/backtest/check-db`, {
        method: 'GET',
        headers: {
          'Cookie': request.headers.get('cookie') || ''
        }
      })
      
      const dbCheckData = await dbCheckResponse.json()
      results.tests.push({
        test: 'Portal Database Check',
        success: dbCheckResponse.ok,
        response: dbCheckData,
        analysis: {
          totalFound: dbCheckData.totalFound || 0,
          hasBacktests: dbCheckData.totalFound > 0
        }
      })
    } catch (error: any) {
      results.tests.push({
        test: 'Portal Database Check',
        success: false,
        error: error.message
      })
    }

    // Analysis
    const vmStarted = results.tests.find(t => t.test === 'VM Backtest Start')?.success
    const localStarted = results.tests.find(t => t.test === 'Local Backtest Start')?.success
    const vmShows = results.tests.find(t => t.test === 'VM List After Start')?.analysis?.hasNewBacktest
    const localShows = results.tests.find(t => t.test === 'Local List After Start')?.analysis?.hasNewBacktest
    const dbHas = results.tests.find(t => t.test === 'Portal Database Check')?.analysis?.hasBacktests

    return NextResponse.json({
      success: true,
      results,
      analysis: {
        vmCanStart: vmStarted,
        localCanStart: localStarted,
        vmShowsBacktests: vmShows,
        localShowsBacktests: localShows,
        databaseHasBacktests: dbHas,
        diagnosis: !vmShows && !localShows ? 
          'PERSISTENCE ISSUE: Both engines start backtests but don\'t show them in lists' :
          vmShows && localShows ?
          'WORKING: Both engines properly persist and show backtests' :
          vmShows ?
          'VM_WORKS: VM persists, local has issues' :
          localShows ?
          'LOCAL_WORKS: Local persists, VM has issues' :
          'UNKNOWN: Investigation needed'
      }
    })
    
  } catch (error: any) {
    console.error('Persistence test error:', error)
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 })
  }
}