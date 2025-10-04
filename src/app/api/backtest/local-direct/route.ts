// Direct Local Backtest List - Bypass VM entirely
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

    console.log(`🔍 Listing all backtests for user: ${session.user.email}`)
    
    // Get all backtests for this user
    const backtests = await BacktestResult.find({ 
      userId: session.user.email 
    }).sort({ createdAt: -1 }).limit(10)
    
    console.log(`✅ Found ${backtests.length} backtests`)
    
    const formattedBacktests = backtests.map(bt => ({
      id: bt.backtestId,
      status: bt.status,
      progress: bt.progress,
      totalTrades: bt.totalTrades,
      totalPnL: bt.totalPnL,
      winRate: bt.winRate,
      parameters: {
        startDate: bt.startDate,
        endDate: bt.endDate,
        initialCapital: bt.initialCapital,
        symbol: bt.symbol,
        botId: bt.botId
      },
      createdAt: bt.createdAt,
      completedAt: bt.completedAt,
      error: bt.error,
      hasResults: !!(bt.totalTrades || bt.totalPnL)
    }))
    
    return NextResponse.json({
      success: true,
      backtests: formattedBacktests,
      source: 'direct-local',
      debug: {
        mongoState: mongoose.connection.readyState,
        userId: session.user.email,
        totalFound: backtests.length
      }
    })
    
  } catch (error: any) {
    console.error('Direct local backtest list error:', error)
    return NextResponse.json({
      success: false,
      error: error.message,
      source: 'direct-local-error'
    }, { status: 500 })
  }
}