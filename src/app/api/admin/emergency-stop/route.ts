import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import clientPromise from '@/lib/mongodb'
import { isAdminUser } from '@/lib/admin'
import { ObjectId } from 'mongodb'

// POST - Toggle emergency stop for a bot or globally
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

    const payload = await request.json()
    const { botId, emergencyStop, global } = payload

    const client = await clientPromise
    const db = client.db('tradebot')

    let result
    
    if (global) {
      // Global emergency stop - affects all bots
      result = await db.collection('bots').updateMany(
        {},
        { 
          $set: { 
            emergencyStop: emergencyStop,
            updatedAt: new Date()
          }
        }
      )

      // Also stop all pending executions
      if (emergencyStop) {
        await db.collection('tradeexecutions').updateMany(
          { status: 'PENDING' },
          { 
            $set: { 
              status: 'CANCELLED',
              error: 'Emergency stop activated',
              isEmergencyExit: true,
              updatedAt: new Date()
            }
          }
        )
      }

      return NextResponse.json({
        success: true,
        message: `Global emergency stop ${emergencyStop ? 'activated' : 'deactivated'}`,
        affectedBots: result.modifiedCount
      })

    } else if (botId) {
      // Bot-specific emergency stop
      result = await db.collection('bots').updateOne(
        { _id: new ObjectId(botId) },
        { 
          $set: { 
            emergencyStop: emergencyStop,
            updatedAt: new Date()
          }
        }
      )

      if (result.matchedCount === 0) {
        return NextResponse.json({ error: 'Bot not found' }, { status: 404 })
      }

      // Stop pending executions for this bot
      if (emergencyStop) {
        await db.collection('tradeexecutions').updateMany(
          { botId: new ObjectId(botId), status: 'PENDING' },
          { 
            $set: { 
              status: 'CANCELLED',
              error: 'Bot emergency stop activated',
              isEmergencyExit: true,
              updatedAt: new Date()
            }
          }
        )
      }

      return NextResponse.json({
        success: true,
        message: `Emergency stop ${emergencyStop ? 'activated' : 'deactivated'} for bot`,
        botId
      })

    } else {
      return NextResponse.json(
        { error: 'Missing botId or global flag' },
        { status: 400 }
      )
    }

  } catch (error) {
    console.error('❌ Emergency stop error:', error)
    return NextResponse.json(
      { error: 'Failed to toggle emergency stop' },
      { status: 500 }
    )
  }
}

// GET - Get emergency stop status for all bots
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

    const client = await clientPromise
    const db = client.db('tradebot')

    // Get all bots with their emergency stop status
    const bots = await db.collection('bots').find({}).toArray()
    
    const emergencyStatus = {
      globalEmergencyStop: bots.every(bot => bot.emergencyStop),
      bots: bots.map(bot => ({
        _id: bot._id.toString(),
        name: bot.name,
        isActive: bot.isActive,
        emergencyStop: bot.emergencyStop || false,
        symbol: bot.symbol,
        exchange: bot.exchange
      })),
      pendingExecutions: await db.collection('tradeexecutions').countDocuments({
        status: 'PENDING'
      }),
      totalBots: bots.length,
      activeBots: bots.filter(bot => bot.isActive && !bot.emergencyStop).length,
      stoppedBots: bots.filter(bot => bot.emergencyStop).length
    }

    return NextResponse.json(emergencyStatus)

  } catch (error) {
    console.error('❌ Error fetching emergency status:', error)
    return NextResponse.json(
      { error: 'Failed to fetch emergency status' },
      { status: 500 }
    )
  }
}