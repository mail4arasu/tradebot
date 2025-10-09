import mongoose from 'mongoose'

const TradeExecutionSchema = new mongoose.Schema({
  // References
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  botId: { type: mongoose.Schema.Types.ObjectId, ref: 'Bot', required: true },
  signalId: { type: mongoose.Schema.Types.ObjectId, ref: 'WebhookSignal', required: true },
  allocationId: { type: mongoose.Schema.Types.ObjectId, ref: 'UserBotAllocation', required: true },
  
  // Trade details
  symbol: { type: String, required: true },
  exchange: { type: String, required: true },
  instrumentType: { type: String, required: true },
  quantity: { type: Number, required: true }, // User-defined quantity
  orderType: { 
    type: String, 
    enum: ['BUY', 'SELL', 'EXIT'], 
    required: true 
  },
  
  // Zerodha integration
  zerodhaOrderId: { type: String }, // Zerodha order ID
  zerodhaTradeId: { type: String }, // Zerodha trade ID (after execution)
  exchangeOrderId: { type: String }, // Exchange order ID from Zerodha
  
  // Execution details
  requestedPrice: { type: Number }, // Price from signal
  executedPrice: { type: Number }, // Actual execution price
  executedQuantity: { type: Number }, // Actual executed quantity
  
  // Status tracking
  status: { 
    type: String, 
    enum: ['PENDING', 'SUBMITTED', 'EXECUTED', 'FAILED', 'CANCELLED'], 
    default: 'PENDING' 
  },
  
  // Timestamps
  submittedAt: { type: Date }, // When order was submitted to Zerodha
  executedAt: { type: Date }, // When order was executed
  
  // Error handling
  error: { type: String }, // Error message if failed
  retryCount: { type: Number, default: 0 }, // Number of retry attempts
  
  // Additional data
  zerodhaResponse: { type: mongoose.Schema.Types.Mixed }, // Full Zerodha API response
  
  // Performance tracking
  pnl: { type: Number }, // P&L for this trade (calculated later)
  fees: { type: Number }, // Trading fees
  
  // Risk management
  isEmergencyExit: { type: Boolean, default: false }, // Was this an emergency exit trade?
  riskCheckPassed: { type: Boolean, default: true }, // Did trade pass risk checks?
  
  // Position linking (new fields for trade lifecycle management)
  positionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Position' }, // Link to position
  tradeType: { 
    type: String, 
    enum: ['ENTRY', 'EXIT', 'PARTIAL_EXIT'], 
    required: true,
    default: 'ENTRY'
  },
  parentPositionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Position' }, // For exit trades
  exitReason: { 
    type: String, 
    enum: ['SIGNAL', 'AUTO_SQUARE_OFF', 'EMERGENCY', 'MANUAL'],
    required: function() { return this.tradeType !== 'ENTRY' }
  }
}, {
  timestamps: true
})

// Indexes for performance
TradeExecutionSchema.index({ userId: 1, createdAt: -1 })
TradeExecutionSchema.index({ botId: 1, status: 1 })
TradeExecutionSchema.index({ signalId: 1 })
TradeExecutionSchema.index({ zerodhaOrderId: 1 })
TradeExecutionSchema.index({ status: 1, createdAt: -1 })
TradeExecutionSchema.index({ positionId: 1, tradeType: 1 }) // Combined index to avoid duplicate
TradeExecutionSchema.index({ tradeType: 1, status: 1 })
TradeExecutionSchema.index({ parentPositionId: 1 })

export default mongoose.models.TradeExecution || mongoose.model('TradeExecution', TradeExecutionSchema)