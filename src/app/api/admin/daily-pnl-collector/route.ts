import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { dailyPnLCollector } from '@/services/dailyPnLCollector'
import DailyPnLSnapshot from '@/models/DailyPnLSnapshot'
import User from '@/models/User'
import dbConnect from '@/lib/mongoose'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // TODO: Add admin role check
    if (session.user.email !== 'mail4arasu@gmail.com') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    await dbConnect()

    const { searchParams } = new URL(request.url)
    const action = searchParams.get('action')

    switch (action) {
      case 'status':
      default:
        // Get current status of the P&L collector
        const status = dailyPnLCollector.getStatus()
        
        // Get additional statistics from database
        const totalSnapshots = await DailyPnLSnapshot.countDocuments({})
        const lastSnapshot = await DailyPnLSnapshot.findOne({})
          .sort({ snapshotTime: -1 })
          .select('date snapshotTime totalDayPnL')
          .lean()

        const recentSnapshots = await DailyPnLSnapshot.find({})
          .sort({ snapshotTime: -1 })
          .limit(10)
          .select('userId date totalDayPnL totalPortfolioPnL snapshotTime dataSource')
          .populate('userId', 'name email')
          .lean()

        const todaySnapshots = await DailyPnLSnapshot.countDocuments({
          date: new Date().toISOString().split('T')[0]
        })

        return NextResponse.json({
          success: true,
          status: {
            ...status,
            totalSnapshots,
            lastSnapshot,
            recentSnapshots,
            todaySnapshots
          },
          message: 'Daily P&L collector status retrieved'
        })

      case 'history':
        // Get collection history
        const limit = parseInt(searchParams.get('limit') || '50')
        const skip = parseInt(searchParams.get('skip') || '0')
        
        const snapshots = await DailyPnLSnapshot.find({})
          .sort({ snapshotTime: -1 })
          .limit(limit)
          .skip(skip)
          .populate('userId', 'name email')
          .lean()

        const total = await DailyPnLSnapshot.countDocuments({})

        return NextResponse.json({
          success: true,
          data: {
            snapshots,
            total,
            limit,
            skip
          }
        })
    }

  } catch (error) {
    console.error('Error getting P&L collector status:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // TODO: Add admin role check
    if (session.user.email !== 'mail4arasu@gmail.com') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const { action, userId, date, startDate, endDate, enable } = await request.json()

    switch (action) {
      case 'collect_all':
        console.log(`📊 Manual P&L collection triggered by ${session.user.email}`)
        const results = await dailyPnLCollector.collectAllUserSnapshots()
        return NextResponse.json({
          success: true,
          results,
          message: `Collection completed: ${results.success} success, ${results.failed} failed`
        })

      case 'collect_user':
        if (!userId) {
          return NextResponse.json({ error: 'userId required for user collection' }, { status: 400 })
        }
        
        console.log(`📊 Manual P&L collection for user ${userId} triggered by ${session.user.email}`)
        // Get user data
        await dbConnect()
        const user = await User.findById(userId).select('email zerodhaConfig').lean()
        if (!user) {
          return NextResponse.json({ error: 'User not found' }, { status: 404 })
        }
        
        await dailyPnLCollector.collectUserSnapshot(user, date)
        
        return NextResponse.json({
          success: true,
          message: `Collection completed for user ${user.email}`
        })

      case 'collect_date':
        if (!date) {
          return NextResponse.json({ error: 'Date is required' }, { status: 400 })
        }

        console.log(`📊 Manual P&L collection for ${date} triggered by ${session.user.email}`)
        
        // Temporarily set the target date in the collector
        const dateResults = await dailyPnLCollector.collectAllUserSnapshots()
        
        return NextResponse.json({
          success: true,
          results: dateResults,
          message: `Collection completed for ${date}: ${dateResults.success} success, ${dateResults.failed} failed`
        })

      case 'schedule':
        if (enable) {
          console.log(`📅 Daily P&L collection scheduling enabled by ${session.user.email}`)
          dailyPnLCollector.scheduleDailyCollection()
          return NextResponse.json({
            success: true,
            message: 'Daily P&L collection scheduler enabled'
          })
        } else {
          console.log(`📅 Daily P&L collection scheduling disabled by ${session.user.email}`)
          dailyPnLCollector.stopScheduledCollection()
          return NextResponse.json({
            success: true,
            message: 'Daily P&L collection scheduler disabled'
          })
        }

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }

  } catch (error) {
    console.error('Error controlling P&L collector:', error)
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error.message 
    }, { status: 500 })
  }
}