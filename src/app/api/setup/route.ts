import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import clientPromise from '@/lib/mongodb'

// GET - One-click setup for bots (creates sample bots if none exist)
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const client = await clientPromise
    const db = client.db('tradebot')

    // Check if bots already exist
    const existingBots = await db.collection('bots').countDocuments()
    if (existingBots > 0) {
      return NextResponse.json({ 
        success: true,
        message: `${existingBots} bots already exist in database`,
        existingBots 
      })
    }

    // Create sample bots
    const sampleBots = [
      {
        name: 'Nifty50 Futures Bot',
        description: 'Opening breakout strategy for Nifty50 futures trading with automated TradingView signals',
        strategy: 'Opening Breakout',
        riskLevel: 'MEDIUM',
        minInvestment: 100000, // 1 Lakh
        maxInvestment: 5000000, // 50 Lakhs
        expectedReturn: 15.0, // 15% annual
        isActive: true,
        parameters: {
          marketHours: '9:15-15:30',
          maxPositions: 1,
          tradeTimeout: 300, // 5 minutes
          positionType: 'QUANTITY'
        },
        // New automated trading fields
        webhookUrl: 'https://niveshawealth.in/api/webhook/tradingview',
        emergencyStop: false,
        symbol: 'NIFTY50',
        exchange: 'NFO',
        instrumentType: 'FUTURES',
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        name: 'Nifty50 Options Bot',
        description: 'Advanced options trading bot with dynamic strike selection and delta analysis',
        strategy: 'Options Delta Strategy',
        riskLevel: 'HIGH',
        minInvestment: 50000, // 50k minimum for options
        maxInvestment: 2000000, // 20 Lakhs
        expectedReturn: 30.0, // 30% annual
        isActive: true,
        parameters: {
          marketHours: '9:15-15:30',
          maxPositions: 1,
          tradeTimeout: 300, // 5 minutes
          positionType: 'RISK_PERCENTAGE',
          deltaThreshold: 0.6,
          expiryPreference: 'NEAREST'
        },
        // Automated trading fields
        webhookUrl: 'https://niveshawealth.in/api/webhook/tradingview',
        emergencyStop: false,
        symbol: 'NIFTY',
        exchange: 'NFO',
        instrumentType: 'OPTIONS',
        botId: Math.random().toString(36).substring(2, 10).toUpperCase(),
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ]

    const result = await db.collection('bots').insertMany(sampleBots)

    return NextResponse.json({
      success: true,
      message: `${result.insertedCount} sample bots created successfully`,
      botIds: Object.values(result.insertedIds).map(id => id.toString())
    })

  } catch (error) {
    console.error('❌ Error in setup:', error)
    return NextResponse.json(
      { error: 'Failed to setup bots' },
      { status: 500 }
    )
  }
}