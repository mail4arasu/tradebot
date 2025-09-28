import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import clientPromise from '@/lib/mongodb'

// POST - Seed database with sample bots (admin only)
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check if user is admin (for now, just check if it's the main user)
    if (session.user.email !== 'mail4arasu@gmail.com') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const client = await clientPromise
    const db = client.db('tradebot')

    // Check if bots already exist
    const existingBots = await db.collection('bots').countDocuments()
    if (existingBots > 0) {
      return NextResponse.json({ message: 'Bots already exist in database' })
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
          tradeTimeout: 300 // 5 minutes
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
        name: 'Bank Nifty Options Bot',
        description: 'Intraday options trading strategy for Bank Nifty with risk management',
        strategy: 'Options Straddle',
        riskLevel: 'HIGH',
        minInvestment: 200000, // 2 Lakhs
        maxInvestment: 2000000, // 20 Lakhs
        expectedReturn: 25.0, // 25% annual
        isActive: false, // Not active yet
        parameters: {
          marketHours: '9:15-15:30',
          maxPositions: 2,
          stopLoss: 20,
          target: 40
        },
        // New automated trading fields
        webhookUrl: 'https://niveshawealth.in/api/webhook/tradingview',
        emergencyStop: false,
        symbol: 'BANKNIFTY',
        exchange: 'NFO',
        instrumentType: 'OPTIONS',
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        name: 'Momentum Scanner Bot',
        description: 'Multi-stock momentum scanning and trading bot for equity markets',
        strategy: 'Momentum Breakout',
        riskLevel: 'MEDIUM',
        minInvestment: 150000, // 1.5 Lakhs
        maxInvestment: 3000000, // 30 Lakhs
        expectedReturn: 20.0, // 20% annual
        isActive: false, // Development
        parameters: {
          marketHours: '9:15-15:30',
          maxPositions: 5,
          scanInterval: 60,
          minimumVolume: 1000000
        },
        // New automated trading fields
        webhookUrl: 'https://niveshawealth.in/api/webhook/tradingview',
        emergencyStop: false,
        symbol: 'MULTIPLE',
        exchange: 'NSE',
        instrumentType: 'EQUITY',
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
    console.error('❌ Error seeding bots:', error)
    return NextResponse.json(
      { error: 'Failed to seed bots' },
      { status: 500 }
    )
  }
}