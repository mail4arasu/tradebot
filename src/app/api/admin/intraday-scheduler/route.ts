import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { isAdminUser } from '@/lib/admin'
import { intradayScheduler } from '@/services/intradayScheduler'

// GET - Get scheduler status
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check if user is admin
    if (!(await isAdminUser())) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const status = intradayScheduler.getStatus()

    return NextResponse.json({
      success: true,
      scheduler: status,
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('❌ Error getting scheduler status:', error)
    return NextResponse.json(
      { error: 'Failed to get scheduler status' },
      { status: 500 }
    )
  }
}

// POST - Initialize or manage scheduler
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check if user is admin
    if (!(await isAdminUser())) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const { action, positionId, exitTime } = await request.json()

    switch (action) {
      case 'initialize':
        await intradayScheduler.initialize()
        return NextResponse.json({
          success: true,
          message: 'Scheduler initialized successfully'
        })

      case 'schedule':
        if (!positionId || !exitTime) {
          return NextResponse.json(
            { error: 'positionId and exitTime required for scheduling' },
            { status: 400 }
          )
        }
        await intradayScheduler.schedulePositionExit(positionId, exitTime)
        return NextResponse.json({
          success: true,
          message: `Exit scheduled for position ${positionId} at ${exitTime}`
        })

      case 'cancel':
        if (!positionId) {
          return NextResponse.json(
            { error: 'positionId required for cancellation' },
            { status: 400 }
          )
        }
        intradayScheduler.cancelPositionExit(positionId)
        return NextResponse.json({
          success: true,
          message: `Scheduled exit cancelled for position ${positionId}`
        })

      case 'emergency-stop':
        intradayScheduler.emergencyStop()
        return NextResponse.json({
          success: true,
          message: 'Emergency stop activated - all scheduled exits cancelled'
        })

      default:
        return NextResponse.json(
          { error: 'Invalid action. Supported actions: initialize, schedule, cancel, emergency-stop' },
          { status: 400 }
        )
    }

  } catch (error) {
    console.error('❌ Error managing scheduler:', error)
    return NextResponse.json(
      { error: 'Failed to manage scheduler' },
      { status: 500 }
    )
  }
}