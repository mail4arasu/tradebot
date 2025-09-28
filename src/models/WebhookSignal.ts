import mongoose from 'mongoose'

const WebhookSignalSchema = new mongoose.Schema({
  botId: { type: mongoose.Schema.Types.ObjectId, ref: 'Bot', required: true },
  signal: { 
    type: String, 
    enum: ['BUY', 'SELL', 'EXIT', 'ENTRY'], 
    required: true 
  },
  symbol: { type: String, required: true }, // e.g., "NIFTY50"
  exchange: { type: String, required: true }, // e.g., "NFO"
  instrumentType: { type: String, required: true }, // e.g., "FUTURES"
  
  // Signal details
  price: { type: Number }, // Signal price (optional)
  stopLoss: { type: Number }, // Stop loss price (optional)
  target: { type: Number }, // Target price (optional)
  
  // Processing status
  processed: { type: Boolean, default: false },
  processedAt: { type: Date },
  emergencyStop: { type: Boolean, default: false }, // Was emergency stop active?
  
  // Original webhook payload
  rawPayload: { type: mongoose.Schema.Types.Mixed }, // Store original TradingView data
  
  // Processing results
  affectedUsers: [{ 
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    executed: { type: Boolean, default: false },
    executionId: { type: mongoose.Schema.Types.ObjectId, ref: 'TradeExecution' },
    error: { type: String }
  }],
  
  // Statistics
  totalUsersTargeted: { type: Number, default: 0 },
  successfulExecutions: { type: Number, default: 0 },
  failedExecutions: { type: Number, default: 0 }
}, {
  timestamps: true
})

// Indexes for performance
WebhookSignalSchema.index({ botId: 1, createdAt: -1 })
WebhookSignalSchema.index({ signal: 1, processed: 1 })
WebhookSignalSchema.index({ emergencyStop: 1 })

export default mongoose.models.WebhookSignal || mongoose.model('WebhookSignal', WebhookSignalSchema)