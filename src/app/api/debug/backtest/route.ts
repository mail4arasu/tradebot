// Debug endpoint to check backtest status directly
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '../../../../lib/auth'
import mongoose from 'mongoose'

// Backtest Results Schema (same as in local backtest)
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
      // Get specific backtest debug info
      const backtest = await BacktestResult.findOne({ 
        backtestId, 
        userId: session.user.email 
      })
      
      if (!backtest) {
        return NextResponse.json({
          success: false,
          error: 'Backtest not found',
          backtestId,
          userId: session.user.email
        })
      }
      
      return NextResponse.json({
        success: true,
        debug: {
          found: true,
          backtestId,
          userId: session.user.email,
          status: backtest.status,
          progress: backtest.progress,
          createdAt: backtest.createdAt,
          completedAt: backtest.completedAt,
          totalTrades: backtest.totalTrades,
          error: backtest.error,
          hasResults: !!(backtest.totalTrades || backtest.totalPnL),
          documentId: backtest._id
        },
        fullRecord: backtest
      })
    } else {
      // List all backtests for debugging
      const backtests = await BacktestResult.find({ 
        userId: session.user.email 
      }).sort({ createdAt: -1 }).limit(10)
      
      const summary = backtests.map(bt => ({
        backtestId: bt.backtestId,
        status: bt.status,
        progress: bt.progress,
        createdAt: bt.createdAt,
        completedAt: bt.completedAt,
        totalTrades: bt.totalTrades,
        error: bt.error
      }))
      
      return NextResponse.json({
        success: true,
        debug: {
          totalFound: backtests.length,
          userId: session.user.email,
          mongoConnectionState: mongoose.connection.readyState
        },
        backtests: summary
      })
    }
    
  } catch (error: any) {
    console.error('Debug backtest error:', error)
    return NextResponse.json({
      success: false,
      error: error.message,
      stack: error.stack
    }, { status: 500 })
  }
}