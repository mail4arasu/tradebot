import mongoose from 'mongoose'

const TradeSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  tradingSymbol: { type: String, required: true },
  exchange: { type: String, required: true },
  instrumentToken: { type: Number, required: true },
  quantity: { type: Number, required: true },
  price: { type: Number, required: true },
  product: { type: String, required: true },
  orderType: { type: String, required: true },
  transactionType: { type: String, enum: ['BUY', 'SELL'], required: true },
  timestamp: { type: Date, required: true },
  orderId: { type: String, required: true },
  botId: { type: mongoose.Schema.Types.ObjectId, ref: 'Bot' },
  pnl: { type: Number },
  
  // Enhanced fields for bot trade attribution
  tradeSource: { 
    type: String, 
    enum: ['MANUAL', 'BOT'], 
    default: 'MANUAL' 
  },
  executionId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'TradeExecution' 
  }, // Reference to trade execution record
  signalId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'WebhookSignal' 
  }, // Reference to original signal
  
  // Zerodha trade details
  tradeId: { type: String }, // Zerodha trade ID
  fees: { type: Number }, // Trading fees
  
  // Detailed charges from Zerodha API
  charges: {
    brokerage: { type: Number, default: 0 },
    stt: { type: Number, default: 0 }, // Securities Transaction Tax
    exchangeCharges: { type: Number, default: 0 },
    gst: { type: Number, default: 0 }, // Total GST (CGST + SGST + IGST)
    cgst: { type: Number, default: 0 },
    sgst: { type: Number, default: 0 },
    igst: { type: Number, default: 0 },
    sebiCharges: { type: Number, default: 0 },
    stampCharges: { type: Number, default: 0 },
    totalCharges: { type: Number, default: 0 }, // Sum of all charges
    netAmount: { type: Number, default: 0 }, // Trade value after all charges
    currency: { type: String, default: 'INR' }
  },
  
  // P&L tracking
  grossPnl: { type: Number, default: 0 }, // P&L before charges
  netPnl: { type: Number, default: 0 }, // P&L after all charges
  turnover: { type: Number, default: 0 }, // Trade value (quantity * price)
  
  // Quarterly reporting fields
  financialYear: { type: String }, // FY2024-25
  quarter: { type: String }, // Q1, Q2, Q3, Q4
  taxYear: { type: String }, // 2024-25
  
  // Sync tracking
  syncedAt: { type: Date }, // When this trade was synced from Zerodha
  lastSyncCheck: { type: Date }, // Last time we checked this trade
  chargesLastUpdated: { type: Date }, // When charges were last updated
  zerodhaData: { type: mongoose.Schema.Types.Mixed } // Raw Zerodha trade data
}, {
  timestamps: true
})

// Indexes for performance
TradeSchema.index({ userId: 1, timestamp: -1 })
TradeSchema.index({ tradeSource: 1, userId: 1 })
TradeSchema.index({ botId: 1, timestamp: -1 })
TradeSchema.index({ orderId: 1 }, { unique: true })
TradeSchema.index({ tradeId: 1 })

// Indexes for quarterly reporting
TradeSchema.index({ userId: 1, financialYear: 1, quarter: 1 })
TradeSchema.index({ userId: 1, taxYear: 1 })
TradeSchema.index({ userId: 1, timestamp: 1, 'charges.totalCharges': 1 })
TradeSchema.index({ financialYear: 1, quarter: 1, timestamp: -1 })

export default mongoose.models.Trade || mongoose.model('Trade', TradeSchema)