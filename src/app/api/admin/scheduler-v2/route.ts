import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import dbConnect from '@/lib/mongoose'
import ScheduledExit from '@/models/ScheduledExit'
import { restartResistantScheduler } from '@/utils/restartResistantScheduler'
import { intradayScheduler } from '@/services/intradayScheduler'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    // Only allow admin access
    if (!session?.user?.email || session.user.email !== 'mail4arasu@gmail.com') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 401 })
    }

    await dbConnect()
    
    const url = new URL(request.url)
    const action = url.searchParams.get('action')
    
    if (action === 'status') {
      // Get comprehensive status
      const legacyStatus = intradayScheduler.getStatus()
      const pendingExits = await restartResistantScheduler.getPendingExits()
      
      // Get statistics from database
      const exitStats = await ScheduledExit.aggregate([
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 }
          }
        }
      ])
      
      const todayStats = await ScheduledExit.aggregate([
        {
          $match: {
            scheduledForDate: {
              $gte: new Date(new Date().setHours(0, 0, 0, 0))
            }
          }
        },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 }
          }
        }
      ])
      
      return NextResponse.json({
        success: true,
        timestamp: new Date().toISOString(),
        legacyScheduler: legacyStatus,
        restartResistantScheduler: {
          status: restartResistantScheduler.getStatus(),
          pendingExitsCount: pendingExits.length,
          pendingExits: pendingExits.map(exit => ({
            positionId: exit.positionId,
            symbol: exit.symbol,
            scheduledExitTime: exit.scheduledExitTime,
            status: exit.status,
            executionAttempts: exit.executionAttempts,
            lastAuditEntry: exit.auditLog[exit.auditLog.length - 1]
          }))
        },
        statistics: {
          allTime: exitStats.reduce((acc, stat) => {
            acc[stat._id] = stat.count
            return acc
          }, {}),
          today: todayStats.reduce((acc, stat) => {
            acc[stat._id] = stat.count
            return acc
          }, {})
        }
      })
    }
    
    if (action === 'audit') {
      const positionId = url.searchParams.get('positionId')
      
      if (positionId) {
        // Get audit trail for specific position
        const scheduledExit = await ScheduledExit.findOne({ 
          positionId 
        }).populate('positionId').populate('userId', 'name email')
        
        return NextResponse.json({
          success: true,
          auditTrail: scheduledExit
        })
      } else {
        // Get recent audit entries
        const recentExits = await ScheduledExit.find({})
          .populate('userId', 'name email')
          .sort({ updatedAt: -1 })
          .limit(50)
        
        return NextResponse.json({
          success: true,
          recentActivity: recentExits.map(exit => ({
            positionId: exit.positionId,
            symbol: exit.symbol,
            user: exit.userId,
            status: exit.status,
            scheduledExitTime: exit.scheduledExitTime,
            executionAttempts: exit.executionAttempts,
            lastExecutionError: exit.lastExecutionError,
            auditLog: exit.auditLog,
            createdAt: exit.createdAt,
            updatedAt: exit.updatedAt
          }))
        })
      }
    }
    
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    
  } catch (error) {
    console.error('❌ Error in scheduler v2 API:', error)
    return NextResponse.json({ 
      error: 'Failed to process request',
      details: error.message 
    }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.email || session.user.email !== 'mail4arasu@gmail.com') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 401 })
    }

    await dbConnect()
    
    const { action, positionId, positionIds } = await request.json()
    
    if (action === 'cancel_exit') {
      if (!positionId) {
        return NextResponse.json({ error: 'Position ID required' }, { status: 400 })
      }
      
      await restartResistantScheduler.cancelPositionExit(positionId, 'Manual cancellation by admin')
      
      return NextResponse.json({
        success: true,
        message: `Cancelled scheduled exit for position ${positionId}`
      })
    }
    
    if (action === 'emergency_stop') {
      await restartResistantScheduler.emergencyStop()
      
      return NextResponse.json({
        success: true,
        message: 'Emergency stop activated - all scheduled exits cancelled'
      })
    }
    
    if (action === 'reset_failed_exits') {
      const result = await ScheduledExit.updateMany(
        { status: 'FAILED' },
        { 
          $set: { 
            status: 'PENDING',
            executionAttempts: 0,
            lastExecutionError: null
          },
          $push: {
            auditLog: {
              timestamp: new Date(),
              action: 'RESET_BY_ADMIN',
              details: 'Reset failed exit to pending by admin',
              processId: `admin_${session.user.email}`
            }
          }
        }
      )
      
      return NextResponse.json({
        success: true,
        message: `Reset ${result.modifiedCount} failed exits to pending`
      })
    }
    
    if (action === 'cleanup_completed') {
      const result = await ScheduledExit.deleteMany({
        status: { $in: ['COMPLETED', 'CANCELLED'] },
        updatedAt: { $lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } // Older than 24 hours
      })
      
      return NextResponse.json({
        success: true,
        message: `Cleaned up ${result.deletedCount} completed/cancelled exits`
      })
    }
    
    if (action === 'force_reschedule') {
      // Force reschedule all pending exits
      const pendingExits = await ScheduledExit.find({ status: 'PENDING' })
        .populate('positionId')
      
      let rescheduledCount = 0
      
      for (const exit of pendingExits) {
        if (exit.positionId && ['OPEN', 'PARTIAL'].includes((exit.positionId as any).status)) {
          await restartResistantScheduler.schedulePositionExit(
            exit.positionId.toString(),
            exit.scheduledExitTime,
            exit.userId.toString(),
            exit.symbol
          )
          rescheduledCount++
        }
      }
      
      return NextResponse.json({
        success: true,
        message: `Force rescheduled ${rescheduledCount} pending exits`
      })
    }
    
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    
  } catch (error) {
    console.error('❌ Error in scheduler v2 POST:', error)
    return NextResponse.json({ 
      error: 'Failed to execute action',
      details: error.message 
    }, { status: 500 })
  }
}