import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import clientPromise from '@/lib/mongodb'
import { ObjectId } from 'mongodb'
import { getEffectiveUserEmail } from '@/lib/impersonation-utils'

// GET - Fetch user's bot allocations
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const client = await clientPromise
    const db = client.db('tradebot')
    
    // Find effective user (handles impersonation)
    const effectiveEmail = await getEffectiveUserEmail()
    if (!effectiveEmail) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }
    const user = await db.collection('users').findOne({ email: effectiveEmail })
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Fetch user's bot allocations with bot details
    const allocations = await db.collection('userbotallocations').aggregate([
      { $match: { userId: user._id } },
      {
        $lookup: {
          from: 'bots',
          localField: 'botId',
          foreignField: '_id',
          as: 'bot'
        }
      },
      { $unwind: '$bot' },
      { $sort: { createdAt: -1 } }
    ]).toArray()

    const formattedAllocations = allocations.map(allocation => ({
      _id: allocation._id.toString(),
      botId: allocation.bot._id.toString(),
      botName: allocation.bot.name,
      botStrategy: allocation.bot.strategy,
      botRiskLevel: allocation.bot.riskLevel,
      isActive: allocation.isActive,
      quantity: allocation.quantity,
      maxTradesPerDay: allocation.maxTradesPerDay,
      currentDayTrades: allocation.currentDayTrades,
      enabledHours: allocation.enabledHours,
      totalTrades: allocation.totalTrades,
      successfulTrades: allocation.successfulTrades,
      totalPnl: allocation.totalPnl,
      allocatedAmount: allocation.allocatedAmount,
      riskPercentage: allocation.riskPercentage,
      positionSizingMethod: allocation.positionSizingMethod || 'RISK_PERCENTAGE'
    }))

    return NextResponse.json({ allocations: formattedAllocations })

  } catch (error) {
    console.error('❌ Error fetching bot allocations:', error)
    return NextResponse.json(
      { error: 'Failed to fetch bot allocations' },
      { status: 500 }
    )
  }
}

// POST - Create new bot allocation
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const payload = await request.json()
    const { botId, quantity, maxTradesPerDay, allocatedAmount, riskPercentage, positionSizingMethod } = payload

    if (!botId || !quantity || !maxTradesPerDay || !allocatedAmount || !riskPercentage) {
      return NextResponse.json(
        { error: 'Missing required fields: botId, quantity, maxTradesPerDay, allocatedAmount, riskPercentage' },
        { status: 400 }
      )
    }

    // Validate positionSizingMethod
    const validSizingMethods = ['FIXED_QUANTITY', 'RISK_PERCENTAGE']
    if (positionSizingMethod && !validSizingMethods.includes(positionSizingMethod)) {
      return NextResponse.json(
        { error: 'Invalid positionSizingMethod. Must be FIXED_QUANTITY or RISK_PERCENTAGE' },
        { status: 400 }
      )
    }

    // Validate risk percentage
    if (riskPercentage <= 0 || riskPercentage > 50) {
      return NextResponse.json(
        { error: 'Risk percentage must be between 0.1% and 50%' },
        { status: 400 }
      )
    }

    const client = await clientPromise
    const db = client.db('tradebot')
    
    // Find effective user (handles impersonation)
    const effectiveEmail = await getEffectiveUserEmail()
    if (!effectiveEmail) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }
    const user = await db.collection('users').findOne({ email: effectiveEmail })
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Check if bot exists and is active
    const bot = await db.collection('bots').findOne({ _id: new ObjectId(botId) })
    if (!bot || !bot.isActive) {
      return NextResponse.json({ error: 'Bot not found or inactive' }, { status: 404 })
    }

    // Check if user already has allocation for this bot
    const existingAllocation = await db.collection('userbotallocations').findOne({ 
      userId: user._id, 
      botId: new ObjectId(botId)
    })
    
    if (existingAllocation) {
      return NextResponse.json(
        { error: 'Bot already enabled for this user' },
        { status: 400 }
      )
    }

    // Create new allocation
    const allocation = {
      userId: user._id,
      botId: new ObjectId(botId),
      allocatedAmount,
      quantity,
      maxTradesPerDay,
      riskPercentage, // User-specific risk percentage
      positionSizingMethod: positionSizingMethod || 'RISK_PERCENTAGE', // Default to risk percentage
      isActive: true,
      startDate: new Date(),
      currentValue: allocatedAmount,
      currentDayTrades: 0,
      totalTrades: 0,
      successfulTrades: 0,
      totalPnl: 0,
      enabledHours: {
        start: '09:15',
        end: '15:30'
      },
      createdAt: new Date(),
      updatedAt: new Date()
    }

    const result = await db.collection('userbotallocations').insertOne(allocation)

    return NextResponse.json({
      success: true,
      message: 'Bot enabled successfully',
      allocationId: result.insertedId.toString()
    })

  } catch (error) {
    console.error('❌ Error creating bot allocation:', error)
    return NextResponse.json(
      { error: 'Failed to enable bot' },
      { status: 500 }
    )
  }
}

// PUT - Update bot allocation
export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const payload = await request.json()
    const { allocationId, ...updateData } = payload

    if (!allocationId) {
      return NextResponse.json(
        { error: 'Missing allocationId' },
        { status: 400 }
      )
    }

    const client = await clientPromise
    const db = client.db('tradebot')
    
    // Find effective user (handles impersonation)
    const effectiveEmail = await getEffectiveUserEmail()
    if (!effectiveEmail) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }
    const user = await db.collection('users').findOne({ email: effectiveEmail })
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Update allocation
    const result = await db.collection('userbotallocations').findOneAndUpdate(
      { _id: new ObjectId(allocationId), userId: user._id },
      { $set: { ...updateData, updatedAt: new Date() } },
      { returnDocument: 'after' }
    )

    if (!result) {
      return NextResponse.json(
        { error: 'Bot allocation not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Bot allocation updated successfully'
    })

  } catch (error) {
    console.error('❌ Error updating bot allocation:', error)
    return NextResponse.json(
      { error: 'Failed to update bot allocation' },
      { status: 500 }
    )
  }
}

// DELETE - Remove bot allocation
export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const allocationId = searchParams.get('allocationId')

    if (!allocationId) {
      return NextResponse.json(
        { error: 'Missing allocationId' },
        { status: 400 }
      )
    }

    const client = await clientPromise
    const db = client.db('tradebot')
    
    // Find effective user (handles impersonation)
    const effectiveEmail = await getEffectiveUserEmail()
    if (!effectiveEmail) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }
    const user = await db.collection('users').findOne({ email: effectiveEmail })
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Delete allocation
    const result = await db.collection('userbotallocations').findOneAndDelete({ 
      _id: new ObjectId(allocationId), 
      userId: user._id 
    })

    if (!result) {
      return NextResponse.json(
        { error: 'Bot allocation not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Bot disabled successfully'
    })

  } catch (error) {
    console.error('❌ Error removing bot allocation:', error)
    return NextResponse.json(
      { error: 'Failed to disable bot' },
      { status: 500 }
    )
  }
}