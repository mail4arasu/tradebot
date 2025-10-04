// VM Health Check - No authentication required for debugging
import { NextRequest, NextResponse } from 'next/server'

const BACKTEST_VM_URL = 'http://10.160.0.3:4000'

export async function GET(request: NextRequest) {
  // Bypass auth for health check
  const bypassAuth = request.nextUrl.searchParams.get('bypass') === 'true'
  const backtestId = request.nextUrl.searchParams.get('id') || 'bt_1759576225335_641wfzxv3'
  
  if (!bypassAuth) {
    return NextResponse.json({ error: 'Add ?bypass=true to bypass auth' }, { status: 401 })
  }
  
  const results = {
    backtestId,
    timestamp: new Date().toISOString(),
    tests: []
  }
  
  // Test 1: Health check
  try {
    console.log('🏥 Checking VM health...')
    
    const response = await fetch(`${BACKTEST_VM_URL}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(10000)
    })
    
    const data = await response.json()
    results.tests.push({
      test: 'Health Check',
      success: response.ok,
      status: response.status,
      data
    })
    
  } catch (error: any) {
    results.tests.push({
      test: 'Health Check',
      success: false,
      error: error.message
    })
  }
  
  // Test 2: Results endpoint
  try {
    console.log(`📊 Checking VM results for ${backtestId}...`)
    
    const response = await fetch(`${BACKTEST_VM_URL}/api/backtest/result/${backtestId}`, {
      method: 'GET',
      signal: AbortSignal.timeout(10000)
    })
    
    const data = response.ok ? await response.json() : await response.text()
    results.tests.push({
      test: 'Results Endpoint',
      url: `${BACKTEST_VM_URL}/api/backtest/result/${backtestId}`,
      success: response.ok,
      status: response.status,
      data
    })
    
  } catch (error: any) {
    results.tests.push({
      test: 'Results Endpoint',
      success: false,
      error: error.message
    })
  }
  
  // Test 3: Status endpoint
  try {
    console.log(`📈 Checking VM status for ${backtestId}...`)
    
    const response = await fetch(`${BACKTEST_VM_URL}/api/backtest/status/${backtestId}`, {
      method: 'GET',
      signal: AbortSignal.timeout(10000)
    })
    
    const data = response.ok ? await response.json() : await response.text()
    results.tests.push({
      test: 'Status Endpoint',
      url: `${BACKTEST_VM_URL}/api/backtest/status/${backtestId}`,
      success: response.ok,
      status: response.status,
      data
    })
    
  } catch (error: any) {
    results.tests.push({
      test: 'Status Endpoint',
      success: false,
      error: error.message
    })
  }
  
  return NextResponse.json({
    success: true,
    results,
    summary: results.tests.filter(t => t.success).length + '/' + results.tests.length + ' tests passed'
  })
}