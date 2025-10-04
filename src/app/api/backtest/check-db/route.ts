// Quick Database Check for Backtests
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '../../../../lib/auth'
import mongoose from 'mongoose'

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
    action: String,
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
      // Check specific backtest
      const backtest = await BacktestResult.findOne({ 
        backtestId, 
        userId: session.user.email 
      })
      
      return NextResponse.json({
        success: true,
        found: !!backtest,
        backtest: backtest ? {
          id: backtest.backtestId,
          status: backtest.status,
          progress: backtest.progress,
          totalTrades: backtest.totalTrades,
          totalPnL: backtest.totalPnL,
          winRate: backtest.winRate,
          error: backtest.error,
          hasResults: !!(backtest.totalTrades || backtest.totalPnL),
          tradesCount: backtest.trades ? backtest.trades.length : 0,
          createdAt: backtest.createdAt,
          completedAt: backtest.completedAt
        } : null,
        query: { backtestId, userId: session.user.email }
      })
    } else {
      // List all backtests
      const backtests = await BacktestResult.find({ 
        userId: session.user.email 
      }).sort({ createdAt: -1 }).limit(5)
      
      return NextResponse.json({
        success: true,
        totalFound: backtests.length,
        backtests: backtests.map(bt => ({
          id: bt.backtestId,
          status: bt.status,
          progress: bt.progress,
          totalTrades: bt.totalTrades,
          totalPnL: bt.totalPnL,
          hasResults: !!(bt.totalTrades || bt.totalPnL),
          tradesCount: bt.trades ? bt.trades.length : 0,
          createdAt: bt.createdAt,
          completedAt: bt.completedAt,
          error: bt.error
        })),
        userId: session.user.email,
        mongoState: mongoose.connection.readyState
      })
    }
    
  } catch (error: any) {
    console.error('Database check error:', error)
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 })
  }
}