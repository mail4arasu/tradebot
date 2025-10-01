import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import clientPromise from '@/lib/mongodb'
import { getEffectiveUserEmail } from '@/lib/impersonation-utils'
import { ObjectId } from 'mongodb'

// GET - Fetch user's bot positions with details
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const client = await clientPromise
    const db = client.db('tradebot')
    
    // Get effective user (handles impersonation)
    const effectiveEmail = await getEffectiveUserEmail()
    if (!effectiveEmail) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }
    
    const user = await db.collection('users').findOne({ email: effectiveEmail })
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Parse query parameters
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status') || 'all' // 'all', 'open', 'closed'
    const botId = searchParams.get('botId') // Filter by specific bot
    const limit = parseInt(searchParams.get('limit') || '50')
    const page = parseInt(searchParams.get('page') || '1')
    const skip = (page - 1) * limit

    // Build match query
    const matchQuery: any = { userId: user._id }
    
    if (status !== 'all') {
      if (status === 'open') {
        matchQuery.status = { $in: ['OPEN', 'PARTIAL'] }
      } else {
        matchQuery.status = status.toUpperCase()
      }
    }
    
    if (botId) {
      try {
        matchQuery.botId = new ObjectId(botId)
      } catch (error) {
        return NextResponse.json({ error: 'Invalid bot ID' }, { status: 400 })
      }
    }

    // Fetch positions with bot and allocation details
    const positions = await db.collection('positions').aggregate([
      { $match: matchQuery },
      {
        $lookup: {
          from: 'bots',
          localField: 'botId',
          foreignField: '_id',
          as: 'bot'
        }
      },
      {
        $lookup: {
          from: 'userbotallocations',
          localField: 'allocationId',
          foreignField: '_id',
          as: 'allocation'
        }
      },
      { $unwind: '$bot' },
      { $unwind: '$allocation' },
      { $sort: { createdAt: -1 } },
      { $skip: skip },
      { $limit: limit },
      {
        $project: {
          _id: 1,
          positionId: 1,
          symbol: 1,
          exchange: 1,
          instrumentType: 1,
          side: 1,
          status: 1,
          entryPrice: 1,
          entryQuantity: 1,
          currentQuantity: 1,
          averagePrice: 1,
          entryTime: 1,
          entryOrderId: 1,
          exitExecutions: 1,
          unrealizedPnl: 1,
          realizedPnl: 1,
          totalFees: 1,
          isIntraday: 1,
          scheduledExitTime: 1,
          autoSquareOffScheduled: 1,
          stopLoss: 1,
          target: 1,
          notes: 1,
          tags: 1,
          createdAt: 1,
          updatedAt: 1,
          // Bot details
          'bot._id': 1,
          'bot.name': 1,
          'bot.strategy': 1,
          'bot.tradingType': 1,
          'bot.riskLevel': 1,
          // Allocation details
          'allocation.allocatedAmount': 1,
          'allocation.riskPercentage': 1
        }
      }
    ]).toArray()

    // Get total count for pagination
    const totalCount = await db.collection('positions').countDocuments(matchQuery)

    // Format positions for response
    const formattedPositions = positions.map(position => ({
      _id: position._id.toString(),
      positionId: position.positionId,
      symbol: position.symbol,
      exchange: position.exchange,
      instrumentType: position.instrumentType,
      side: position.side,
      status: position.status,
      
      // Entry details
      entryPrice: position.entryPrice,
      entryQuantity: position.entryQuantity,
      entryTime: position.entryTime,
      entryOrderId: position.entryOrderId,
      
      // Current status
      currentQuantity: position.currentQuantity,
      averagePrice: position.averagePrice,
      
      // Exit details
      exitExecutions: position.exitExecutions || [],
      totalExitQuantity: (position.exitExecutions || []).reduce((sum: number, exit: any) => sum + exit.quantity, 0),
      
      // P&L
      unrealizedPnl: position.unrealizedPnl || 0,
      realizedPnl: position.realizedPnl || 0,
      totalPnl: (position.unrealizedPnl || 0) + (position.realizedPnl || 0),
      totalFees: position.totalFees || 0,
      
      // Bot configuration
      isIntraday: position.isIntraday,
      scheduledExitTime: position.scheduledExitTime,
      autoSquareOffScheduled: position.autoSquareOffScheduled,
      
      // Risk management
      stopLoss: position.stopLoss,
      target: position.target,
      
      // Additional data
      notes: position.notes,
      tags: position.tags || [],
      
      // Timestamps
      createdAt: position.createdAt,
      updatedAt: position.updatedAt,
      
      // Bot information
      botId: position.bot._id.toString(),
      botName: position.bot.name,
      botStrategy: position.bot.strategy,
      botTradingType: position.bot.tradingType,
      botRiskLevel: position.bot.riskLevel,
      
      // Allocation information
      allocatedAmount: position.allocation.allocatedAmount,
      riskPercentage: position.allocation.riskPercentage,
      
      // Calculated fields
      durationInPosition: position.status === 'CLOSED' && position.exitExecutions?.length > 0
        ? Math.floor((new Date(position.exitExecutions[position.exitExecutions.length - 1].time).getTime() - new Date(position.entryTime).getTime()) / (1000 * 60)) // minutes
        : Math.floor((new Date().getTime() - new Date(position.entryTime).getTime()) / (1000 * 60)), // minutes
      
      pnlPercentage: position.entryPrice > 0 
        ? (((position.unrealizedPnl || 0) + (position.realizedPnl || 0)) / (position.entryPrice * position.entryQuantity)) * 100 
        : 0
    }))

    // Calculate summary statistics
    const summary = {
      totalPositions: totalCount,
      openPositions: formattedPositions.filter(p => p.status === 'OPEN' || p.status === 'PARTIAL').length,
      closedPositions: formattedPositions.filter(p => p.status === 'CLOSED').length,
      totalUnrealizedPnl: formattedPositions.reduce((sum, p) => sum + p.unrealizedPnl, 0),
      totalRealizedPnl: formattedPositions.reduce((sum, p) => sum + p.realizedPnl, 0),
      totalPnl: formattedPositions.reduce((sum, p) => sum + p.totalPnl, 0),
      averagePositionDuration: formattedPositions.length > 0 
        ? formattedPositions.reduce((sum, p) => sum + p.durationInPosition, 0) / formattedPositions.length 
        : 0
    }

    return NextResponse.json({
      success: true,
      positions: formattedPositions,
      pagination: {
        page,
        limit,
        total: totalCount,
        pages: Math.ceil(totalCount / limit)
      },
      summary,
      filters: {
        status,
        botId: botId || null
      }
    })

  } catch (error) {
    console.error('❌ Error fetching bot positions:', error)
    return NextResponse.json(
      { error: 'Failed to fetch bot positions' },
      { status: 500 }
    )
  }
}

// POST - Manual position close (for emergencies)
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const client = await clientPromise
    const db = client.db('tradebot')
    
    // Get effective user
    const effectiveEmail = await getEffectiveUserEmail()
    const user = await db.collection('users').findOne({ email: effectiveEmail })
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const { positionId, reason = 'MANUAL', notes } = await request.json()

    if (!positionId) {
      return NextResponse.json({ error: 'Position ID required' }, { status: 400 })
    }

    // Find the position
    const position = await db.collection('positions').findOne({
      _id: new ObjectId(positionId),
      userId: user._id,
      status: { $in: ['OPEN', 'PARTIAL'] }
    })

    if (!position) {
      return NextResponse.json({ error: 'Position not found or already closed' }, { status: 404 })
    }

    // For now, just mark as requested for manual close
    // In a real implementation, this would trigger the actual exit trade
    await db.collection('positions').updateOne(
      { _id: new ObjectId(positionId) },
      {
        $set: {
          notes: notes ? `${position.notes || ''}\nManual close requested: ${notes}` : `${position.notes || ''}\nManual close requested`,
          updatedAt: new Date()
        }
      }
    )

    console.log(`📝 Manual close requested for position: ${positionId} by user: ${user.email}`)

    return NextResponse.json({
      success: true,
      message: 'Manual close request recorded',
      positionId
    })

  } catch (error) {
    console.error('❌ Error processing manual close request:', error)
    return NextResponse.json(
      { error: 'Failed to process close request' },
      { status: 500 }
    )
  }
}