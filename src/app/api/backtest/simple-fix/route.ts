// Simple fix: Make backtest results display properly
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
    const { action } = body

    if (action === 'fix-frontend') {
      // The real solution: Update frontend to track backtests in memory
      // and periodically check for results rather than relying on list endpoints
      
      return NextResponse.json({
        success: true,
        solution: {
          problem: "Both VM and local engines start backtests but don't persist them in list endpoints",
          fix: "Update frontend to track running backtests in localStorage and poll for results directly",
          implementation: [
            "1. Store backtest IDs in localStorage when started",
            "2. Poll each stored ID for status/results directly", 
            "3. Remove from localStorage when completed",
            "4. Display results immediately when found"
          ]
        }
      })
    }

    if (action === 'test-simple-vm') {
      // Test just VM connectivity without complex operations
      try {
        const healthResponse = await fetch(`${BACKTEST_VM_URL}/health`, {
          method: 'GET',
          signal: AbortSignal.timeout(3000)
        })
        
        return NextResponse.json({
          success: true,
          vmHealth: {
            accessible: healthResponse.ok,
            status: healthResponse.status,
            response: healthResponse.ok ? await healthResponse.json() : 'Failed'
          }
        })
      } catch (error: any) {
        return NextResponse.json({
          success: true,
          vmHealth: {
            accessible: false,
            error: error.message
          }
        })
      }
    }

    if (action === 'test-simple-local') {
      // Test just local database without starting backtests
      try {
        const dbResponse = await fetch(`${request.nextUrl.origin}/api/backtest/check-db`, {
          method: 'GET',
          headers: {
            'Cookie': request.headers.get('cookie') || ''
          }
        })
        
        const dbData = await dbResponse.json()
        return NextResponse.json({
          success: true,
          localDb: {
            accessible: dbResponse.ok,
            data: dbData
          }
        })
      } catch (error: any) {
        return NextResponse.json({
          success: true,
          localDb: {
            accessible: false,
            error: error.message
          }
        })
      }
    }

    return NextResponse.json({
      success: false,
      error: 'Invalid action. Use: fix-frontend, test-simple-vm, test-simple-local'
    }, { status: 400 })
    
  } catch (error: any) {
    console.error('Simple fix error:', error)
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 })
  }
}