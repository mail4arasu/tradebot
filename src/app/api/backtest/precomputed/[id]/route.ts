// Retrieve Pre-computed Backtest Results with Capital Scaling
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '../../../../../lib/auth'
import mongoose from 'mongoose'

// Pre-computed Backtest Schema (reuse)
const PrecomputedBacktestSchema = new mongoose.Schema({
  backtestId: { type: String, required: true, unique: true },
  strategy: { type: String, required: true },
  symbol: { type: String, required: true },
  timeframe: { type: String, required: true },
  
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  standardCapital: { type: Number, default: 100000 },
  
  totalTrades: { type: Number, default: 0 },
  winningTrades: { type: Number, default: 0 },
  losingTrades: { type: Number, default: 0 },
  totalPnL: { type: Number, default: 0 },
  totalPnLPercent: { type: Number, default: 0 },
  finalCapital: { type: Number, default: 0 },
  maxDrawdown: { type: Number, default: 0 },
  winRate: { type: Number, default: 0 },
  sharpeRatio: { type: Number, default: 0 },
  
  trades: [{
    tradeNumber: Number,
    entryDate: Date,
    exitDate: Date,
    direction: String,
    entryPrice: Number,
    exitPrice: Number,
    quantity: Number,
    pnl: Number,
    pnlPercent: Number,
    capitalAfterTrade: Number,
    holdingPeriod: Number,
    maxFavorableExcursion: Number,
    maxAdverseExcursion: Number
  }],
  
  computedAt: { type: Date, default: Date.now },
  dataPointsUsed: { type: Number, default: 0 },
  status: { type: String, enum: ['COMPUTING', 'COMPLETED', 'FAILED'], default: 'COMPLETED' }
})

const PrecomputedBacktest = mongoose.models.PrecomputedBacktest || mongoose.model('PrecomputedBacktest', PrecomputedBacktestSchema)

/**
 * Scale backtest results for different capital amounts
 */
function scaleBacktestResults(originalResults: any, requestedCapital: number, originalCapital: number = 100000) {
  const scaleFactor = requestedCapital / originalCapital
  
  return {
    // Basic info
    backtestId: originalResults.backtestId,
    strategy: originalResults.strategy,
    symbol: originalResults.symbol,
    timeframe: originalResults.timeframe,
    startDate: originalResults.startDate,
    endDate: originalResults.endDate,
    
    // Scaled capital amounts
    initialCapital: requestedCapital,
    finalCapital: originalResults.standardCapital + (originalResults.totalPnL * scaleFactor),
    
    // Scaled P&L (absolute amounts scale, percentages stay same)
    totalReturn: originalResults.totalPnL * scaleFactor,
    totalReturnPercent: originalResults.totalPnLPercent,
    
    // Trade statistics (counts don't scale)
    totalTrades: originalResults.totalTrades,
    winningTrades: originalResults.winningTrades,
    losingTrades: originalResults.losingTrades,
    winRate: originalResults.winRate,
    
    // Risk metrics (percentages don't scale)
    maxDrawdownPercent: originalResults.maxDrawdown,
    sharpeRatio: originalResults.sharpeRatio,
    
    // Scaled individual trades
    trades: originalResults.trades?.map((trade: any, index: number) => ({
      tradeNumber: trade.tradeNumber || index + 1,
      date: trade.entryDate,
      entryDate: trade.entryDate,
      exitDate: trade.exitDate,
      action: trade.direction === 'LONG' ? 'BUY' : 'SELL',
      direction: trade.direction,
      price: trade.entryPrice, // Entry price for display
      entryPrice: trade.entryPrice,
      exitPrice: trade.exitPrice,
      quantity: Math.round(trade.quantity * scaleFactor / (originalCapital / 100000)), // Scale quantity
      pnl: trade.pnl * scaleFactor, // Scale P&L
      pnlPercent: trade.pnlPercent, // Percentage stays same
      capital: trade.capitalAfterTrade ? originalResults.standardCapital + ((trade.capitalAfterTrade - originalResults.standardCapital) * scaleFactor) : 0,
      holdingPeriod: trade.holdingPeriod
    })) || [],
    
    // Metadata
    isPrecomputed: true,
    scaleFactor: scaleFactor,
    originalCapital: originalCapital,
    computedAt: originalResults.computedAt,
    dataPointsUsed: originalResults.dataPointsUsed
  }
}

/**
 * GET /api/backtest/precomputed/[id] - Get pre-computed backtest with optional capital scaling
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Connect to database
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/tradebot')
    }

    const backtestId = params.id
    const { searchParams } = new URL(request.url)
    const requestedCapital = parseFloat(searchParams.get('capital') || '100000')
    const includetrades = searchParams.get('includeTrades') !== 'false'

    console.log(`📊 Retrieving pre-computed backtest: ${backtestId} with capital: ₹${requestedCapital.toLocaleString()}`)

    // Try to find exact match first
    let precomputed = await PrecomputedBacktest.findOne({ backtestId })

    // If not found, try to find a similar period and symbol
    if (!precomputed) {
      console.log(`🔍 Exact match not found, looking for similar backtests...`)
      
      // Extract period info from backtestId if possible
      const periodMatch = backtestId.match(/(\d{4}-\d{2}-\d{2}).*to.*(\d{4}-\d{2}-\d{2})/)
      
      if (periodMatch) {
        const [, startDateStr, endDateStr] = periodMatch
        const startDate = new Date(startDateStr)
        const endDate = new Date(endDateStr)
        
        // Look for backtest with similar period
        precomputed = await PrecomputedBacktest.findOne({
          startDate: { $lte: new Date(startDate.getTime() + 24 * 60 * 60 * 1000) }, // Within 1 day
          endDate: { $gte: new Date(endDate.getTime() - 24 * 60 * 60 * 1000) },
          symbol: { $in: ['NIFTY', 'NIFTY_CONTINUOUS'] }
        }).sort({ computedAt: -1 })
      }
      
      // If still not found, get the most recent one
      if (!precomputed) {
        console.log(`🔍 No similar period found, using most recent backtest...`)
        precomputed = await PrecomputedBacktest.findOne({
          symbol: { $in: ['NIFTY', 'NIFTY_CONTINUOUS'] }
        }).sort({ computedAt: -1 })
      }
    }

    if (!precomputed) {
      return NextResponse.json({
        success: false,
        error: 'No pre-computed backtest found. Please run pre-computation first.',
        suggestion: 'Use /api/backtest/precompute to generate pre-computed results'
      }, { status: 404 })
    }

    console.log(`✅ Found pre-computed backtest: ${precomputed.backtestId}`)
    console.log(`📈 Original results: ${precomputed.totalTrades} trades, ₹${precomputed.totalPnL.toFixed(2)} P&L`)

    // Scale results for requested capital
    const scaledResults = scaleBacktestResults(precomputed, requestedCapital, precomputed.standardCapital)

    console.log(`💰 Scaled results: ₹${scaledResults.totalReturn.toFixed(2)} P&L for ₹${requestedCapital.toLocaleString()} capital`)

    // Optionally exclude trades for performance
    if (!includetrades) {
      delete scaledResults.trades
    }

    return NextResponse.json({
      success: true,
      result: scaledResults,
      metadata: {
        source: 'precomputed',
        originalBacktestId: precomputed.backtestId,
        requestedBacktestId: backtestId,
        scaleFactor: scaledResults.scaleFactor,
        computedAt: precomputed.computedAt
      }
    })

  } catch (error: any) {
    console.error('Pre-computed backtest retrieval error:', error)
    return NextResponse.json({
      success: false,
      error: error.message || 'Internal server error'
    }, { status: 500 })
  }
}