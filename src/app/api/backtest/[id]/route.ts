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
        // Try VM first
        console.log(`🔗 Checking status for backtest ${backtestId} from VM`)
        
        const response = await proxyToBacktestVM(`/api/backtest/status/${backtestId}`)
        
        if (!response.ok) {
          throw new Error(`VM status check failed: ${response.status}`)
        }
        
        const data = await response.json()
        console.log(`📊 VM status response:`, data)
        
        return NextResponse.json({
          success: true,
          status: data.status || data,
          usingBacktestVM: true
        })
        
      } catch (vmError: any) {
        console.error(`❌ Failed to get status from VM:`, vmError.message)
        console.log('🔄 Falling back to local database')
        
        // Fallback to local database
        try {
          const localResponse = await fetch(`${request.nextUrl.origin}/api/backtest/local?id=${backtestId}`, {
            method: 'GET',
            headers: {
              'Cookie': request.headers.get('cookie') || ''
            }
          })
          
          if (!localResponse.ok) {
            throw new Error(`Local status check failed: ${localResponse.status}`)
          }
          
          const localData = await localResponse.json()
          console.log(`📊 Local status response:`, localData)
          
          if (localData.success && localData.backtest) {
            return NextResponse.json({
              success: true,
              status: {
                id: localData.backtest.id,
                status: localData.backtest.status,
                progress: localData.backtest.progress || 0
              },
              usingLocalEngine: true,
              vmError: vmError.message
            })
          } else {
            throw new Error('Backtest not found in local database')
          }
        } catch (localError: any) {
          console.error(`❌ Failed to get status from local:`, localError.message)
          return NextResponse.json({
            success: false,
            error: `Backtest status not available. VM: ${vmError.message}, Local: ${localError.message}`,
            backtestId
          }, { status: 404 })
        }
      }
    }
    
    if (type === 'result') {
      try {
        // Try VM first
        console.log(`📈 Fetching results for backtest ${backtestId} from VM`)
        
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
        console.log('🔄 Falling back to local database')
        
        // Fallback to local database
        try {
          const localResponse = await fetch(`${request.nextUrl.origin}/api/backtest/local?id=${backtestId}`, {
            method: 'GET',
            headers: {
              'Cookie': request.headers.get('cookie') || ''
            }
          })
          
          if (!localResponse.ok) {
            throw new Error(`Local result fetch failed: ${localResponse.status}`)
          }
          
          const localData = await localResponse.json()
          console.log(`📈 Local results response:`, localData)
          
          if (localData.success && localData.backtest && localData.backtest.status === 'COMPLETED') {
            // Format results for frontend
            const result = {
              totalReturn: localData.backtest.totalPnL || 0,
              totalReturnPercent: localData.backtest.totalPnL ? 
                ((localData.backtest.totalPnL / (localData.backtest.initialCapital || 100000)) * 100).toFixed(2) : 0,
              winRate: localData.backtest.winRate || 0,
              totalTrades: localData.backtest.totalTrades || 0,
              winningTrades: localData.backtest.winningTrades || 0,
              losingTrades: localData.backtest.losingTrades || 0,
              maxDrawdownPercent: localData.backtest.maxDrawdown || 0,
              finalCapital: localData.backtest.finalCapital || 0,
              sharpeRatio: 0 // Calculate if needed
            }
            
            return NextResponse.json({
              success: true,
              result: result,
              usingLocalEngine: true,
              vmError: vmError.message
            })
          } else {
            throw new Error('Backtest not completed or results not available')
          }
        } catch (localError: any) {
          console.error(`❌ Failed to get results from local:`, localError.message)
          return NextResponse.json({
            success: false,
            error: `Backtest results not available. VM: ${vmError.message}, Local: ${localError.message}`,
            backtestId
          }, { status: 404 })
        }
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