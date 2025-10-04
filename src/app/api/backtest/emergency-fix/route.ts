// Emergency fix for backtest API errors
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
    const action = searchParams.get('action')
    const backtestId = searchParams.get('id')

    console.log(`🩹 Emergency fix - Action: ${action}, ID: ${backtestId}`)

    if (action === 'check-specific' && backtestId) {
      // Check a specific backtest that was seen in console logs
      const results = {
        timestamp: new Date().toISOString(),
        backtestId,
        checks: []
      }

      // Check VM status
      try {
        const vmStatusResponse = await fetch(`${BACKTEST_VM_URL}/api/backtest/status/${backtestId}`, {
          method: 'GET',
          signal: AbortSignal.timeout(5000)
        })
        
        results.checks.push({
          test: 'VM Status Check',
          url: `${BACKTEST_VM_URL}/api/backtest/status/${backtestId}`,
          status: vmStatusResponse.status,
          success: vmStatusResponse.ok,
          response: vmStatusResponse.ok ? await vmStatusResponse.json() : await vmStatusResponse.text()
        })
      } catch (error: any) {
        results.checks.push({
          test: 'VM Status Check',
          success: false,
          error: error.message
        })
      }

      // Check VM results
      try {
        const vmResultResponse = await fetch(`${BACKTEST_VM_URL}/api/backtest/result/${backtestId}`, {
          method: 'GET',
          signal: AbortSignal.timeout(5000)
        })
        
        results.checks.push({
          test: 'VM Result Check',
          url: `${BACKTEST_VM_URL}/api/backtest/result/${backtestId}`,
          status: vmResultResponse.status,
          success: vmResultResponse.ok,
          response: vmResultResponse.ok ? await vmResultResponse.json() : await vmResultResponse.text()
        })
      } catch (error: any) {
        results.checks.push({
          test: 'VM Result Check',
          success: false,
          error: error.message
        })
      }

      // Check portal API endpoint that's failing
      try {
        const portalResponse = await fetch(`${request.nextUrl.origin}/api/backtest/${backtestId}?type=result`, {
          method: 'GET',
          headers: {
            'Cookie': request.headers.get('cookie') || ''
          }
        })
        
        results.checks.push({
          test: 'Portal API Check',
          url: `/api/backtest/${backtestId}?type=result`,
          status: portalResponse.status,
          success: portalResponse.ok,
          response: portalResponse.ok ? await portalResponse.json() : await portalResponse.text()
        })
      } catch (error: any) {
        results.checks.push({
          test: 'Portal API Check',
          success: false,
          error: error.message
        })
      }

      return NextResponse.json({
        success: true,
        results
      })
    }

    if (action === 'force-result' && backtestId) {
      // Try to force-fetch result directly from VM and return it
      try {
        const vmResultResponse = await fetch(`${BACKTEST_VM_URL}/api/backtest/result/${backtestId}`, {
          method: 'GET',
          signal: AbortSignal.timeout(10000)
        })
        
        if (vmResultResponse.ok) {
          const vmData = await vmResultResponse.json()
          return NextResponse.json({
            success: true,
            source: 'VM Direct',
            backtestId,
            result: vmData.result || vmData,
            rawResponse: vmData
          })
        } else {
          return NextResponse.json({
            success: false,
            source: 'VM Direct',
            backtestId,
            error: `VM returned ${vmResultResponse.status}: ${await vmResultResponse.text()}`
          })
        }
      } catch (error: any) {
        return NextResponse.json({
          success: false,
          source: 'VM Direct',
          backtestId,
          error: error.message
        })
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Emergency fix endpoint',
      availableActions: [
        'check-specific?id=BACKTEST_ID - Check specific backtest',
        'force-result?id=BACKTEST_ID - Force fetch result directly'
      ]
    })
    
  } catch (error: any) {
    console.error('Emergency fix error:', error)
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 })
  }
}