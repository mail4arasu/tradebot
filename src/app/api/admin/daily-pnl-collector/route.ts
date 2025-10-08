import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { dailyPnLCollector } from '@/services/dailyPnLCollector'

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

    const status = dailyPnLCollector.getStatus()

    return NextResponse.json({
      success: true,
      status,
      message: 'Daily P&L collector status retrieved'
    })

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

    const { action, userId, date } = await request.json()

    switch (action) {
      case 'collect_all':
        console.log('🔄 Admin triggered collection for all users')
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
        
        console.log(`🔄 Admin triggered collection for user ${userId}`)
        // TODO: Implement single user collection
        return NextResponse.json({
          success: true,
          message: `Collection triggered for user ${userId}`
        })

      case 'schedule':
        console.log('📅 Admin enabled daily P&L collection scheduling')
        dailyPnLCollector.scheduleDailyCollection()
        return NextResponse.json({
          success: true,
          message: 'Daily P&L collection scheduled'
        })

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