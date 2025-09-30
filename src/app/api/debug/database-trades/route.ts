import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import dbConnect from '@/lib/mongoose'
import User from '@/models/User'
import Trade from '@/models/Trade'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await dbConnect()
    
    const user = await User.findOne({ email: session.user.email })
    
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    console.log(`\n=== DEBUG: Database Trades Analysis for ${user.email} ===`)
    
    // Get all trades for this user
    const allTrades = await Trade.find({ userId: user._id })
      .sort({ timestamp: -1 })
      .limit(50)
      .lean()
    
    console.log(`Found ${allTrades.length} trades in database for user ${user._id}`)
    
    // Analyze trade sources
    const tradesBySource = allTrades.reduce((acc, trade) => {
      const source = trade.tradeSource || 'Unknown'
      acc[source] = (acc[source] || 0) + 1
      return acc
    }, {} as Record<string, number>)
    
    console.log('Trades by source:', tradesBySource)
    
    // Recent trades analysis
    const recentTrades = allTrades.slice(0, 10)
    console.log('Recent trades:')
    recentTrades.forEach((trade, index) => {
      console.log(`${index + 1}. ${trade.tradingSymbol} ${trade.transactionType} ${trade.quantity}@${trade.price} [${trade.tradeSource}] - ${trade.timestamp}`)
    })
    
    // Date range analysis
    const oldestTrade = allTrades[allTrades.length - 1]
    const newestTrade = allTrades[0]
    
    return NextResponse.json({
      success: true,
      analysis: {
        totalTrades: allTrades.length,
        tradesBySource,
        dateRange: {
          oldest: oldestTrade ? oldestTrade.timestamp : null,
          newest: newestTrade ? newestTrade.timestamp : null
        },
        recentTrades: recentTrades.map(trade => ({
          id: trade._id,
          symbol: trade.tradingSymbol,
          type: trade.transactionType,
          quantity: trade.quantity,
          price: trade.price,
          source: trade.tradeSource,
          timestamp: trade.timestamp,
          orderId: trade.orderId,
          botId: trade.botId
        })),
        hasBotTrades: allTrades.some(t => t.tradeSource === 'BOT'),
        hasManualTrades: allTrades.some(t => t.tradeSource === 'MANUAL'),
        hasSimulatedTrades: allTrades.some(t => t.orderId?.includes('SIM_'))
      }
    })

  } catch (error) {
    console.error('Error in database trades debug:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}