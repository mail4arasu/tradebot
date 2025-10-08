import mongoose from 'mongoose'

const ExitExecutionSchema = new mongoose.Schema({
  executionId: { type: mongoose.Schema.Types.ObjectId, ref: 'TradeExecution', required: true },
  signalId: { type: mongoose.Schema.Types.ObjectId, ref: 'WebhookSignal', required: true },
  quantity: { type: Number, required: true },
  price: { type: Number, required: true },
  time: { type: Date, required: true },
  orderId: { type: String, required: true },
  reason: { 
    type: String, 
    enum: ['SIGNAL', 'AUTO_SQUARE_OFF', 'EMERGENCY', 'MANUAL'],
    required: true 
  }
}, { _id: false })

const PositionSchema = new mongoose.Schema({
  // References
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  botId: { type: mongoose.Schema.Types.ObjectId, ref: 'Bot', required: true },
  allocationId: { type: mongoose.Schema.Types.ObjectId, ref: 'UserBotAllocation', required: true },
  
  // Position Identity
  symbol: { type: String, required: true },
  exchange: { type: String, required: true },
  instrumentType: { type: String, required: true },
  positionId: { type: String, required: true, unique: true }, // Unique position identifier
  
  // Entry Details
  entryExecutionId: { type: mongoose.Schema.Types.ObjectId, ref: 'TradeExecution', required: true },
  entrySignalId: { type: mongoose.Schema.Types.ObjectId, ref: 'WebhookSignal', required: true },
  entryPrice: { type: Number, required: true },
  entryQuantity: { type: Number, required: true },
  entryTime: { type: Date, required: true },
  entryOrderId: { type: String, required: true },
  side: { 
    type: String, 
    enum: ['LONG', 'SHORT'], 
    required: true 
  },
  
  // Current Status
  status: { 
    type: String, 
    enum: ['OPEN', 'CLOSED', 'PARTIAL'], 
    default: 'OPEN' 
  },
  currentQuantity: { type: Number, required: true }, // Remaining quantity
  averagePrice: { type: Number, required: true }, // Average entry price
  
  // Exit Details (when closed)
  exitExecutions: [ExitExecutionSchema],
  
  // P&L Tracking
  unrealizedPnl: { type: Number, default: 0 },
  realizedPnl: { type: Number, default: 0 },
  totalFees: { type: Number, default: 0 },
  
  // Bot Configuration
  isIntraday: { type: Boolean, required: true },
  scheduledExitTime: { type: String }, // e.g., "15:15"
  autoSquareOffScheduled: { type: Boolean, default: false },
  
  // Risk Management
  stopLoss: { type: Number },
  target: { type: Number },
  
  // Emergency Controls
  emergencySquareOff: { type: Boolean, default: false },
  emergencySquareOffTime: { type: Date },
  exitReason: { 
    type: String, 
    enum: ['SIGNAL', 'AUTO_SQUARE_OFF', 'EMERGENCY_SQUARE_OFF', 'MANUAL', 'STOP_LOSS', 'TARGET'],
    default: 'SIGNAL'
  },
  
  // Additional Data
  notes: { type: String },
  tags: [{ type: String }]
}, {
  timestamps: true
})

// Indexes for performance
PositionSchema.index({ userId: 1, status: 1 })
PositionSchema.index({ botId: 1, status: 1 })
PositionSchema.index({ positionId: 1 })
PositionSchema.index({ entrySignalId: 1 })
PositionSchema.index({ status: 1, createdAt: -1 })
PositionSchema.index({ userId: 1, createdAt: -1 })
PositionSchema.index({ isIntraday: 1, status: 1, scheduledExitTime: 1 })

export default mongoose.models.Position || mongoose.model('Position', PositionSchema)