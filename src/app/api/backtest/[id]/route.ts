// Backtest Result API Routes - Get specific backtest details
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '../../../../lib/auth'

const BACKTEST_VM_URL = 'http://10.160.0.3:4000' // Internal IP of Backtest VM

/**
 * Proxy request to Backtest VM
 */
async function proxyToBacktestVM(
  path: string,
  method: string = 'GET',
  body?: any
): Promise<Response> {
  const url = `${BACKTEST_VM_URL}${path}`
  
  try {
    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json'
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(30000) // 30 second timeout
    })
    
    return response
  } catch (error) {
    console.error('Backtest VM communication error:', error)
    throw new Error('Failed to communicate with backtest engine')
  }
}

/**
 * GET /api/backtest/[id] - Get specific backtest details
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const backtestId = params.id
    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type') || 'result'
    
    if (type === 'status') {
      try {
        // Check status from backtest-tradebot VM
        console.log(`🔍 Checking status for backtest ${backtestId} from VM`)
        
        const response = await proxyToBacktestVM(`/api/backtest/status/${backtestId}`)
        
        if (!response.ok) {
          throw new Error(`VM status check failed: ${response.status}`)
        }
        
        const data = await response.json()
        console.log(`📊 VM status response:`, data)
        
        return NextResponse.json({
          success: true,
          status: data.status,
          usingBacktestVM: true
        })
      } catch (vmError: any) {
        console.error(`❌ Failed to get status from VM:`, vmError.message)
        // Don't return 500 - return 404 for not found status
        return NextResponse.json({
          success: false,
          error: `Backtest status not available: ${vmError.message}`,
          vmUrl: BACKTEST_VM_URL,
          backtestId
        }, { status: 404 })
      }
    }
    
    if (type === 'result') {
      try {
        // Get results from backtest-tradebot VM
        console.log(`📊 Fetching results for backtest ${backtestId} from VM`)
        
        const response = await proxyToBacktestVM(`/api/backtest/result/${backtestId}`)
        
        if (!response.ok) {
          throw new Error(`VM result fetch failed: ${response.status}`)
        }
        
        const data = await response.json()
        console.log(`📈 VM results response:`, data)
        
        return NextResponse.json({
          success: true,
          result: data.result,
          usingBacktestVM: true
        })
      } catch (vmError: any) {
        console.error(`❌ Failed to get results from VM:`, vmError.message)
        // Don't return 500 - return 404 for not found results
        return NextResponse.json({
          success: false,
          error: `Backtest results not available: ${vmError.message}`,
          vmUrl: BACKTEST_VM_URL,
          backtestId
        }, { status: 404 })
      }
    }
    
    return NextResponse.json({
      success: false,
      error: 'Invalid type. Use: status, result'
    }, { status: 400 })
    
  } catch (error: any) {
    console.error('Backtest detail API error:', error)
    return NextResponse.json({
      success: false,
      error: error.message || 'Internal server error'
    }, { status: 500 })
  }
}

/**
 * DELETE /api/backtest/[id] - Delete specific backtest
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const backtestId = params.id
    
    // Delete backtest from Backtest VM
    const response = await proxyToBacktestVM(`/api/backtest/${backtestId}`, 'DELETE')
    
    if (!response.ok) {
      const error = await response.json()
      return NextResponse.json({
        success: false,
        error: error.error || 'Failed to delete backtest'
      }, { status: response.status })
    }
    
    const data = await response.json()
    
    return NextResponse.json({
      success: true,
      message: data.message || 'Backtest deleted successfully'
    })
    
  } catch (error: any) {
    console.error('Backtest delete API error:', error)
    return NextResponse.json({
      success: false,
      error: error.message || 'Internal server error'
    }, { status: 500 })
  }
}