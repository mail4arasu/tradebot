import mongoose from 'mongoose'

const DailyPnLSnapshotSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  date: { type: String, required: true }, // YYYY-MM-DD format
  
  // Overall Portfolio P&L (from Zerodha)
  totalDayPnL: { type: Number, required: true }, // Today's total P&L
  totalPortfolioPnL: { type: Number, required: true }, // Overall P&L
  totalPortfolioValue: { type: Number, required: true }, // Total portfolio value
  totalInvestmentValue: { type: Number, required: true }, // Total invested amount
  
  // Margin Information
  availableMargin: { type: Number, default: 0 },
  usedMargin: { type: Number, default: 0 },
  totalMargin: { type: Number, default: 0 },
  
  // Bot-specific P&L breakdown
  botPerformance: [{
    botId: { type: mongoose.Schema.Types.ObjectId, ref: 'Bot' },
    botName: { type: String, required: true },
    dayPnL: { type: Number, default: 0 },
    totalPnL: { type: Number, default: 0 },
    openPositions: { type: Number, default: 0 },
    closedPositions: { type: Number, default: 0 },
    totalTrades: { type: Number, default: 0 },
    winRate: { type: Number, default: 0 }, // Percentage
    allocatedAmount: { type: Number, default: 0 }
  }],
  
  // Position-level breakdown
  positions: [{
    symbol: { type: String, required: true },
    exchange: { type: String, required: true },
    quantity: { type: Number, required: true },
    averagePrice: { type: Number, required: true },
    lastPrice: { type: Number, required: true },
    dayPnL: { type: Number, required: true },
    unrealizedPnL: { type: Number, default: 0 },
    realizedPnL: { type: Number, default: 0 },
    botId: { type: mongoose.Schema.Types.ObjectId, ref: 'Bot' },
    botName: { type: String }
  }],
  
  // Holdings breakdown
  holdings: [{
    symbol: { type: String, required: true },
    exchange: { type: String, required: true },
    quantity: { type: Number, required: true },
    averagePrice: { type: Number, required: true },
    lastPrice: { type: Number, required: true },
    dayChange: { type: Number, required: true },
    totalPnL: { type: Number, required: true }
  }],
  
  // Raw Zerodha data for reference
  zerodhaSnapshot: { type: mongoose.Schema.Types.Mixed },
  
  // Metadata
  snapshotTime: { type: Date, required: true },
  dataSource: { type: String, enum: ['AUTO', 'MANUAL'], default: 'AUTO' }
}, {
  timestamps: true
})

// Indexes for performance
DailyPnLSnapshotSchema.index({ userId: 1, date: -1 }, { unique: true })
DailyPnLSnapshotSchema.index({ userId: 1, snapshotTime: -1 })
DailyPnLSnapshotSchema.index({ 'botPerformance.botId': 1, date: -1 })

export default mongoose.models.DailyPnLSnapshot || mongoose.model('DailyPnLSnapshot', DailyPnLSnapshotSchema)