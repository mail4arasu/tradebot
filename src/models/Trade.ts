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
  
  // Sync tracking
  syncedAt: { type: Date }, // When this trade was synced from Zerodha
  lastSyncCheck: { type: Date }, // Last time we checked this trade
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

export default mongoose.models.Trade || mongoose.model('Trade', TradeSchema)