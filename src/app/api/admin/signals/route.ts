import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import clientPromise from '@/lib/mongodb'
import { isAdminUser } from '@/lib/admin'
import { ObjectId } from 'mongodb'

// GET - Get recent webhook signals and execution status
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

    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '50')
    const page = parseInt(searchParams.get('page') || '1')
    const skip = (page - 1) * limit

    // Get recent webhook signals with bot details
    const signals = await db.collection('webhooksignals').aggregate([
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

    // Get execution details for recent signals with user data
    const signalIds = signals.map(s => s._id)
    const executions = await db.collection('tradeexecutions').aggregate([
      { $match: { signalId: { $in: signalIds } } },
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
    const executionsBySignal = executions.reduce((acc, exec) => {
      const signalId = exec.signalId.toString()
      if (!acc[signalId]) acc[signalId] = []
      acc[signalId].push(exec)
      return acc
    }, {})

    // Enhance signals with execution details
    const enhancedSignals = signals.map(signal => ({
      ...signal,
      _id: signal._id.toString(),
      executions: executionsBySignal[signal._id.toString()] || []
    }))

    // Get summary statistics
    const stats = await db.collection('webhooksignals').aggregate([
      {
        $group: {
          _id: null,
          totalSignals: { $sum: 1 },
          processedSignals: { $sum: { $cond: ['$processed', 1, 0] } },
          totalExecutions: { $sum: '$successfulExecutions' },
          failedExecutions: { $sum: '$failedExecutions' },
          emergencyStops: { $sum: { $cond: ['$emergencyStop', 1, 0] } }
        }
      }
    ]).toArray()

    const totalCount = await db.collection('webhooksignals').countDocuments()

    return NextResponse.json({
      signals: enhancedSignals,
      pagination: {
        page,
        limit,
        total: totalCount,
        pages: Math.ceil(totalCount / limit)
      },
      stats: stats[0] || {
        totalSignals: 0,
        processedSignals: 0,
        totalExecutions: 0,
        failedExecutions: 0,
        emergencyStops: 0
      }
    })

  } catch (error) {
    console.error('❌ Error fetching signals:', error)
    return NextResponse.json(
      { error: 'Failed to fetch signals' },
      { status: 500 }
    )
  }
}

// POST - Test webhook signal manually
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
    
    // Forward to the webhook endpoint
    const webhookResponse = await fetch(`${process.env.NEXTAUTH_URL}/api/webhook/tradingview`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    })

    const result = await webhookResponse.json()

    return NextResponse.json({
      success: webhookResponse.ok,
      status: webhookResponse.status,
      result,
      testPayload: payload
    })

  } catch (error) {
    console.error('❌ Error testing signal:', error)
    return NextResponse.json(
      { error: 'Failed to test signal' },
      { status: 500 }
    )
  }
}