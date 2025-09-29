import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import clientPromise from '@/lib/mongodb'
import { ObjectId } from 'mongodb'
import { getEffectiveUserEmail } from '@/lib/impersonation-utils'

interface BotConfig {
  userId: string
  name: string
  strategy: string
  isActive: boolean
  riskLevel: string
  maxTradesPerDay: number
  webhook: {
    url: string
    passphrase: string
    isEnabled: boolean
  }
  tradingConfig: {
    symbol: string
    exchange: string
    lotSize: number
    maxPositionSize: number
  }
  createdAt: Date
  updatedAt: Date
}

// GET - Fetch bot configurations
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

    // Fetch bot configurations for this user
    const configs = await db.collection('bot_configs')
      .find({ userId: user._id.toString() })
      .sort({ createdAt: -1 })
      .toArray()

    return NextResponse.json({
      configs: configs.map(config => ({
        ...config,
        _id: config._id.toString()
      }))
    })

  } catch (error) {
    console.error('❌ Error fetching bot configs:', error)
    return NextResponse.json(
      { error: 'Failed to fetch bot configurations' },
      { status: 500 }
    )
  }
}

// POST - Create bot configuration
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const payload = await request.json()
    
    // Validate required fields
    const requiredFields = ['name', 'strategy', 'riskLevel', 'maxTradesPerDay']
    for (const field of requiredFields) {
      if (!payload[field]) {
        return NextResponse.json(
          { error: `Missing required field: ${field}` },
          { status: 400 }
        )
      }
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

    // Create bot configuration
    const botConfig: BotConfig = {
      userId: user._id.toString(),
      name: payload.name,
      strategy: payload.strategy,
      isActive: payload.isActive || false,
      riskLevel: payload.riskLevel,
      maxTradesPerDay: payload.maxTradesPerDay,
      webhook: {
        url: payload.webhook?.url || '',
        passphrase: payload.webhook?.passphrase || '',
        isEnabled: payload.webhook?.isEnabled || false
      },
      tradingConfig: {
        symbol: payload.tradingConfig?.symbol || 'NIFTY',
        exchange: payload.tradingConfig?.exchange || 'NFO',
        lotSize: payload.tradingConfig?.lotSize || 25,
        maxPositionSize: payload.tradingConfig?.maxPositionSize || 100
      },
      createdAt: new Date(),
      updatedAt: new Date()
    }

    const result = await db.collection('bot_configs').insertOne(botConfig)

    return NextResponse.json({
      success: true,
      message: 'Bot configuration created successfully',
      configId: result.insertedId.toString(),
      config: {
        ...botConfig,
        _id: result.insertedId.toString()
      }
    })

  } catch (error) {
    console.error('❌ Error creating bot config:', error)
    return NextResponse.json(
      { error: 'Failed to create bot configuration' },
      { status: 500 }
    )
  }
}

// PUT - Update bot configuration
export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const payload = await request.json()
    const { configId, ...updateData } = payload

    if (!configId) {
      return NextResponse.json(
        { error: 'Missing configId' },
        { status: 400 }
      )
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

    // Update bot configuration
    const result = await db.collection('bot_configs').updateOne(
      { 
        _id: new ObjectId(configId),
        userId: user._id.toString()
      },
      {
        $set: {
          ...updateData,
          updatedAt: new Date()
        }
      }
    )

    if (result.matchedCount === 0) {
      return NextResponse.json(
        { error: 'Bot configuration not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Bot configuration updated successfully'
    })

  } catch (error) {
    console.error('❌ Error updating bot config:', error)
    return NextResponse.json(
      { error: 'Failed to update bot configuration' },
      { status: 500 }
    )
  }
}