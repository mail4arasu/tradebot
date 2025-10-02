// Backtest API Routes - Main Production VM
// Proxy requests to Backtest VM

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '../../lib/auth'

const BACKTEST_VM_URL = 'http://10.128.0.3:4000' // Internal IP of Backtest VM

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
  
  try {
    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
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
      const response = await proxyToBacktestVM('/health')
      const data = await response.json()
      
      return NextResponse.json({
        success: true,
        backtestEngine: data
      })
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
      // List user's backtests
      const response = await proxyToBacktestVM('/api/backtest/list')
      const data = await response.json()
      
      return NextResponse.json({
        success: true,
        backtests: data.backtests || []
      })
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
      // Start new backtest
      const backtestParams = {
        botId: params.botId || 'nifty50-futures-bot',
        startDate: new Date(params.startDate),
        endDate: new Date(params.endDate),
        initialCapital: params.initialCapital || 500000,
        lotSize: params.lotSize || 25,
        useStratFilter: params.useStratFilter !== false,
        useGaussianFilter: params.useGaussianFilter !== false,
        useFibEntry: params.useFibEntry !== false,
        maxBulletsPerDay: params.maxBulletsPerDay || 1,
        takeProfitPercent: params.takeProfitPercent,
        useStratStops: params.useStratStops !== false,
        timezone: params.timezone || 'Asia/Kolkata'
      }
      
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
      
      // Start backtest on Backtest VM
      const response = await proxyToBacktestVM(
        '/api/backtest/start',
        'POST',
        { params: backtestParams }
      )
      
      const data = await response.json()
      
      return NextResponse.json({
        success: data.success,
        backtestId: data.backtestId,
        message: data.message,
        parameters: backtestParams
      })
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