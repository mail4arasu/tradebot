import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import clientPromise from '@/lib/mongodb'

// GET - Fetch available bots
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const client = await clientPromise
    const db = client.db('tradebot')

    // Fetch all bots
    const bots = await db.collection('bots').find({}).sort({ createdAt: -1 }).toArray()

    const formattedBots = bots.map(bot => ({
      _id: bot._id.toString(),
      name: bot.name,
      description: bot.description,
      strategy: bot.strategy,
      riskLevel: bot.riskLevel,
      symbol: bot.symbol || 'NIFTY50',
      exchange: bot.exchange || 'NFO',
      instrumentType: bot.instrumentType || 'FUTURES',
      isActive: bot.isActive,
      emergencyStop: bot.emergencyStop || false,
      minInvestment: bot.minInvestment,
      maxInvestment: bot.maxInvestment,
      expectedReturn: bot.expectedReturn
    }))

    return NextResponse.json({ bots: formattedBots })

  } catch (error) {
    console.error('❌ Error fetching available bots:', error)
    return NextResponse.json(
      { error: 'Failed to fetch available bots' },
      { status: 500 }
    )
  }
}