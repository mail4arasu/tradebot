// Manual result fetcher for completed backtests
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

    const body = await request.json()
    const { backtestId } = body

    if (!backtestId) {
      return NextResponse.json({
        success: false,
        error: 'Backtest ID required'
      }, { status: 400 })
    }

    console.log(`🔍 Manual result fetch for: ${backtestId}`)

    // Try multiple approaches to get results
    const results = {
      backtestId,
      timestamp: new Date().toISOString(),
      attempts: []
    }

    // Attempt 1: VM result endpoint
    try {
      console.log(`📊 Trying VM result endpoint...`)
      const vmResponse = await fetch(`${BACKTEST_VM_URL}/api/backtest/result/${backtestId}`, {
        method: 'GET',
        signal: AbortSignal.timeout(10000)
      })
      
      const vmData = vmResponse.ok ? await vmResponse.json() : await vmResponse.text()
      results.attempts.push({
        method: 'VM Result Endpoint',
        url: `${BACKTEST_VM_URL}/api/backtest/result/${backtestId}`,
        status: vmResponse.status,
        success: vmResponse.ok,
        data: vmData
      })

      if (vmResponse.ok && vmData.result) {
        console.log(`✅ Got results from VM:`, vmData.result)
        return NextResponse.json({
          success: true,
          source: 'VM Direct',
          backtestId,
          result: vmData.result,
          rawData: vmData
        })
      }
    } catch (error: any) {
      results.attempts.push({
        method: 'VM Result Endpoint',
        success: false,
        error: error.message
      })
    }

    // Attempt 2: VM status endpoint (sometimes has results embedded)
    try {
      console.log(`📊 Trying VM status endpoint...`)
      const statusResponse = await fetch(`${BACKTEST_VM_URL}/api/backtest/status/${backtestId}`, {
        method: 'GET',
        signal: AbortSignal.timeout(10000)
      })
      
      const statusData = statusResponse.ok ? await statusResponse.json() : await statusResponse.text()
      results.attempts.push({
        method: 'VM Status Endpoint',
        url: `${BACKTEST_VM_URL}/api/backtest/status/${backtestId}`,
        status: statusResponse.status,
        success: statusResponse.ok,
        data: statusData
      })

      if (statusResponse.ok && statusData.status && statusData.status.result) {
        console.log(`✅ Got results from VM status:`, statusData.status.result)
        return NextResponse.json({
          success: true,
          source: 'VM Status',
          backtestId,
          result: statusData.status.result,
          rawData: statusData
        })
      }
    } catch (error: any) {
      results.attempts.push({
        method: 'VM Status Endpoint',
        success: false,
        error: error.message
      })
    }

    // Attempt 3: VM list endpoint (check if backtest appears there with results)
    try {
      console.log(`📊 Trying VM list endpoint...`)
      const listResponse = await fetch(`${BACKTEST_VM_URL}/api/backtest/list`, {
        method: 'GET',
        signal: AbortSignal.timeout(10000)
      })
      
      const listData = listResponse.ok ? await listResponse.json() : await listResponse.text()
      results.attempts.push({
        method: 'VM List Endpoint',
        url: `${BACKTEST_VM_URL}/api/backtest/list`,
        status: listResponse.status,
        success: listResponse.ok,
        data: listData
      })

      if (listResponse.ok && listData.backtests) {
        const foundBacktest = listData.backtests.find((bt: any) => bt.id === backtestId || bt.backtestId === backtestId)
        if (foundBacktest && foundBacktest.result) {
          console.log(`✅ Got results from VM list:`, foundBacktest.result)
          return NextResponse.json({
            success: true,
            source: 'VM List',
            backtestId,
            result: foundBacktest.result,
            rawData: foundBacktest
          })
        }
      }
    } catch (error: any) {
      results.attempts.push({
        method: 'VM List Endpoint',
        success: false,
        error: error.message
      })
    }

    // No results found
    return NextResponse.json({
      success: false,
      message: 'No results found in any VM endpoint',
      backtestId,
      allAttempts: results.attempts,
      suggestion: 'Backtest may still be processing or results not available'
    })

  } catch (error: any) {
    console.error('Manual result fetch error:', error)
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 })
  }
}