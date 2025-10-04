// Debug specific backtest on VM
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
    const backtestId = searchParams.get('id')
    
    if (!backtestId) {
      return NextResponse.json({
        success: false,
        error: 'Backtest ID required'
      }, { status: 400 })
    }

    console.log(`🔍 Debugging backtest ${backtestId} on VM`)
    
    const tests = []
    
    // Test 1: Check status
    try {
      const statusResponse = await fetch(`${BACKTEST_VM_URL}/api/backtest/status/${backtestId}`, {
        method: 'GET',
        signal: AbortSignal.timeout(10000)
      })
      
      tests.push({
        test: 'Status Check',
        url: `${BACKTEST_VM_URL}/api/backtest/status/${backtestId}`,
        status: statusResponse.status,
        success: statusResponse.ok,
        response: statusResponse.ok ? await statusResponse.json() : await statusResponse.text()
      })
    } catch (error: any) {
      tests.push({
        test: 'Status Check',
        url: `${BACKTEST_VM_URL}/api/backtest/status/${backtestId}`,
        success: false,
        error: error.message
      })
    }
    
    // Test 2: Check results
    try {
      const resultResponse = await fetch(`${BACKTEST_VM_URL}/api/backtest/result/${backtestId}`, {
        method: 'GET',
        signal: AbortSignal.timeout(10000)
      })
      
      tests.push({
        test: 'Result Check',
        url: `${BACKTEST_VM_URL}/api/backtest/result/${backtestId}`,
        status: resultResponse.status,
        success: resultResponse.ok,
        response: resultResponse.ok ? await resultResponse.json() : await resultResponse.text()
      })
    } catch (error: any) {
      tests.push({
        test: 'Result Check',
        url: `${BACKTEST_VM_URL}/api/backtest/result/${backtestId}`,
        success: false,
        error: error.message
      })
    }
    
    // Test 3: List all backtests on VM
    try {
      const listResponse = await fetch(`${BACKTEST_VM_URL}/api/backtest/list`, {
        method: 'GET',
        signal: AbortSignal.timeout(10000)
      })
      
      tests.push({
        test: 'List All Backtests',
        url: `${BACKTEST_VM_URL}/api/backtest/list`,
        status: listResponse.status,
        success: listResponse.ok,
        response: listResponse.ok ? await listResponse.json() : await listResponse.text()
      })
    } catch (error: any) {
      tests.push({
        test: 'List All Backtests',
        url: `${BACKTEST_VM_URL}/api/backtest/list`,
        success: false,
        error: error.message
      })
    }
    
    return NextResponse.json({
      success: true,
      backtestId,
      vmUrl: BACKTEST_VM_URL,
      tests,
      debug: {
        timestamp: new Date().toISOString(),
        userId: session.user.email
      }
    })
    
  } catch (error: any) {
    console.error('VM debug error:', error)
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 })
  }
}