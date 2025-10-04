// Deep debugging for backtest system
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

    console.log('🔍 Starting deep debugging of backtest system...')
    
    const diagnostics = {
      timestamp: new Date().toISOString(),
      user: session.user.email,
      tests: []
    }

    // Test 1: VM Health and Info
    try {
      const healthResponse = await fetch(`${BACKTEST_VM_URL}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(10000)
      })
      
      diagnostics.tests.push({
        test: 'VM Health Check',
        status: healthResponse.status,
        success: healthResponse.ok,
        response: healthResponse.ok ? await healthResponse.json() : await healthResponse.text()
      })
    } catch (error: any) {
      diagnostics.tests.push({
        test: 'VM Health Check',
        success: false,
        error: error.message
      })
    }

    // Test 2: Check if VM has any backtests at all
    try {
      const listResponse = await fetch(`${BACKTEST_VM_URL}/api/backtest/list`, {
        method: 'GET',
        signal: AbortSignal.timeout(10000)
      })
      
      const listData = await listResponse.json()
      diagnostics.tests.push({
        test: 'VM Backtest List (All)',
        status: listResponse.status,
        success: listResponse.ok,
        response: listData,
        analysis: {
          backtestCount: listData.backtests ? listData.backtests.length : 0,
          isEmpty: !listData.backtests || listData.backtests.length === 0
        }
      })
    } catch (error: any) {
      diagnostics.tests.push({
        test: 'VM Backtest List (All)',
        success: false,
        error: error.message
      })
    }

    // Test 3: Try to start a minimal backtest to see what happens
    try {
      const startResponse = await fetch(`${BACKTEST_VM_URL}/api/backtest/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          params: {
            botId: 'test-bot',
            startDate: '2024-01-01',
            endDate: '2024-01-02',
            initialCapital: 100000,
            lotSize: 25
          }
        }),
        signal: AbortSignal.timeout(15000)
      })
      
      const startData = startResponse.ok ? await startResponse.json() : await startResponse.text()
      diagnostics.tests.push({
        test: 'VM Backtest Start (Test)',
        status: startResponse.status,
        success: startResponse.ok,
        response: startData
      })
    } catch (error: any) {
      diagnostics.tests.push({
        test: 'VM Backtest Start (Test)',
        success: false,
        error: error.message
      })
    }

    // Test 4: Check VM database/storage status
    try {
      const dbResponse = await fetch(`${BACKTEST_VM_URL}/api/debug/database`, {
        method: 'GET',
        signal: AbortSignal.timeout(10000)
      })
      
      if (dbResponse.status !== 404) {
        const dbData = dbResponse.ok ? await dbResponse.json() : await dbResponse.text()
        diagnostics.tests.push({
          test: 'VM Database Status',
          status: dbResponse.status,
          success: dbResponse.ok,
          response: dbData
        })
      } else {
        diagnostics.tests.push({
          test: 'VM Database Status',
          status: 404,
          success: false,
          note: 'Database debug endpoint not available'
        })
      }
    } catch (error: any) {
      diagnostics.tests.push({
        test: 'VM Database Status',
        success: false,
        error: error.message
      })
    }

    // Test 5: Check portal's local backtest capability
    try {
      const localHealthResponse = await fetch(`${request.nextUrl.origin}/api/backtest?action=health`, {
        method: 'GET',
        headers: {
          'Cookie': request.headers.get('cookie') || ''
        }
      })
      
      const localHealthData = await localHealthResponse.json()
      diagnostics.tests.push({
        test: 'Portal Local Backtest Health',
        status: localHealthResponse.status,
        success: localHealthResponse.ok,
        response: localHealthData
      })
    } catch (error: any) {
      diagnostics.tests.push({
        test: 'Portal Local Backtest Health',
        success: false,
        error: error.message
      })
    }

    // Analysis
    const vmHealthy = diagnostics.tests.find(t => t.test === 'VM Health Check')?.success || false
    const vmHasBacktests = diagnostics.tests.find(t => t.test === 'VM Backtest List (All)')?.response?.backtests?.length > 0
    const vmCanStart = diagnostics.tests.find(t => t.test === 'VM Backtest Start (Test)')?.success || false
    const localAvailable = diagnostics.tests.find(t => t.test === 'Portal Local Backtest Health')?.success || false

    diagnostics.analysis = {
      vmHealthy,
      vmHasBacktests,
      vmCanStart,
      localAvailable,
      recommendation: vmHealthy && vmCanStart ? 
        'VM is working but may have empty database - investigate VM persistence' :
        localAvailable ? 
        'VM has issues - recommend using local backtest engine' :
        'Both VM and local engines have issues - investigate further'
    }

    return NextResponse.json({
      success: true,
      diagnostics
    })
    
  } catch (error: any) {
    console.error('Deep debug error:', error)
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 })
  }
}