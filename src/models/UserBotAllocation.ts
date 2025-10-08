import mongoose from 'mongoose'

const UserBotAllocationSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  botId: { type: mongoose.Schema.Types.ObjectId, ref: 'Bot', required: true },
  allocatedAmount: { type: Number, required: true },
  isActive: { type: Boolean, default: true },
  startDate: { type: Date, required: true },
  endDate: { type: Date },
  currentValue: { type: Number, default: 0 },
  totalPnl: { type: Number, default: 0 },
  // New fields for automated trading control
  quantity: { type: Number, required: true }, // User-defined position size
  maxTradesPerDay: { type: Number, required: true, default: 1 }, // Daily trade limit
  currentDayTrades: { type: Number, default: 0 }, // Today's trade count
  lastTradeDate: { type: Date }, // Last trade execution date
  // Risk management
  riskPercentage: { type: Number, required: true, default: 2 }, // Risk per trade as percentage
  positionSizingMethod: { 
    type: String, 
    enum: ['FIXED_QUANTITY', 'RISK_PERCENTAGE'], 
    default: 'RISK_PERCENTAGE' 
  },
  // Trading preferences
  enabledHours: {
    start: { type: String, default: '09:15' }, // Market start time
    end: { type: String, default: '15:30' } // Market end time
  },
  // Performance tracking
  totalTrades: { type: Number, default: 0 },
  successfulTrades: { type: Number, default: 0 },
  lastSignalTime: { type: Date } // Last webhook signal processed
}, {
  timestamps: true
})

export default mongoose.models.UserBotAllocation || mongoose.model('UserBotAllocation', UserBotAllocationSchema)