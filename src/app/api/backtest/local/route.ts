// Local Backtest Implementation
// This runs backtests using the historical data from our MongoDB
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '../../../../lib/auth'
import mongoose from 'mongoose'

// Historical Data Schema (reuse from sync-data)
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

// Backtest Results Schema
const BacktestResultSchema = new mongoose.Schema({
  backtestId: { type: String, required: true, unique: true },
  userId: { type: String, required: true },
  status: { type: String, enum: ['RUNNING', 'COMPLETED', 'FAILED'], default: 'RUNNING' },
  
  // Parameters
  botId: String,
  startDate: Date,
  endDate: Date,
  initialCapital: Number,
  symbol: String,
  
  // Results
  totalTrades: { type: Number, default: 0 },
  winningTrades: { type: Number, default: 0 },
  losingTrades: { type: Number, default: 0 },
  totalPnL: { type: Number, default: 0 },
  finalCapital: { type: Number, default: 0 },
  maxDrawdown: { type: Number, default: 0 },
  winRate: { type: Number, default: 0 },
  
  trades: [{
    date: Date,
    action: String, // 'BUY' or 'SELL'
    price: Number,
    quantity: Number,
    pnl: Number,
    capital: Number
  }],
  
  progress: { type: Number, default: 0 },
  error: String,
  
  createdAt: { type: Date, default: Date.now },
  completedAt: Date
})

const BacktestResult = mongoose.models.BacktestResult || mongoose.model('BacktestResult', BacktestResultSchema)

/**
 * Simple Opening Breakout Strategy Implementation
 */
class OpeningBreakoutStrategy {
  private trades: any[] = []
  private capital: number
  private currentPosition: 'LONG' | 'SHORT' | null = null
  private entryPrice: number = 0
  private maxDrawdown: number = 0
  private peakCapital: number
  
  constructor(initialCapital: number) {
    this.capital = initialCapital
    this.peakCapital = initialCapital
  }
  
  async processCandle(candle: any, previousCandles: any[]): Promise<void> {
    // Simple opening breakout logic
    // If price breaks above previous day high, go long
    // If price breaks below previous day low, go short
    
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
    this.currentPosition = direction
    this.entryPrice = candle.close
    
    this.trades.push({
      date: candle.date,
      action: direction === 'LONG' ? 'BUY' : 'SELL',
      price: candle.close,
      quantity: 25, // Nifty lot size
      pnl: 0,
      capital: this.capital
    })
  }
  
  private closePosition(candle: any): void {
    if (!this.currentPosition) return
    
    const pnl = this.currentPosition === 'LONG' ? 
      (candle.close - this.entryPrice) * 25 : 
      (this.entryPrice - candle.close) * 25
    
    this.capital += pnl
    
    this.trades.push({
      date: candle.date,
      action: this.currentPosition === 'LONG' ? 'SELL' : 'BUY',
      price: candle.close,
      quantity: 25,
      pnl: pnl,
      capital: this.capital
    })
    
    this.currentPosition = null
    this.entryPrice = 0
  }
  
  getResults() {
    const winningTrades = this.trades.filter(t => t.pnl > 0).length
    const losingTrades = this.trades.filter(t => t.pnl < 0).length
    const totalTrades = this.trades.filter(t => t.pnl !== 0).length
    const totalPnL = this.trades.reduce((sum, t) => sum + t.pnl, 0)
    
    return {
      trades: this.trades,
      totalTrades,
      winningTrades,
      losingTrades,
      totalPnL,
      finalCapital: this.capital,
      maxDrawdown: this.maxDrawdown,
      winRate: totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0
    }
  }
}

/**
 * POST /api/backtest/local - Run local backtest
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
    const { startDate, endDate, initialCapital = 100000, symbol = 'NIFTY' } = body
    
    // Validate parameters
    if (!startDate || !endDate) {
      return NextResponse.json({
        success: false,
        error: 'Start date and end date are required'
      }, { status: 400 })
    }

    // Generate backtest ID
    const backtestId = `bt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    
    // Create backtest record
    const backtestRecord = new BacktestResult({
      backtestId,
      userId: session.user.email,
      status: 'RUNNING',
      botId: 'nifty50-futures-bot',
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      initialCapital,
      symbol,
      finalCapital: initialCapital
    })
    
    await backtestRecord.save()
    
    // Start backtest in background
    runBacktestInBackground(backtestId, startDate, endDate, initialCapital, symbol)
    
    return NextResponse.json({
      success: true,
      backtestId,
      message: 'Backtest started successfully',
      status: 'RUNNING'
    })
    
  } catch (error: any) {
    console.error('Local backtest error:', error)
    return NextResponse.json({
      success: false,
      error: error.message || 'Internal server error'
    }, { status: 500 })
  }
}

/**
 * GET /api/backtest/local - Get backtest status and results
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

    const { searchParams } = new URL(request.url)
    const backtestId = searchParams.get('id')
    
    if (backtestId) {
      // Get specific backtest
      const backtest = await BacktestResult.findOne({ 
        backtestId, 
        userId: session.user.email 
      })
      
      if (!backtest) {
        return NextResponse.json({
          success: false,
          error: 'Backtest not found'
        }, { status: 404 })
      }
      
      return NextResponse.json({
        success: true,
        backtest: {
          id: backtest.backtestId,
          status: backtest.status,
          progress: backtest.progress,
          parameters: {
            startDate: backtest.startDate,
            endDate: backtest.endDate,
            initialCapital: backtest.initialCapital,
            symbol: backtest.symbol
          },
          results: backtest.status === 'COMPLETED' ? {
            totalTrades: backtest.totalTrades,
            winningTrades: backtest.winningTrades,
            losingTrades: backtest.losingTrades,
            totalPnL: backtest.totalPnL,
            finalCapital: backtest.finalCapital,
            maxDrawdown: backtest.maxDrawdown,
            winRate: backtest.winRate,
            trades: backtest.trades
          } : null,
          error: backtest.error,
          createdAt: backtest.createdAt,
          completedAt: backtest.completedAt
        }
      })
    } else {
      // List all user backtests
      const backtests = await BacktestResult.find({ 
        userId: session.user.email 
      }).sort({ createdAt: -1 }).limit(20)
      
      return NextResponse.json({
        success: true,
        backtests: backtests.map(bt => ({
          id: bt.backtestId,
          status: bt.status,
          progress: bt.progress,
          parameters: {
            startDate: bt.startDate,
            endDate: bt.endDate,
            initialCapital: bt.initialCapital,
            symbol: bt.symbol
          },
          createdAt: bt.createdAt,
          completedAt: bt.completedAt
        }))
      })
    }
    
  } catch (error: any) {
    console.error('Local backtest GET error:', error)
    return NextResponse.json({
      success: false,
      error: error.message || 'Internal server error'
    }, { status: 500 })
  }
}

/**
 * Background backtest execution
 */
async function runBacktestInBackground(
  backtestId: string, 
  startDate: string, 
  endDate: string, 
  initialCapital: number,
  symbol: string
) {
  try {
    console.log(`🧪 Starting backtest ${backtestId}`)
    
    // Connect to database
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/tradebot')
    }
    
    // Log backtest parameters
    console.log(`📊 Backtest parameters: ${startDate} to ${endDate}, Capital: ₹${initialCapital}`)
    
    // First, check what data is available in the database
    const availableDataSample = await HistoricalData.find({
      symbol: '"NIFTY"',
      timeframe: '5minute'
    }).sort({ date: 1 }).limit(5)
    
    const totalAvailableRecords = await HistoricalData.countDocuments({
      symbol: '"NIFTY"',
      timeframe: '5minute'
    })
    
    console.log(`📈 Available NIFTY data: ${totalAvailableRecords} total records`)
    if (availableDataSample.length > 0) {
      const firstDate = availableDataSample[0].date
      const lastSample = await HistoricalData.findOne({
        symbol: '"NIFTY"',
        timeframe: '5minute'
      }).sort({ date: -1 })
      const lastDate = lastSample?.date
      
      console.log(`📅 Data range available: ${firstDate?.toISOString().split('T')[0]} to ${lastDate?.toISOString().split('T')[0]}`)
    }
    
    // Get historical data - note: symbol is stored as "NIFTY" with quotes from Zerodha API
    const historicalData = await HistoricalData.find({
      symbol: '"NIFTY"',
      timeframe: '5minute',
      date: {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      }
    }).sort({ date: 1 })
    
    if (historicalData.length === 0) {
      console.log(`❌ No historical data found for ${startDate} to ${endDate}`)
      console.log(`🔍 Query dates: ${new Date(startDate).toISOString()} to ${new Date(endDate).toISOString()}`)
      
      await BacktestResult.updateOne(
        { backtestId },
        { 
          status: 'FAILED', 
          error: `No historical data found for the selected period. Available data: ${totalAvailableRecords} records`,
          progress: 0
        }
      )
      return
    }
    
    console.log(`📊 Found ${historicalData.length} data points for backtest`)
    
    // Run strategy
    const strategy = new OpeningBreakoutStrategy(initialCapital)
    const totalCandles = historicalData.length
    
    for (let i = 0; i < historicalData.length; i++) {
      const candle = historicalData[i]
      const previousCandles = historicalData.slice(Math.max(0, i - 20), i) // Last 20 candles
      
      await strategy.processCandle(candle, previousCandles)
      
      // Update progress every 100 candles
      if (i % 100 === 0) {
        const progress = Math.round((i / totalCandles) * 100)
        await BacktestResult.updateOne(
          { backtestId },
          { progress }
        )
      }
    }
    
    // Get final results
    const results = strategy.getResults()
    
    console.log(`📊 Strategy completed processing ${historicalData.length} candles`)
    console.log(`💼 Final Results:`)
    console.log(`   - Total Trades: ${results.totalTrades}`)
    console.log(`   - Winning Trades: ${results.winningTrades}`)
    console.log(`   - Losing Trades: ${results.losingTrades}`)
    console.log(`   - Total P&L: ₹${results.totalPnL.toFixed(2)}`)
    console.log(`   - Final Capital: ₹${results.finalCapital.toFixed(2)}`)
    console.log(`   - Max Drawdown: ${results.maxDrawdown.toFixed(2)}%`)
    console.log(`   - Win Rate: ${results.winRate.toFixed(2)}%`)
    
    // Update backtest record with results
    const updateResult = await BacktestResult.updateOne(
      { backtestId },
      {
        status: 'COMPLETED',
        progress: 100,
        totalTrades: results.totalTrades,
        winningTrades: results.winningTrades,
        losingTrades: results.losingTrades,
        totalPnL: results.totalPnL,
        finalCapital: results.finalCapital,
        maxDrawdown: results.maxDrawdown,
        winRate: results.winRate,
        trades: results.trades,
        completedAt: new Date()
      }
    )
    
    console.log(`✅ Backtest ${backtestId} completed successfully`)
    console.log(`💾 Database update result:`, updateResult.modifiedCount > 0 ? 'SUCCESS' : 'NO_CHANGES')
    console.log(`📈 Final Results: ${results.totalTrades} trades, ₹${results.totalPnL.toFixed(2)} P&L`)
    
  } catch (error) {
    console.error(`❌ Backtest ${backtestId} failed:`, error)
    
    await BacktestResult.updateOne(
      { backtestId },
      {
        status: 'FAILED',
        error: (error as Error).message,
        progress: 0
      }
    )
  }
}