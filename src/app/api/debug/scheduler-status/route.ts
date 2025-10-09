import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import dbConnect from '@/lib/mongoose'
import { intradayScheduler } from '@/services/intradayScheduler'
import clientPromise from '@/lib/mongodb'
import { ObjectId } from 'mongodb'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    // Only allow admin access
    if (!session?.user?.email || session.user.email !== 'mail4arasu@gmail.com') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 401 })
    }

    await dbConnect()
    
    console.log('🔍 Debugging scheduler status...')
    
    // Get scheduler status
    const schedulerStatus = intradayScheduler.getStatus()
    
    // Get current time info
    const now = new Date()
    const istTime = new Date(now.toLocaleString("en-US", {timeZone: "Asia/Kolkata"}))
    
    // Get open intraday positions from database
    const client = await clientPromise
    const db = client.db('tradebot')
    
    const openPositions = await db.collection('positions').find({
      status: { $in: ['OPEN', 'PARTIAL'] },
      $or: [
        { scheduledExitTime: { $exists: true, $ne: null } },
        { instrumentType: 'FUTURES' },
        { instrumentType: 'OPTIONS' }
      ]
    }).toArray()
    
    // Get user details for positions
    const positionsWithUsers = await Promise.all(
      openPositions.map(async (position) => {
        const user = await db.collection('users').findOne({ _id: new ObjectId(position.userId) })
        return {
          ...position,
          userEmail: user?.email || 'Unknown',
          currentTime: istTime.toLocaleTimeString(),
          exitTimePassed: position.scheduledExitTime ? 
            calculateIfExitTimePassed(position.scheduledExitTime, istTime) : null
        }
      })
    )
    
    console.log(`📊 Found ${openPositions.length} open positions in database`)
    console.log(`📊 Scheduler has ${schedulerStatus.scheduledExits} scheduled exits`)
    
    return NextResponse.json({
      success: true,
      currentTime: {
        server: now.toISOString(),
        ist: istTime.toISOString(),
        istString: istTime.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
      },
      scheduler: {
        ...schedulerStatus,
        scheduledPositionDetails: schedulerStatus.scheduledPositions.map(posId => {
          const position = openPositions.find(p => p._id.toString() === posId)
          return {
            positionId: posId,
            symbol: position?.symbol || 'Not found',
            scheduledExitTime: position?.scheduledExitTime || 'Not set',
            autoSquareOffScheduled: position?.autoSquareOffScheduled || false
          }
        })
      },
      positions: {
        total: openPositions.length,
        withScheduledExit: openPositions.filter(p => p.scheduledExitTime).length,
        alreadyScheduled: openPositions.filter(p => p.autoSquareOffScheduled).length,
        details: positionsWithUsers.map(p => ({
          _id: p._id,
          symbol: p.symbol,
          status: p.status,
          userEmail: p.userEmail,
          scheduledExitTime: p.scheduledExitTime,
          autoSquareOffScheduled: p.autoSquareOffScheduled,
          currentQuantity: p.currentQuantity,
          exitTimePassed: p.exitTimePassed,
          createdAt: p.createdAt
        }))
      }
    })
    
  } catch (error) {
    console.error('❌ Error checking scheduler status:', error)
    return NextResponse.json({ 
      error: 'Failed to check scheduler status',
      details: error.message 
    }, { status: 500 })
  }
}

function calculateIfExitTimePassed(exitTimeString: string, currentTime: Date): boolean {
  if (!exitTimeString) return false
  
  const [hours, minutes] = exitTimeString.split(':').map(Number)
  const exitTime = new Date(currentTime)
  exitTime.setHours(hours, minutes, 0, 0)
  
  return currentTime > exitTime
}