// Direct Local Backtest Results - Bypass VM entirely
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '../../../../../lib/auth'
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
    console.log(`🔍 Direct local lookup for backtest: ${backtestId}`)
    
    // Get backtest directly from database
    const backtest = await BacktestResult.findOne({ 
      backtestId, 
      userId: session.user.email 
    })
    
    if (!backtest) {
      console.log(`❌ Backtest ${backtestId} not found for user ${session.user.email}`)
      return NextResponse.json({
        success: false,
        error: 'Backtest not found'
      }, { status: 404 })
    }
    
    console.log(`✅ Found backtest ${backtestId}:`, {
      status: backtest.status,
      progress: backtest.progress,
      totalTrades: backtest.totalTrades,
      totalPnL: backtest.totalPnL,
      hasResults: !!(backtest.totalTrades || backtest.totalPnL),
      completedAt: backtest.completedAt
    })
    
    // Format results
    const result = {
      id: backtestId,
      status: backtest.status,
      progress: backtest.progress,
      totalReturn: backtest.totalPnL || 0,
      totalReturnPercent: backtest.totalPnL ? 
        ((backtest.totalPnL / (backtest.initialCapital || 100000)) * 100).toFixed(2) : 
        "0.00",
      winRate: backtest.winRate || 0,
      totalTrades: backtest.totalTrades || 0,
      winningTrades: backtest.winningTrades || 0,
      losingTrades: backtest.losingTrades || 0,
      maxDrawdownPercent: backtest.maxDrawdown || 0,
      finalCapital: backtest.finalCapital || backtest.initialCapital || 100000,
      trades: backtest.trades || [],
      parameters: {
        startDate: backtest.startDate,
        endDate: backtest.endDate,
        initialCapital: backtest.initialCapital,
        symbol: backtest.symbol,
        botId: backtest.botId
      },
      createdAt: backtest.createdAt,
      completedAt: backtest.completedAt,
      error: backtest.error
    }
    
    return NextResponse.json({
      success: true,
      result,
      source: 'direct-local',
      debug: {
        mongoState: mongoose.connection.readyState,
        userId: session.user.email,
        backtestFound: true
      }
    })
    
  } catch (error: any) {
    console.error('Direct local backtest lookup error:', error)
    return NextResponse.json({
      success: false,
      error: error.message,
      source: 'direct-local-error'
    }, { status: 500 })
  }
}