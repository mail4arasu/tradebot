import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import clientPromise from '@/lib/mongodb'
import { isAdminUser } from '@/lib/admin'

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

    const client = await clientPromise
    const db = client.db('tradebot')
    const botsCollection = db.collection('bots')

    // Check if Options Bot already exists
    const existingBot = await botsCollection.findOne({ 
      name: 'Nifty50 Options Bot' 
    })

    if (existingBot) {
      return NextResponse.json({ 
        message: 'Nifty50 Options Bot already exists',
        botId: existingBot._id 
      })
    }

    // Add the Options Bot
    const optionsBot = {
      name: 'Nifty50 Options Bot',
      description: 'Advanced options trading bot with dynamic strike selection and delta analysis',
      strategy: 'Options Delta Strategy',
      riskLevel: 'HIGH',
      minInvestment: 50000,
      maxInvestment: 2000000,
      expectedReturn: 30.0,
      isActive: true,
      status: 'ACTIVE',
      parameters: {
        marketHours: '9:15-15:30',
        maxPositions: 1,
        tradeTimeout: 300,
        positionType: 'RISK_PERCENTAGE',
        deltaThreshold: 0.6,
        expiryPreference: 'NEAREST'
      },
      webhookUrl: 'https://niveshawealth.in/api/webhook/tradingview',
      emergencyStop: false,
      symbol: 'NIFTY',
      exchange: 'NFO',
      instrumentType: 'OPTIONS',
      tradingType: 'INTRADAY',
      intradayExitTime: '15:10',
      autoSquareOff: true,
      allowMultiplePositions: false,
      maxPositionHoldDays: 1,
      createdAt: new Date(),
      updatedAt: new Date()
    }

    const result = await botsCollection.insertOne(optionsBot)
    
    // Get all bots for verification
    const allBots = await botsCollection.find({}).toArray()

    return NextResponse.json({
      success: true,
      message: 'Successfully added Nifty50 Options Bot',
      botId: result.insertedId,
      totalBots: allBots.length,
      bots: allBots.map(bot => ({
        name: bot.name,
        instrumentType: bot.instrumentType,
        isActive: bot.isActive
      }))
    })

  } catch (error) {
    console.error('Error adding options bot:', error)
    return NextResponse.json(
      { error: 'Failed to add options bot' },
      { status: 500 }
    )
  }
}