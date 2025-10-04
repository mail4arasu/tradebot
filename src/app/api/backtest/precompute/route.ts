// Pre-computed Backtest System
// Runs backtests when historical data is available and stores permanent results
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '../../../../lib/auth'
import mongoose from 'mongoose'

// Reuse existing schemas
const HistoricalDataSchema = new mongoose.Schema({
  instrument_token: { type: Number, required: true, index: true },
  symbol: { type: String, required: true, index: true },
  exchange: { type: String, required: true },
  tradingsymbol: { type: String, required: true, index: true },
  expiry: { type: Date },
  lot_size: { type: Number },
  
  // OHLC Data
  date: { type: Date, required: true, index: true },
  timeframe: { type: String, required: true, index: true },
  open: { type: Number, required: true },
  high: { type: Number, required: true },
  low: { type: Number, required: true },
  close: { type: Number, required: true },
  volume: { type: Number, required: true },
  
  created_at: { type: Date, default: Date.now }
}, {
  indexes: [
    { symbol: 1, timeframe: 1, date: 1 },
    { tradingsymbol: 1, timeframe: 1, date: 1 }
  ]
})

const HistoricalData = mongoose.models.HistoricalData || mongoose.model('HistoricalData', HistoricalDataSchema)

// Pre-computed Backtest Results Schema
const PrecomputedBacktestSchema = new mongoose.Schema({
  backtestId: { type: String, required: true, unique: true },
  strategy: { type: String, required: true }, // 'opening_breakout'
  symbol: { type: String, required: true }, // 'NIFTY'
  timeframe: { type: String, required: true }, // '5minute'
  
  // Period
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  
  // Standard capital (results can be scaled)
  standardCapital: { type: Number, default: 100000 },
  
  // Summary Results
  totalTrades: { type: Number, default: 0 },
  winningTrades: { type: Number, default: 0 },
  losingTrades: { type: Number, default: 0 },
  totalPnL: { type: Number, default: 0 },
  totalPnLPercent: { type: Number, default: 0 },
  finalCapital: { type: Number, default: 0 },
  maxDrawdown: { type: Number, default: 0 },
  winRate: { type: Number, default: 0 },
  sharpeRatio: { type: Number, default: 0 },
  
  // Detailed Trades (stores actual trade sequence)
  trades: [{
    tradeNumber: Number,
    entryDate: Date,
    exitDate: Date,
    direction: String, // 'LONG' or 'SHORT'
    entryPrice: Number,
    exitPrice: Number,
    quantity: Number,
    pnl: Number,
    pnlPercent: Number,
    capitalAfterTrade: Number,
    holdingPeriod: Number, // minutes
    maxFavorableExcursion: Number,
    maxAdverseExcursion: Number
  }],
  
  // Metadata
  computedAt: { type: Date, default: Date.now },
  dataPointsUsed: { type: Number, default: 0 },
  status: { type: String, enum: ['COMPUTING', 'COMPLETED', 'FAILED'], default: 'COMPLETED' }
})

const PrecomputedBacktest = mongoose.models.PrecomputedBacktest || mongoose.model('PrecomputedBacktest', PrecomputedBacktestSchema)

/**
 * Enhanced Opening Breakout Strategy with detailed trade tracking
 */
class DetailedOpeningBreakoutStrategy {
  private trades: any[] = []
  private capital: number
  private currentPosition: 'LONG' | 'SHORT' | null = null
  private entryPrice: number = 0
  private entryDate: Date | null = null
  private maxDrawdown: number = 0
  private peakCapital: number
  private tradeNumber: number = 0
  
  constructor(initialCapital: number) {
    this.capital = initialCapital
    this.peakCapital = initialCapital
  }
  
  async processCandle(candle: any, previousCandles: any[]): Promise<void> {
    if (previousCandles.length < 1) return
    
    const prevCandle = previousCandles[previousCandles.length - 1]
    const currentPrice = candle.close
    
    // Close any existing position if opposite signal
    if (this.currentPosition) {
      let shouldClose = false
      
      if (this.currentPosition === 'LONG' && currentPrice < prevCandle.low) {
        shouldClose = true
      } else if (this.currentPosition === 'SHORT' && currentPrice > prevCandle.high) {
        shouldClose = true
      }
      
      if (shouldClose) {
        this.closePosition(candle)
      }
    }
    
    // Enter new position on breakout
    if (!this.currentPosition) {
      if (currentPrice > prevCandle.high) {
        this.enterPosition('LONG', candle)
      } else if (currentPrice < prevCandle.low) {
        this.enterPosition('SHORT', candle)
      }
    }
    
    // Update drawdown
    if (this.capital > this.peakCapital) {
      this.peakCapital = this.capital
    }
    const currentDrawdown = (this.peakCapital - this.capital) / this.peakCapital * 100
    this.maxDrawdown = Math.max(this.maxDrawdown, currentDrawdown)
  }
  
  private enterPosition(direction: 'LONG' | 'SHORT', candle: any): void {
    this.tradeNumber++
    this.currentPosition = direction
    this.entryPrice = candle.close
    this.entryDate = new Date(candle.date)
  }
  
  private closePosition(candle: any): void {
    if (!this.currentPosition || !this.entryDate) return
    
    const exitPrice = candle.close
    const exitDate = new Date(candle.date)
    const quantity = 25 // Nifty lot size
    
    const pnl = this.currentPosition === 'LONG' ? 
      (exitPrice - this.entryPrice) * quantity : 
      (this.entryPrice - exitPrice) * quantity
    
    this.capital += pnl
    const pnlPercent = (pnl / (this.entryPrice * quantity)) * 100
    
    // Calculate holding period in minutes
    const holdingPeriod = (exitDate.getTime() - this.entryDate.getTime()) / (1000 * 60)
    
    this.trades.push({
      tradeNumber: this.tradeNumber,
      entryDate: this.entryDate,
      exitDate: exitDate,
      direction: this.currentPosition,
      entryPrice: this.entryPrice,
      exitPrice: exitPrice,
      quantity: quantity,
      pnl: pnl,
      pnlPercent: pnlPercent,
      capitalAfterTrade: this.capital,
      holdingPeriod: holdingPeriod,
      maxFavorableExcursion: 0, // Could be calculated with more data
      maxAdverseExcursion: 0 // Could be calculated with more data
    })
    
    this.currentPosition = null
    this.entryPrice = 0
    this.entryDate = null
  }
  
  getResults() {
    const winningTrades = this.trades.filter(t => t.pnl > 0).length
    const losingTrades = this.trades.filter(t => t.pnl < 0).length
    const totalTrades = this.trades.length
    const totalPnL = this.trades.reduce((sum, t) => sum + t.pnl, 0)
    const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0
    
    return {
      trades: this.trades,
      totalTrades,
      winningTrades,
      losingTrades,
      totalPnL,
      totalPnLPercent: totalPnL > 0 ? (totalPnL / (this.capital - totalPnL)) * 100 : 0,
      finalCapital: this.capital,
      maxDrawdown: this.maxDrawdown,
      winRate,
      sharpeRatio: 0 // Calculate if needed
    }
  }
}

/**
 * POST /api/backtest/precompute - Pre-compute backtests for available date ranges
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Connect to database
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/tradebot')
    }

    const body = await request.json()
    const { force = false } = body // Allow forcing recomputation

    console.log('🧮 Starting pre-computation of backtests...')
    
    // Find available data ranges
    const dataRanges = await HistoricalData.aggregate([
      {
        $match: {
          symbol: { $in: ['NIFTY', '"NIFTY"', 'NIFTY_CONTINUOUS'] },
          timeframe: '5minute'
        }
      },
      {
        $group: {
          _id: '$symbol',
          minDate: { $min: '$date' },
          maxDate: { $max: '$date' },
          count: { $sum: 1 }
        }
      }
    ])
    
    console.log('📊 Available data ranges:', dataRanges)
    
    if (dataRanges.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'No historical data available for pre-computation'
      })
    }
    
    const results = []
    
    // Pre-compute backtests for different periods
    const periods = [
      { months: 1, name: '1-Month' },
      { months: 3, name: '3-Month' },
      { months: 6, name: '6-Month' },
      { months: 12, name: '1-Year' }
    ]
    
    for (const range of dataRanges) {
      const symbol = range._id
      const maxDate = new Date(range.maxDate)
      
      for (const period of periods) {
        const startDate = new Date(maxDate)
        startDate.setMonth(startDate.getMonth() - period.months)
        
        if (startDate < new Date(range.minDate)) continue
        
        const backtestId = `precomputed_${symbol}_${period.name}_${startDate.toISOString().split('T')[0]}_to_${maxDate.toISOString().split('T')[0]}`
        
        // Check if already exists
        const existing = await PrecomputedBacktest.findOne({ backtestId })
        if (existing && !force) {
          console.log(`⏭️ Skipping existing backtest: ${backtestId}`)
          results.push({ backtestId, status: 'already_exists' })
          continue
        }
        
        console.log(`🧮 Computing backtest: ${backtestId}`)
        
        try {
          // Get historical data for this period
          const historicalData = await HistoricalData.find({
            symbol: symbol,
            timeframe: '5minute',
            date: {
              $gte: startDate,
              $lte: maxDate
            }
          }).sort({ date: 1 })
          
          if (historicalData.length === 0) {
            console.log(`⚠️ No data for period: ${backtestId}`)
            continue
          }
          
          console.log(`📈 Running strategy on ${historicalData.length} data points`)
          
          // Run strategy with standard capital
          const strategy = new DetailedOpeningBreakoutStrategy(100000)
          
          for (let i = 0; i < historicalData.length; i++) {
            const candle = historicalData[i]
            const previousCandles = historicalData.slice(Math.max(0, i - 20), i)
            await strategy.processCandle(candle, previousCandles)
          }
          
          const strategyResults = strategy.getResults()
          
          // Store pre-computed results
          const precomputedBacktest = new PrecomputedBacktest({
            backtestId,
            strategy: 'opening_breakout',
            symbol: symbol.replace(/"/g, ''), // Clean symbol name
            timeframe: '5minute',
            startDate,
            endDate: maxDate,
            standardCapital: 100000,
            totalTrades: strategyResults.totalTrades,
            winningTrades: strategyResults.winningTrades,
            losingTrades: strategyResults.losingTrades,
            totalPnL: strategyResults.totalPnL,
            totalPnLPercent: strategyResults.totalPnLPercent,
            finalCapital: strategyResults.finalCapital,
            maxDrawdown: strategyResults.maxDrawdown,
            winRate: strategyResults.winRate,
            sharpeRatio: strategyResults.sharpeRatio,
            trades: strategyResults.trades,
            dataPointsUsed: historicalData.length,
            computedAt: new Date()
          })
          
          if (existing) {
            await PrecomputedBacktest.deleteOne({ backtestId })
          }
          await precomputedBacktest.save()
          
          console.log(`✅ Saved backtest: ${backtestId} (${strategyResults.totalTrades} trades, ₹${strategyResults.totalPnL.toFixed(2)} P&L)`)
          
          results.push({
            backtestId,
            status: 'computed',
            totalTrades: strategyResults.totalTrades,
            totalPnL: strategyResults.totalPnL,
            winRate: strategyResults.winRate
          })
          
        } catch (error) {
          console.error(`❌ Failed to compute ${backtestId}:`, error)
          results.push({
            backtestId,
            status: 'failed',
            error: (error as Error).message
          })
        }
      }
    }
    
    return NextResponse.json({
      success: true,
      message: `Pre-computed ${results.length} backtests`,
      results: results,
      summary: {
        total: results.length,
        computed: results.filter(r => r.status === 'computed').length,
        failed: results.filter(r => r.status === 'failed').length,
        skipped: results.filter(r => r.status === 'already_exists').length
      }
    })
    
  } catch (error: any) {
    console.error('Pre-computation error:', error)
    return NextResponse.json({
      success: false,
      error: error.message || 'Internal server error'
    }, { status: 500 })
  }
}

/**
 * GET /api/backtest/precompute - List available pre-computed backtests
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Connect to database
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/tradebot')
    }

    const precomputedBacktests = await PrecomputedBacktest.find({})
      .select('-trades') // Exclude detailed trades for listing
      .sort({ computedAt: -1 })
      .limit(50)

    return NextResponse.json({
      success: true,
      backtests: precomputedBacktests.map(bt => ({
        backtestId: bt.backtestId,
        strategy: bt.strategy,
        symbol: bt.symbol,
        period: `${bt.startDate.toISOString().split('T')[0]} to ${bt.endDate.toISOString().split('T')[0]}`,
        totalTrades: bt.totalTrades,
        totalPnL: bt.totalPnL,
        totalPnLPercent: bt.totalPnLPercent,
        winRate: bt.winRate,
        maxDrawdown: bt.maxDrawdown,
        computedAt: bt.computedAt
      }))
    })
    
  } catch (error: any) {
    console.error('List pre-computed backtests error:', error)
    return NextResponse.json({
      success: false,
      error: error.message || 'Internal server error'
    }, { status: 500 })
  }
}