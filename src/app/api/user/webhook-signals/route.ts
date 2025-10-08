import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import clientPromise from '@/lib/mongodb'
import { getEffectiveUser } from '@/lib/impersonation-utils'
import { ObjectId } from 'mongodb'

// GET - Get webhook signals for the current user
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const client = await clientPromise
    const db = client.db('tradebot')

    // Get effective user (handles impersonation)
    const { user } = await getEffectiveUser()
    
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '50')
    const page = parseInt(searchParams.get('page') || '1')
    const skip = (page - 1) * limit
    const botId = searchParams.get('botId') // Optional bot filter
    const status = searchParams.get('status') // Optional status filter

    // Build query to get signals that affected this user
    const userObjectId = new ObjectId(user._id)
    
    // First, get trade executions for this user to find relevant signals
    const userExecutions = await db.collection('tradeexecutions').find({
      userId: userObjectId
    }).project({ signalId: 1 }).toArray()

    const relevantSignalIds = [...new Set(userExecutions.map(exec => exec.signalId))]

    if (relevantSignalIds.length === 0) {
      return NextResponse.json({
        signals: [],
        pagination: {
          page,
          limit,
          total: 0,
          pages: 0
        },
        stats: {
          totalSignals: 0,
          processedSignals: 0,
          totalExecutions: 0,
          failedExecutions: 0,
          successfulExecutions: 0
        }
      })
    }

    // Build match conditions for signals
    const matchConditions: any = {
      _id: { $in: relevantSignalIds }
    }

    // Add bot filter if specified
    if (botId) {
      matchConditions.botId = new ObjectId(botId)
    }

    // Get webhook signals that affected this user with bot details
    const signals = await db.collection('webhooksignals').aggregate([
      { $match: matchConditions },
      {
        $lookup: {
          from: 'bots',
          localField: 'botId',
          foreignField: '_id',
          as: 'bot'
        }
      },
      { $unwind: '$bot' },
      { $sort: { createdAt: -1 } },
      { $skip: skip },
      { $limit: limit },
      {
        $project: {
          _id: 1,
          signal: 1,
          symbol: 1,
          exchange: 1,
          price: 1,
          processed: 1,
          processedAt: 1,
          emergencyStop: 1,
          totalUsersTargeted: 1,
          successfulExecutions: 1,
          failedExecutions: 1,
          createdAt: 1,
          'bot.name': 1,
          'bot.strategy': 1,
          rawPayload: 1
        }
      }
    ]).toArray()

    // Get execution details for this specific user
    const signalIds = signals.map(s => s._id)
    const userSpecificExecutions = await db.collection('tradeexecutions').aggregate([
      { 
        $match: { 
          signalId: { $in: signalIds },
          userId: userObjectId
        } 
      },
      {
        $lookup: {
          from: 'users',
          localField: 'userId',
          foreignField: '_id',
          as: 'user'
        }
      },
      {
        $unwind: {
          path: '$user',
          preserveNullAndEmptyArrays: true
        }
      },
      {
        $project: {
          signalId: 1,
          userId: 1,
          quantity: 1,
          status: 1,
          executedPrice: 1,
          error: 1,
          createdAt: 1,
          'user.email': 1,
          'user.name': 1
        }
      }
    ]).toArray()

    // Group executions by signal
    const executionsBySignal = userSpecificExecutions.reduce((acc, exec) => {
      const signalId = exec.signalId.toString()
      if (!acc[signalId]) acc[signalId] = []
      acc[signalId].push(exec)
      return acc
    }, {})

    // Enhance signals with user-specific execution details
    const enhancedSignals = signals.map(signal => {
      const userExecutions = executionsBySignal[signal._id.toString()] || []
      const userSuccessfulExecutions = userExecutions.filter(exec => exec.status === 'EXECUTED').length
      const userFailedExecutions = userExecutions.filter(exec => exec.status === 'FAILED').length
      
      return {
        ...signal,
        _id: signal._id.toString(),
        executions: userExecutions,
        userStats: {
          totalExecutions: userExecutions.length,
          successfulExecutions: userSuccessfulExecutions,
          failedExecutions: userFailedExecutions,
          successRate: userExecutions.length > 0 
            ? Math.round((userSuccessfulExecutions / userExecutions.length) * 100)
            : 0
        }
      }
    })

    // Filter by status if specified
    let filteredSignals = enhancedSignals
    if (status) {
      filteredSignals = enhancedSignals.filter(signal => {
        if (status === 'successful') return signal.userStats.successfulExecutions > 0
        if (status === 'failed') return signal.userStats.failedExecutions > 0
        if (status === 'emergency') return signal.emergencyStop
        return true
      })
    }

    // Calculate user-specific statistics
    const totalUserExecutions = userSpecificExecutions.length
    const successfulUserExecutions = userSpecificExecutions.filter(exec => exec.status === 'EXECUTED').length
    const failedUserExecutions = userSpecificExecutions.filter(exec => exec.status === 'FAILED').length

    const totalCount = relevantSignalIds.length

    return NextResponse.json({
      signals: filteredSignals,
      pagination: {
        page,
        limit,
        total: totalCount,
        pages: Math.ceil(totalCount / limit)
      },
      stats: {
        totalSignals: relevantSignalIds.length,
        processedSignals: signals.filter(s => s.processed).length,
        totalExecutions: totalUserExecutions,
        successfulExecutions: successfulUserExecutions,
        failedExecutions: failedUserExecutions,
        successRate: totalUserExecutions > 0 
          ? Math.round((successfulUserExecutions / totalUserExecutions) * 100)
          : 0
      },
      user: {
        id: user._id,
        email: user.email,
        name: user.name
      }
    })

  } catch (error) {
    console.error('❌ Error fetching user webhook signals:', error)
    return NextResponse.json(
      { error: 'Failed to fetch webhook signals' },
      { status: 500 }
    )
  }
}