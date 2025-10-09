import mongoose from 'mongoose'

const OrderStateSchema = new mongoose.Schema({
  // Order Identity
  orderId: {
    type: String,
    required: true,
    unique: true
  },
  
  // Related Records
  tradeExecutionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TradeExecution',
    required: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // Order Details
  symbol: {
    type: String,
    required: true
  },
  exchange: {
    type: String,
    required: true
  },
  orderType: {
    type: String,
    enum: ['MARKET', 'LIMIT', 'SL', 'SL-M'],
    required: true
  },
  transactionType: {
    type: String,
    enum: ['BUY', 'SELL'],
    required: true
  },
  quantity: {
    type: Number,
    required: true
  },
  price: {
    type: Number
  },
  
  // State Tracking
  placementStatus: {
    type: String,
    enum: ['PLACED', 'PLACEMENT_FAILED', 'PLACEMENT_ERROR'],
    default: 'PLACED'
  },
  confirmationStatus: {
    type: String,
    enum: ['PENDING', 'CONFIRMING', 'CONFIRMED', 'TIMEOUT', 'FAILED'],
    default: 'PENDING'
  },
  executionStatus: {
    type: String,
    enum: ['COMPLETE', 'PARTIAL', 'OPEN', 'CANCELLED', 'REJECTED', 'UNKNOWN'],
    default: 'UNKNOWN'
  },
  
  // Execution Results
  executedQuantity: {
    type: Number,
    default: 0
  },
  executedPrice: {
    type: Number
  },
  pendingQuantity: {
    type: Number,
    default: 0
  },
  
  // Confirmation Process
  confirmationAttempts: {
    type: Number,
    default: 0
  },
  totalConfirmationTime: {
    type: Number, // milliseconds
    default: 0
  },
  lastStatusCheck: {
    type: Date
  },
  
  // Error Handling
  error: {
    type: String
  },
  statusMessage: {
    type: String
  },
  
  // Zerodha Raw Data
  zerodhaOrderData: {
    type: mongoose.Schema.Types.Mixed
  },
  zerodhaPlacementResponse: {
    type: mongoose.Schema.Types.Mixed
  },
  
  // Process Control
  needsManualReview: {
    type: Boolean,
    default: false
  },
  manualReviewReason: {
    type: String
  },
  
  // Audit Trail
  statusHistory: [{
    status: String,
    timestamp: { type: Date, default: Date.now },
    details: String
  }]
}, {
  timestamps: true
})

// Indexes for efficient queries
OrderStateSchema.index({ orderId: 1 }, { unique: true })
OrderStateSchema.index({ confirmationStatus: 1, lastStatusCheck: 1 })
OrderStateSchema.index({ executionStatus: 1, createdAt: 1 })
OrderStateSchema.index({ userId: 1, createdAt: -1 })
OrderStateSchema.index({ needsManualReview: 1 })

// Helper methods
OrderStateSchema.methods.addStatusHistory = function(status: string, details?: string) {
  this.statusHistory.push({
    status,
    timestamp: new Date(),
    details: details || ''
  })
}

OrderStateSchema.methods.markForManualReview = function(reason: string) {
  this.needsManualReview = true
  this.manualReviewReason = reason
  this.addStatusHistory('MANUAL_REVIEW_REQUIRED', reason)
}

// Static methods for common queries
OrderStateSchema.statics.findPendingConfirmations = function() {
  return this.find({
    confirmationStatus: { $in: ['PENDING', 'CONFIRMING'] },
    createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } // Last 24 hours
  }).sort({ createdAt: 1 })
}

OrderStateSchema.statics.findStaleOrders = function(timeoutMinutes: number = 60) {
  return this.find({
    confirmationStatus: { $in: ['PENDING', 'CONFIRMING'] },
    lastStatusCheck: { $lt: new Date(Date.now() - timeoutMinutes * 60 * 1000) }
  })
}

export default mongoose.models.OrderState || mongoose.model('OrderState', OrderStateSchema)