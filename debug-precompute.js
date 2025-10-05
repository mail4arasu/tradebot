// Debug Pre-computation - Manual Test Script
const mongoose = require('mongoose');

// Schemas (simplified)
const HistoricalDataSchema = new mongoose.Schema({
  symbol: String,
  timeframe: String,
  date: Date,
  open: Number,
  high: Number,
  low: Number,
  close: Number,
  volume: Number
}, { strict: false });

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
  trades: [{ type: mongoose.Schema.Types.Mixed }],
  computedAt: { type: Date, default: Date.now },
  dataPointsUsed: { type: Number, default: 0 },
  status: { type: String, enum: ['COMPUTING', 'COMPLETED', 'FAILED'], default: 'COMPLETED' }
});

const HistoricalData = mongoose.model('HistoricalData', HistoricalDataSchema);
const PrecomputedBacktest = mongoose.model('PrecomputedBacktest', PrecomputedBacktestSchema);

// Simple Opening Breakout Strategy
class SimpleOpeningBreakoutStrategy {
  constructor(initialCapital) {
    this.trades = []
    this.capital = initialCapital
    this.currentPosition = null
    this.entryPrice = 0
    this.entryDate = null
    this.tradeNumber = 0
  }
  
  async processCandle(candle, previousCandles) {
    if (previousCandles.length < 1) return
    
    const prevCandle = previousCandles[previousCandles.length - 1]
    const currentPrice = candle.close
    
    // Close existing position if opposite signal
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
  }
  
  enterPosition(direction, candle) {
    this.tradeNumber++
    this.currentPosition = direction
    this.entryPrice = candle.close
    this.entryDate = new Date(candle.date)
  }
  
  closePosition(candle) {
    if (!this.currentPosition || !this.entryDate) return
    
    const exitPrice = candle.close
    const exitDate = new Date(candle.date)
    const quantity = 25 // Nifty lot size
    
    const pnl = this.currentPosition === 'LONG' ? 
      (exitPrice - this.entryPrice) * quantity : 
      (this.entryPrice - exitPrice) * quantity
    
    this.capital += pnl
    const pnlPercent = (pnl / (this.entryPrice * quantity)) * 100
    
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
      holdingPeriod: (exitDate.getTime() - this.entryDate.getTime()) / (1000 * 60)
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
      maxDrawdown: 0, // Simplified
      winRate,
      sharpeRatio: 0
    }
  }
}

async function debugPrecomputation() {
  try {
    console.log('🔗 Connecting to MongoDB...')
    await mongoose.connect('mongodb://localhost:27017/tradebot')
    console.log('✅ Connected to MongoDB')
    
    // Check historical data availability
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
      console.log('❌ No historical data available')
      return
    }
    
    // Test with 1-month period
    const range = dataRanges[0]
    const symbol = range._id
    const maxDate = new Date(range.maxDate)
    const startDate = new Date(maxDate)
    startDate.setMonth(startDate.getMonth() - 1)
    
    const backtestId = `debug_test_${symbol}_${Date.now()}`
    
    console.log(`🧮 Testing backtest: ${backtestId}`)
    console.log(`📅 Period: ${startDate.toISOString().split('T')[0]} to ${maxDate.toISOString().split('T')[0]}`)
    
    // Get historical data for this period
    const historicalData = await HistoricalData.find({
      symbol: symbol,
      timeframe: '5minute',
      date: {
        $gte: startDate,
        $lte: maxDate
      }
    }).sort({ date: 1 })
    
    console.log(`📈 Found ${historicalData.length} data points`)
    
    if (historicalData.length === 0) {
      console.log('⚠️ No data for period')
      return
    }
    
    // Run strategy
    console.log('🚀 Running strategy...')
    const strategy = new SimpleOpeningBreakoutStrategy(100000)
    
    for (let i = 0; i < historicalData.length; i++) {
      const candle = historicalData[i]
      const previousCandles = historicalData.slice(Math.max(0, i - 20), i)
      await strategy.processCandle(candle, previousCandles)
    }
    
    const strategyResults = strategy.getResults()
    
    console.log('📋 Strategy Results:')
    console.log(`  Total Trades: ${strategyResults.totalTrades}`)
    console.log(`  Total P&L: ₹${strategyResults.totalPnL.toFixed(2)}`)
    console.log(`  Win Rate: ${strategyResults.winRate.toFixed(1)}%`)
    console.log(`  Final Capital: ₹${strategyResults.finalCapital.toFixed(2)}`)
    console.log(`  Trades Array Length: ${strategyResults.trades.length}`)
    
    if (strategyResults.trades.length > 0) {
      console.log('  First Trade:', strategyResults.trades[0])
    }
    
    // Try to store in database
    console.log('💾 Attempting to store in database...')
    
    const precomputedBacktest = new PrecomputedBacktest({
      backtestId,
      strategy: 'opening_breakout',
      symbol: symbol.replace(/"/g, ''),
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
    
    await precomputedBacktest.save()
    console.log('✅ Successfully saved to database!')
    
    // Verify it was saved
    const saved = await PrecomputedBacktest.findOne({ backtestId })
    if (saved) {
      console.log('✅ Verification: Found saved backtest')
      console.log(`  ID: ${saved.backtestId}`)
      console.log(`  Trades: ${saved.trades.length}`)
      console.log(`  P&L: ₹${saved.totalPnL}`)
    } else {
      console.log('❌ Verification failed: Could not find saved backtest')
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message)
    console.error('Stack:', error.stack)
  } finally {
    await mongoose.disconnect()
    process.exit(0)
  }
}

debugPrecomputation()