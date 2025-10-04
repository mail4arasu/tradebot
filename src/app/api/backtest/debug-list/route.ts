// Debug List Endpoint - Shows exactly what list API returns
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

    console.log('🔍 DEBUG LIST: Starting comprehensive list debug...')
    
    const debug = {
      timestamp: new Date().toISOString(),
      user: session.user.email,
      attempts: []
    }

    // Test 1: VM List Endpoint
    try {
      console.log('🔍 DEBUG LIST: Testing VM list endpoint...')
      const vmResponse = await fetch(`${BACKTEST_VM_URL}/api/backtest/list`, {
        method: 'GET',
        signal: AbortSignal.timeout(10000)
      })
      
      const vmData = vmResponse.ok ? await vmResponse.json() : await vmResponse.text()
      debug.attempts.push({
        endpoint: 'VM List',
        url: `${BACKTEST_VM_URL}/api/backtest/list`,
        status: vmResponse.status,
        success: vmResponse.ok,
        data: vmData,
        dataType: typeof vmData
      })
      
      console.log('🔍 DEBUG LIST: VM response:', vmData)
    } catch (error: any) {
      debug.attempts.push({
        endpoint: 'VM List',
        success: false,
        error: error.message
      })
    }

    // Test 2: Local Database
    try {
      console.log('🔍 DEBUG LIST: Testing local database...')
      const localResponse = await fetch(`${request.nextUrl.origin}/api/backtest/local`, {
        method: 'GET',
        headers: {
          'Cookie': request.headers.get('cookie') || ''
        }
      })
      
      const localData = localResponse.ok ? await localResponse.json() : await localResponse.text()
      debug.attempts.push({
        endpoint: 'Local Database',
        url: `${request.nextUrl.origin}/api/backtest/local`,
        status: localResponse.status,
        success: localResponse.ok,
        data: localData,
        dataType: typeof localData
      })
      
      console.log('🔍 DEBUG LIST: Local response:', localData)
    } catch (error: any) {
      debug.attempts.push({
        endpoint: 'Local Database',
        success: false,
        error: error.message
      })
    }

    // Test 3: Main List API
    try {
      console.log('🔍 DEBUG LIST: Testing main list API...')
      const mainResponse = await fetch(`${request.nextUrl.origin}/api/backtest?action=list`, {
        method: 'GET',
        headers: {
          'Cookie': request.headers.get('cookie') || ''
        }
      })
      
      const mainData = mainResponse.ok ? await mainResponse.json() : await mainResponse.text()
      debug.attempts.push({
        endpoint: 'Main List API',
        url: `${request.nextUrl.origin}/api/backtest?action=list`,
        status: mainResponse.status,
        success: mainResponse.ok,
        data: mainData,
        dataType: typeof mainData
      })
      
      console.log('🔍 DEBUG LIST: Main API response:', mainData)
    } catch (error: any) {
      debug.attempts.push({
        endpoint: 'Main List API',
        success: false,
        error: error.message
      })
    }

    return NextResponse.json({
      success: true,
      debug: debug,
      summary: {
        totalAttempts: debug.attempts.length,
        successfulAttempts: debug.attempts.filter(a => a.success).length,
        failedAttempts: debug.attempts.filter(a => !a.success).length
      }
    })

  } catch (error: any) {
    console.error('🔍 DEBUG LIST: Error:', error)
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 })
  }
}