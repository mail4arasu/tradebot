// Backtest API Routes - Main Production VM
// Proxy requests to Backtest VM

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '../../../lib/auth'

const BACKTEST_VM_URL = 'http://10.160.0.3:4000' // Internal IP of Backtest VM

/**
 * Proxy request to Backtest VM
 */
async function proxyToBacktestVM(
  path: string,
  method: string = 'GET',
  body?: any,
  headers?: Record<string, string>
): Promise<Response> {
  const url = `${BACKTEST_VM_URL}${path}`
  
  console.log(`🔗 Connecting to backtest VM: ${url}`)
  console.log(`📝 Method: ${method}, Body:`, body ? JSON.stringify(body, null, 2) : 'None')
  
  try {
    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(60000) // Increased to 60 second timeout
    })
    
    console.log(`📡 VM Response: ${response.status} ${response.statusText}`)
    return response
  } catch (error: any) {
    console.error('❌ Backtest VM communication error:', {
      url,
      method,
      error: error.message,
      code: error.code,
      cause: error.cause
    })
    throw new Error(`Failed to communicate with backtest-tradebot VM at ${BACKTEST_VM_URL}: ${error.message}`)
  }
}

/**
 * GET /api/backtest - Get backtest status and available operations
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const action = searchParams.get('action')
    
    if (action === 'health') {
      // Check backtest engine health
      try {
        const response = await proxyToBacktestVM('/health')
        const data = await response.json()
        
        return NextResponse.json({
          success: true,
          backtestEngine: data,
          usingExternalVM: true
        })
      } catch (vmError) {
        console.log('External VM not available, using local backtest engine')
        
        // Fallback to local implementation
        return NextResponse.json({
          success: true,
          backtestEngine: {
            status: 'healthy',
            engine: 'local',
            message: 'Local backtest engine is available'
          },
          usingLocalEngine: true
        })
      }
    }
    
    if (action === 'status') {
      // Get overall backtest status
      const response = await proxyToBacktestVM('/api/backtest/status')
      const data = await response.json()
      
      return NextResponse.json({
        success: true,
        ...data
      })
    }
    
    if (action === 'list') {
      // Try VM first, fallback to local
      try {
        console.log('🔗 Fetching backtests from VM')
        const response = await proxyToBacktestVM('/api/backtest/list')
        const data = await response.json()
        
        return NextResponse.json({
          success: data.success,
          backtests: data.backtests || [],
          usingBacktestVM: true
        })
      } catch (vmError) {
        console.log('🔄 VM inaccessible - fetching backtests from local database')
        
        const localResponse = await fetch(`${request.nextUrl.origin}/api/backtest/local`, {
          method: 'GET',
          headers: {
            'Cookie': request.headers.get('cookie') || ''
          }
        })
        
        const localData = await localResponse.json()
        
        return NextResponse.json({
          success: localData.success,
          backtests: localData.backtests || [],
          usingLocalEngine: true,
          vmError: vmError.message
        })
      }
    }
    
    // Default: return available operations
    return NextResponse.json({
      success: true,
      message: 'Backtest API is ready',
      availableActions: [
        'health - Check backtest engine health',
        'status - Get overall backtest status', 
        'list - List user backtests',
        'Use POST to start new backtests'
      ]
    })
    
  } catch (error: any) {
    console.error('Backtest API error:', error)
    return NextResponse.json({
      success: false,
      error: error.message || 'Internal server error'
    }, { status: 500 })
  }
}

/**
 * POST /api/backtest - Start new backtest or perform backtest operations
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { action, ...params } = body
    
    if (action === 'start') {
      // Validate parameters
      if (!params.startDate || !params.endDate) {
        return NextResponse.json({
          success: false,
          error: 'Start date and end date are required'
        }, { status: 400 })
      }
      
      if (new Date(params.endDate) <= new Date(params.startDate)) {
        return NextResponse.json({
          success: false,
          error: 'End date must be after start date'
        }, { status: 400 })
      }

      try {
        // Try backtest-tradebot VM first
        console.log('🔗 Starting backtest on VM')
        
        const vmParams = {
          action: 'start',
          startDate: params.startDate,
          endDate: params.endDate,
          initialCapital: params.initialCapital || 500000,
          symbol: 'NIFTY50-FUT',
          timeframe: '5min',
          strategy: 'opening_breakout'
        }
        
        console.log('📊 VM backtest params:', vmParams)
        
        const response = await proxyToBacktestVM(
          '/api/backtest',
          'POST',
          vmParams
        )
        
        if (!response.ok) {
          throw new Error(`VM backtest failed: ${response.status} ${response.statusText}`)
        }
        
        const data = await response.json()
        console.log('✅ VM backtest response:', data)
        
        return NextResponse.json({
          success: data.success,
          backtestId: data.backtestId,
          message: data.message || 'Backtest started on VM',
          parameters: vmParams,
          usingBacktestVM: true
        })
        
      } catch (vmError: any) {
        console.error('❌ VM backtest failed:', vmError.message)
        console.log('🔄 Falling back to local backtest engine')
        
        // Fallback to local implementation
        try {
          const localParams = {
            startDate: params.startDate,
            endDate: params.endDate,
            initialCapital: params.initialCapital || 500000,
            symbol: 'NIFTY'
          }
          
          console.log('📊 Starting local backtest:', localParams)
          
          // Direct local implementation instead of internal fetch
          const localBacktestModule = await import('./local/route')
          const localRequest = new Request(request.url, {
            method: 'POST',
            headers: request.headers,
            body: JSON.stringify(localParams)
          })
          
          const localResponse = await localBacktestModule.POST(localRequest)
          
          if (!localResponse.ok) {
            const errorText = await localResponse.text()
            throw new Error(`Local backtest failed: ${localResponse.status} - ${errorText}`)
          }
          
          const localData = await localResponse.json()
          console.log('✅ Local backtest response:', localData)
          
          return NextResponse.json({
            success: localData.success,
            backtestId: localData.backtestId,
            message: localData.message || 'Backtest started using local engine (VM unavailable)',
            parameters: localParams,
            usingLocalEngine: true,
            vmError: vmError.message
          })
          
        } catch (localError: any) {
          console.error('❌ Local backtest also failed:', localError.message)
          
          return NextResponse.json({
            success: false,
            error: `Both VM and local backtest failed. VM: ${vmError.message}, Local: ${localError.message}`,
            suggestion: 'Neither backtest engine is available'
          }, { status: 500 })
        }
      }
    }
    
    if (action === 'sync-data') {
      // Sync historical data
      const response = await proxyToBacktestVM(
        '/api/data/sync',
        'POST',
        {
          symbol: params.symbol || 'NIFTY50-FUT',
          startDate: params.startDate,
          endDate: params.endDate,
          timeframe: params.timeframe || '5min'
        }
      )
      
      const data = await response.json()
      
      return NextResponse.json({
        success: data.success,
        syncId: data.result?.syncId,
        message: data.result?.message || data.error
      })
    }
    
    return NextResponse.json({
      success: false,
      error: 'Invalid action. Use: start, sync-data'
    }, { status: 400 })
    
  } catch (error: any) {
    console.error('Backtest POST error:', error)
    return NextResponse.json({
      success: false,
      error: error.message || 'Internal server error'
    }, { status: 500 })
  }
}

/**
 * PUT /api/backtest - Update backtest or manage running backtests
 */
export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { backtestId, action } = body
    
    if (!backtestId) {
      return NextResponse.json({
        success: false,
        error: 'Backtest ID is required'
      }, { status: 400 })
    }
    
    if (action === 'stop') {
      // Stop running backtest (if supported)
      return NextResponse.json({
        success: false,
        error: 'Stop functionality not yet implemented'
      }, { status: 501 })
    }
    
    return NextResponse.json({
      success: false,
      error: 'Invalid action'
    }, { status: 400 })
    
  } catch (error: any) {
    console.error('Backtest PUT error:', error)
    return NextResponse.json({
      success: false,
      error: error.message || 'Internal server error'
    }, { status: 500 })
  }
}

/**
 * DELETE /api/backtest - Delete backtest results
 */
export async function DELETE(request: NextRequest) {
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
        error: 'Backtest ID is required'
      }, { status: 400 })
    }
    
    // Delete backtest from Backtest VM
    const response = await proxyToBacktestVM(`/api/backtest/${backtestId}`, 'DELETE')
    const data = await response.json()
    
    return NextResponse.json({
      success: data.success,
      message: data.message || 'Backtest deleted successfully'
    })
    
  } catch (error: any) {
    console.error('Backtest DELETE error:', error)
    return NextResponse.json({
      success: false,
      error: error.message || 'Internal server error'
    }, { status: 500 })
  }
}