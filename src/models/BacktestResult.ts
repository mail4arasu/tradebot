// Backtest Result Database Model
import mongoose, { Schema, Document } from 'mongoose'
import { BacktestResult, BacktestParams, TradeDetail, EquityPoint, DailyPnL } from '../lib/backtesting/types'

export interface IBacktestResult extends Document {
  id: string
  params: BacktestParams
  status: 'RUNNING' | 'COMPLETED' | 'FAILED'
  progress: number
  
  // Performance Metrics
  totalReturn: number
  totalReturnPercent: number
  winRate: number
  totalTrades: number
  winningTrades: number
  losingTrades: number
  
  // Risk Metrics
  maxDrawdown: number
  maxDrawdownPercent: number
  recoveryTime: number
  sharpeRatio: number
  sortinoRatio: number
  calmarRatio: number
  
  // Consecutive Stats
  consecutiveLosses: number
  consecutiveProfits: number
  maxConsecutiveLosses: number
  maxConsecutiveProfits: number
  
  // Detailed Results
  trades: TradeDetail[]
  equityCurve: EquityPoint[]
  dailyPnL: DailyPnL[]
  
  // Timing
  startTime: Date
  endTime?: Date
  duration?: number
  
  error?: string
  createdAt: Date
  updatedAt: Date
  
  // Instance methods
  calculateMetrics(): void
  updateProgress(progress: number): void
  markCompleted(): void
  markFailed(error: string): void
}

const TradeDetailSchema = new Schema({
  id: { type: String, required: true },
  entryTime: { type: Date, required: true },
  exitTime: { type: Date },
  symbol: { type: String, required: true },
  side: { type: String, enum: ['LONG', 'SHORT'], required: true },
  entryPrice: { type: Number, required: true },
  exitPrice: { type: Number },
  quantity: { type: Number, required: true },
  pnl: { type: Number },
  fees: { type: Number, required: true },
  exitReason: { 
    type: String, 
    enum: ['TIME_EXIT', 'TAKE_PROFIT', 'STOP_LOSS', 'STRAT_STOP'] 
  },
  stratSignal: {
    is2D2U: { type: Boolean },
    is2U2D: { type: Boolean },
    fibLevel: { type: Number },
    hos: { type: Number },
    los: { type: Number }
  },
  fibEntry: { type: Boolean, default: false }
}, { _id: false })

const EquityPointSchema = new Schema({
  timestamp: { type: Date, required: true },
  equity: { type: Number, required: true },
  drawdown: { type: Number, required: true }
}, { _id: false })

const DailyPnLSchema = new Schema({
  date: { type: Date, required: true },
  pnl: { type: Number, required: true },
  trades: { type: Number, required: true },
  wins: { type: Number, required: true },
  losses: { type: Number, required: true },
  equity: { type: Number, required: true }
}, { _id: false })

const BacktestParamsSchema = new Schema({
  botId: { type: String, required: true },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  initialCapital: { type: Number, required: true },
  lotSize: { type: Number, required: true },
  useStratFilter: { type: Boolean, required: true },
  useGaussianFilter: { type: Boolean, required: true },
  useFibEntry: { type: Boolean, required: true },
  maxBulletsPerDay: { type: Number, required: true },
  takeProfitPercent: { type: Number },
  useStratStops: { type: Boolean, required: true },
  timezone: { type: String, required: true }
}, { _id: false })

const BacktestResultSchema = new Schema<IBacktestResult>({
  id: { 
    type: String, 
    required: true, 
    unique: true,
    index: true 
  },
  params: { 
    type: BacktestParamsSchema, 
    required: true 
  },
  status: { 
    type: String, 
    enum: ['RUNNING', 'COMPLETED', 'FAILED'], 
    required: true,
    index: true
  },
  progress: { 
    type: Number, 
    min: 0, 
    max: 100, 
    default: 0 
  },
  
  // Performance Metrics
  totalReturn: { type: Number, default: 0 },
  totalReturnPercent: { type: Number, default: 0 },
  winRate: { type: Number, default: 0 },
  totalTrades: { type: Number, default: 0 },
  winningTrades: { type: Number, default: 0 },
  losingTrades: { type: Number, default: 0 },
  
  // Risk Metrics
  maxDrawdown: { type: Number, default: 0 },
  maxDrawdownPercent: { type: Number, default: 0 },
  recoveryTime: { type: Number, default: 0 },
  sharpeRatio: { type: Number, default: 0 },
  sortinoRatio: { type: Number, default: 0 },
  calmarRatio: { type: Number, default: 0 },
  
  // Consecutive Stats
  consecutiveLosses: { type: Number, default: 0 },
  consecutiveProfits: { type: Number, default: 0 },
  maxConsecutiveLosses: { type: Number, default: 0 },
  maxConsecutiveProfits: { type: Number, default: 0 },
  
  // Detailed Results
  trades: [TradeDetailSchema],
  equityCurve: [EquityPointSchema],
  dailyPnL: [DailyPnLSchema],
  
  // Timing
  startTime: { type: Date, required: true },
  endTime: { type: Date },
  duration: { type: Number },
  
  error: { type: String }
}, {
  timestamps: true,
  collection: 'backtest_results'
})

// Indexes for better query performance
BacktestResultSchema.index({ 'params.botId': 1 })
BacktestResultSchema.index({ startTime: -1 })
BacktestResultSchema.index({ status: 1, 'params.botId': 1 })
BacktestResultSchema.index({ createdAt: -1 })

// Instance methods
BacktestResultSchema.methods.calculateMetrics = function(): void {
  const trades = this.trades.filter((t: TradeDetail) => t.pnl !== undefined)
  
  if (trades.length === 0) return
  
  // Basic metrics
  this.totalTrades = trades.length
  this.winningTrades = trades.filter((t: TradeDetail) => (t.pnl || 0) > 0).length
  this.losingTrades = trades.filter((t: TradeDetail) => (t.pnl || 0) < 0).length
  this.winRate = this.totalTrades > 0 ? (this.winningTrades / this.totalTrades) * 100 : 0
  
  // P&L calculations
  this.totalReturn = trades.reduce((sum: number, t: TradeDetail) => sum + (t.pnl || 0), 0)
  this.totalReturnPercent = this.params.initialCapital > 0 ? 
    (this.totalReturn / this.params.initialCapital) * 100 : 0
  
  // Drawdown calculations
  let peak = this.params.initialCapital
  let maxDD = 0
  
  this.equityCurve.forEach((point: EquityPoint) => {
    if (point.equity > peak) peak = point.equity
    const drawdown = peak - point.equity
    const ddPercent = peak > 0 ? (drawdown / peak) * 100 : 0
    
    point.drawdown = ddPercent
    if (drawdown > maxDD) maxDD = drawdown
  })
  
  this.maxDrawdown = maxDD
  this.maxDrawdownPercent = this.params.initialCapital > 0 ? 
    (maxDD / this.params.initialCapital) * 100 : 0
  
  // Consecutive calculations
  let currentConsecutive = 0
  let maxConsecutiveProfits = 0
  let maxConsecutiveLosses = 0
  let lastWasProfit = false
  
  trades.forEach((trade: TradeDetail) => {
    const isProfit = (trade.pnl || 0) > 0
    
    if (isProfit === lastWasProfit) {
      currentConsecutive++
    } else {
      if (lastWasProfit) {
        maxConsecutiveProfits = Math.max(maxConsecutiveProfits, currentConsecutive)
      } else {
        maxConsecutiveLosses = Math.max(maxConsecutiveLosses, currentConsecutive)
      }
      currentConsecutive = 1
      lastWasProfit = isProfit
    }
  })
  
  // Handle final sequence
  if (lastWasProfit) {
    maxConsecutiveProfits = Math.max(maxConsecutiveProfits, currentConsecutive)
  } else {
    maxConsecutiveLosses = Math.max(maxConsecutiveLosses, currentConsecutive)
  }
  
  this.maxConsecutiveProfits = maxConsecutiveProfits
  this.maxConsecutiveLosses = maxConsecutiveLosses
}

BacktestResultSchema.methods.updateProgress = function(progress: number): void {
  this.progress = Math.min(100, Math.max(0, progress))
}

BacktestResultSchema.methods.markCompleted = function(): void {
  this.status = 'COMPLETED'
  this.endTime = new Date()
  this.duration = this.endTime.getTime() - this.startTime.getTime()
  this.progress = 100
  this.calculateMetrics()
}

BacktestResultSchema.methods.markFailed = function(error: string): void {
  this.status = 'FAILED'
  this.endTime = new Date()
  this.duration = this.endTime.getTime() - this.startTime.getTime()
  this.error = error
}

export const BacktestResultModel = mongoose.model<IBacktestResult>('BacktestResult', BacktestResultSchema)
export default BacktestResultModel