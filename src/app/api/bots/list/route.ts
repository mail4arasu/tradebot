import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import clientPromise from '@/lib/mongodb'
import { isAdminUser } from '@/lib/admin'

// GET - List all bots with their IDs for TradingView configuration
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

    // Get all bots with essential info for TradingView configuration
    const bots = await db.collection('bots').find({}).sort({ createdAt: -1 }).toArray()

    const botList = bots.map(bot => ({
      _id: bot._id.toString(),
      name: bot.name,
      strategy: bot.strategy,
      symbol: bot.symbol,
      exchange: bot.exchange,
      instrumentType: bot.instrumentType,
      isActive: bot.isActive,
      emergencyStop: bot.emergencyStop || false,
      webhookUrl: `${process.env.NEXTAUTH_URL}/api/webhook/tradingview`,
      
      // TradingView payload examples
      tradingViewPayloads: {
        withBotId: {
          botId: bot._id.toString(),
          symbol: bot.symbol || 'NIFTY50',
          action: 'BUY', // or 'SELL', 'EXIT', 'ENTRY'
          price: 18500, // {{close}} in TradingView
          strategy: bot.strategy,
          exchange: bot.exchange || 'NFO',
          instrumentType: bot.instrumentType || 'FUTURES'
        },
        withoutBotId: {
          symbol: bot.symbol || 'NIFTY50',
          action: 'BUY',
          price: 18500,
          strategy: bot.strategy,
          exchange: bot.exchange || 'NFO',
          instrumentType: bot.instrumentType || 'FUTURES'
        }
      }
    }))

    return NextResponse.json({
      success: true,
      totalBots: bots.length,
      activeBots: bots.filter(b => b.isActive && !b.emergencyStop).length,
      bots: botList,
      webhookEndpoint: `${process.env.NEXTAUTH_URL}/api/webhook/tradingview`,
      usage: {
        recommendedMethod: 'Use botId in payload for precise targeting',
        fallbackMethod: 'Use symbol + strategy matching',
        emergencyControl: 'All bots respect emergency stop settings'
      }
    })

  } catch (error) {
    console.error('❌ Error listing bots:', error)
    return NextResponse.json(
      { error: 'Failed to list bots' },
      { status: 500 }
    )
  }
}