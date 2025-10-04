// Test connectivity to backtest-tradebot VM
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '../../../../lib/auth'

const BACKTEST_VM_URL = 'http://10.160.0.3:4000' // backtest-tradebot VM

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    console.log(`🧪 Testing connectivity to backtest-tradebot VM at ${BACKTEST_VM_URL}`)
    
    const tests = []
    
    // Test 1: Basic health check
    try {
      const healthResponse = await fetch(`${BACKTEST_VM_URL}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(10000)
      })
      
      tests.push({
        test: 'Health Check',
        url: `${BACKTEST_VM_URL}/health`,
        status: healthResponse.status,
        success: healthResponse.ok,
        response: healthResponse.ok ? await healthResponse.json() : await healthResponse.text()
      })
    } catch (error: any) {
      tests.push({
        test: 'Health Check',
        url: `${BACKTEST_VM_URL}/health`,
        success: false,
        error: error.message,
        code: error.code
      })
    }
    
    // Test 2: Backtest API availability
    try {
      const apiResponse = await fetch(`${BACKTEST_VM_URL}/api/backtest/status`, {
        method: 'GET',
        signal: AbortSignal.timeout(10000)
      })
      
      tests.push({
        test: 'Backtest API',
        url: `${BACKTEST_VM_URL}/api/backtest/status`,
        status: apiResponse.status,
        success: apiResponse.ok || apiResponse.status === 404, // 404 is ok for status endpoint
        response: apiResponse.ok ? await apiResponse.json() : await apiResponse.text()
      })
    } catch (error: any) {
      tests.push({
        test: 'Backtest API',
        url: `${BACKTEST_VM_URL}/api/backtest/status`,
        success: false,
        error: error.message,
        code: error.code
      })
    }
    
    // Summary
    const allSuccess = tests.every(t => t.success)
    
    return NextResponse.json({
      success: allSuccess,
      vmUrl: BACKTEST_VM_URL,
      vmHost: 'backtest-tradebot',
      vmZone: 'asia-south1-c',
      tests,
      summary: {
        total: tests.length,
        passed: tests.filter(t => t.success).length,
        failed: tests.filter(t => !t.success).length
      },
      recommendation: allSuccess ? 
        'VM is accessible and ready for backtests' : 
        'VM connection issues detected. Check if backtest-tradebot VM is running.'
    })
    
  } catch (error: any) {
    console.error('VM test error:', error)
    return NextResponse.json({
      success: false,
      error: error.message,
      vmUrl: BACKTEST_VM_URL
    }, { status: 500 })
  }
}