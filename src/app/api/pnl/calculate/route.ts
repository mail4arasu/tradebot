import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import dbConnect from '@/lib/mongoose'
import User from '@/models/User'
import Trade from '@/models/Trade'
import mongoose from 'mongoose'

export async function POST(request: NextRequest) {
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

    const body = await request.json()
    const { 
      startDate, 
      endDate, 
      symbol,
      calculateMethod = 'fifo', // 'fifo', 'lifo', 'specific'
      updateDatabase = false 
    } = body

    const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    const end = endDate ? new Date(endDate) : new Date()

    console.log(`💰 Calculating P&L for user ${user.email} from ${start.toISOString()} to ${end.toISOString()}`)

    // Build query
    const query: any = {
      userId: user._id,
      timestamp: { $gte: start, $lte: end }
    }

    if (symbol) {
      query.tradingSymbol = symbol
    }

    // Get all trades in the period, sorted by timestamp
    const trades = await Trade.find(query)
      .sort({ timestamp: 1, tradingSymbol: 1 })
      .lean()

    if (trades.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No trades found for the specified period',
        pnlCalculation: {
          totalTrades: 0,
          realizedPnl: 0,
          unrealizedPnl: 0,
          totalPnl: 0,
          totalCharges: 0,
          netPnl: 0
        }
      })
    }

    // Calculate P&L using specified method
    const pnlResult = await calculatePnLWithCharges(trades, calculateMethod)

    // Update database with calculated P&L if requested
    if (updateDatabase) {
      await updateTradesWithPnL(pnlResult.tradeUpdates)
    }

    return NextResponse.json({
      success: true,
      pnlCalculation: pnlResult.summary,
      tradeDetails: pnlResult.tradeDetails,
      symbolBreakdown: pnlResult.symbolBreakdown,
      methodology: calculateMethod,
      period: { start: start.toISOString(), end: end.toISOString() },
      updatedDatabase: updateDatabase
    })

  } catch (error) {
    console.error('Error calculating P&L:', error)
    return NextResponse.json(
      { error: 'Failed to calculate P&L' },
      { status: 500 }
    )
  }
}

async function calculatePnLWithCharges(trades: any[], method: string) {
  const symbolMap = new Map<string, any[]>()
  
  // Group trades by symbol
  trades.forEach(trade => {
    const symbol = trade.tradingSymbol
    if (!symbolMap.has(symbol)) {
      symbolMap.set(symbol, [])
    }
    symbolMap.get(symbol)!.push(trade)
  })

  let totalRealizedPnl = 0
  let totalUnrealizedPnl = 0
  let totalCharges = 0
  let tradeUpdates: any[] = []
  let tradeDetails: any[] = []
  let symbolBreakdown: any[] = []

  // Calculate P&L for each symbol
  for (const [symbol, symbolTrades] of symbolMap) {
    const symbolResult = calculateSymbolPnL(symbolTrades, method)
    
    totalRealizedPnl += symbolResult.realizedPnl
    totalUnrealizedPnl += symbolResult.unrealizedPnl
    totalCharges += symbolResult.totalCharges
    
    tradeUpdates.push(...symbolResult.tradeUpdates)
    tradeDetails.push(...symbolResult.tradeDetails)
    symbolBreakdown.push({
      symbol,
      ...symbolResult.summary
    })
  }

  return {
    summary: {
      totalTrades: trades.length,
      realizedPnl: totalRealizedPnl,
      unrealizedPnl: totalUnrealizedPnl,
      totalPnl: totalRealizedPnl + totalUnrealizedPnl,
      totalCharges,
      netPnl: totalRealizedPnl + totalUnrealizedPnl - totalCharges,
      symbolsTraded: symbolMap.size
    },
    tradeDetails,
    symbolBreakdown,
    tradeUpdates
  }
}

function calculateSymbolPnL(trades: any[], method: string) {
  const buyTrades: any[] = []
  const sellTrades: any[] = []
  const matchedTrades: any[] = []
  let totalCharges = 0

  // Separate buy and sell trades
  trades.forEach(trade => {
    const charges = (trade.charges?.totalCharges || 0)
    totalCharges += charges
    
    if (trade.transactionType === 'BUY') {
      buyTrades.push({
        ...trade,
        remainingQuantity: trade.quantity,
        charges
      })
    } else {
      sellTrades.push({
        ...trade,
        remainingQuantity: trade.quantity,
        charges
      })
    }
  })

  let realizedPnl = 0
  let unrealizedPnl = 0

  // Match buy and sell trades based on method
  sellTrades.forEach(sellTrade => {
    let sellQuantity = sellTrade.remainingQuantity
    
    while (sellQuantity > 0 && buyTrades.length > 0) {
      // Find the appropriate buy trade based on method
      let buyTradeIndex = -1
      
      switch (method) {
        case 'fifo':
          buyTradeIndex = buyTrades.findIndex(bt => bt.remainingQuantity > 0)
          break
        case 'lifo':
          for (let i = buyTrades.length - 1; i >= 0; i--) {
            if (buyTrades[i].remainingQuantity > 0) {
              buyTradeIndex = i
              break
            }
          }
          break
        default: // specific - use closest timestamp
          buyTradeIndex = buyTrades.findIndex(bt => bt.remainingQuantity > 0)
      }

      if (buyTradeIndex === -1) break

      const buyTrade = buyTrades[buyTradeIndex]
      const matchQuantity = Math.min(sellQuantity, buyTrade.remainingQuantity)
      
      // Calculate P&L for this match
      const buyValue = matchQuantity * buyTrade.price
      const sellValue = matchQuantity * sellTrade.price
      const grossPnl = sellValue - buyValue
      
      // Allocate charges proportionally
      const buyChargeRatio = matchQuantity / buyTrade.quantity
      const sellChargeRatio = matchQuantity / sellTrade.quantity
      const allocatedCharges = (buyTrade.charges * buyChargeRatio) + (sellTrade.charges * sellChargeRatio)
      
      const netPnl = grossPnl - allocatedCharges
      realizedPnl += netPnl

      // Record the match
      matchedTrades.push({
        symbol: buyTrade.tradingSymbol,
        buyTradeId: buyTrade._id,
        sellTradeId: sellTrade._id,
        quantity: matchQuantity,
        buyPrice: buyTrade.price,
        sellPrice: sellTrade.price,
        grossPnl,
        allocatedCharges,
        netPnl,
        buyDate: buyTrade.timestamp,
        sellDate: sellTrade.timestamp,
        holdingPeriod: Math.ceil((new Date(sellTrade.timestamp).getTime() - new Date(buyTrade.timestamp).getTime()) / (1000 * 60 * 60 * 24))
      })

      // Update remaining quantities
      buyTrade.remainingQuantity -= matchQuantity
      sellQuantity -= matchQuantity

      // Remove fully consumed buy trades
      if (buyTrade.remainingQuantity <= 0) {
        buyTrades.splice(buyTradeIndex, 1)
      }
    }
  })

  // Calculate unrealized P&L for remaining buy positions
  buyTrades.forEach(buyTrade => {
    if (buyTrade.remainingQuantity > 0) {
      // Use last known price or current market price
      const currentPrice = buyTrade.price // Simplified - in production, fetch current market price
      const unrealizedValue = buyTrade.remainingQuantity * (currentPrice - buyTrade.price)
      unrealizedPnl += unrealizedValue
    }
  })

  // Prepare trade updates for database
  const tradeUpdates = matchedTrades.map(match => ({
    buyTradeId: match.buyTradeId,
    sellTradeId: match.sellTradeId,
    realizedPnl: match.netPnl
  }))

  return {
    realizedPnl,
    unrealizedPnl,
    totalCharges,
    summary: {
      totalTrades: trades.length,
      buyTrades: buyTrades.length + matchedTrades.length,
      sellTrades: sellTrades.length,
      matchedTrades: matchedTrades.length,
      openPositions: buyTrades.filter(bt => bt.remainingQuantity > 0).length,
      realizedPnl,
      unrealizedPnl,
      totalPnl: realizedPnl + unrealizedPnl,
      totalCharges,
      netPnl: realizedPnl + unrealizedPnl - totalCharges
    },
    tradeDetails: matchedTrades,
    tradeUpdates
  }
}

async function updateTradesWithPnL(tradeUpdates: any[]) {
  const Trade = (await import('@/models/Trade')).default
  
  for (const update of tradeUpdates) {
    try {
      // Update buy trade
      await Trade.findByIdAndUpdate(update.buyTradeId, {
        $set: {
          realizedPnl: update.realizedPnl / 2, // Split P&L between buy and sell
          netPnl: update.realizedPnl / 2
        }
      })

      // Update sell trade  
      await Trade.findByIdAndUpdate(update.sellTradeId, {
        $set: {
          realizedPnl: update.realizedPnl / 2, // Split P&L between buy and sell
          netPnl: update.realizedPnl / 2
        }
      })
    } catch (error) {
      console.error(`Error updating trade P&L:`, error)
    }
  }
  
  console.log(`✅ Updated P&L for ${tradeUpdates.length} trade pairs`)
}

// GET endpoint for P&L summary
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

    const { searchParams } = new URL(request.url)
    const days = parseInt(searchParams.get('days') || '30')
    const symbol = searchParams.get('symbol')
    
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    const endDate = new Date()

    const query: any = {
      userId: user._id,
      timestamp: { $gte: startDate, $lte: endDate }
    }

    if (symbol) {
      query.tradingSymbol = symbol
    }

    // Get P&L summary using aggregation
    const pnlSummary = await Trade.aggregate([
      { $match: query },
      {
        $group: {
          _id: null,
          totalTrades: { $sum: 1 },
          totalTurnover: { $sum: '$turnover' },
          totalCharges: { $sum: '$charges.totalCharges' },
          realizedPnl: { $sum: '$realizedPnl' },
          unrealizedPnl: { $sum: '$unrealizedPnl' },
          netPnl: { $sum: '$netPnl' },
          profitableTrades: {
            $sum: { $cond: [{ $gt: ['$netPnl', 0] }, 1, 0] }
          },
          lossMakingTrades: {
            $sum: { $cond: [{ $lt: ['$netPnl', 0] }, 1, 0] }
          }
        }
      }
    ])

    // Get symbol-wise breakdown
    const symbolBreakdown = await Trade.aggregate([
      { $match: query },
      {
        $group: {
          _id: '$tradingSymbol',
          symbol: { $first: '$tradingSymbol' },
          totalTrades: { $sum: 1 },
          totalTurnover: { $sum: '$turnover' },
          totalCharges: { $sum: '$charges.totalCharges' },
          netPnl: { $sum: '$netPnl' },
          realizedPnl: { $sum: '$realizedPnl' },
          avgPrice: { $avg: '$price' },
          lastTradeDate: { $max: '$timestamp' }
        }
      },
      { $sort: { netPnl: -1 } }
    ])

    const summary = pnlSummary[0] || {
      totalTrades: 0,
      totalTurnover: 0,
      totalCharges: 0,
      realizedPnl: 0,
      unrealizedPnl: 0,
      netPnl: 0,
      profitableTrades: 0,
      lossMakingTrades: 0
    }

    const winRate = summary.totalTrades > 0 ? (summary.profitableTrades / summary.totalTrades * 100) : 0
    const avgPnlPerTrade = summary.totalTrades > 0 ? (summary.netPnl / summary.totalTrades) : 0
    const returnOnTurnover = summary.totalTurnover > 0 ? (summary.netPnl / summary.totalTurnover * 100) : 0

    return NextResponse.json({
      success: true,
      period: `Last ${days} days`,
      summary: {
        ...summary,
        winRate: Number(winRate.toFixed(2)),
        avgPnlPerTrade: Number(avgPnlPerTrade.toFixed(2)),
        returnOnTurnover: Number(returnOnTurnover.toFixed(4)),
        chargeRatio: summary.totalTurnover > 0 ? Number((summary.totalCharges / summary.totalTurnover * 100).toFixed(4)) : 0
      },
      symbolBreakdown: symbolBreakdown.slice(0, 20) // Top 20 symbols
    })

  } catch (error) {
    console.error('Error fetching P&L summary:', error)
    return NextResponse.json(
      { error: 'Failed to fetch P&L summary' },
      { status: 500 }
    )
  }
}