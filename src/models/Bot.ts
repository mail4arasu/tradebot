import mongoose from 'mongoose'

const BotSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String, required: true },
  strategy: { type: String, required: true },
  riskLevel: { type: String, enum: ['LOW', 'MEDIUM', 'HIGH'], required: true },
  minInvestment: { type: Number, required: true },
  maxInvestment: { type: Number, required: true },
  expectedReturn: { type: Number, required: true },
  isActive: { type: Boolean, default: true },
  parameters: { type: mongoose.Schema.Types.Mixed, default: {} },
  // New fields for automated trading
  webhookUrl: { type: String }, // TradingView webhook URL
  emergencyStop: { type: Boolean, default: false }, // Emergency stop flag
  symbol: { type: String }, // Trading symbol (e.g., "NIFTY50")
  exchange: { type: String }, // Exchange (e.g., "NFO")
  instrumentType: { type: String }, // Instrument type (e.g., "FUTURES")
  // Trade lifecycle management fields
  tradingType: { 
    type: String, 
    enum: ['INTRADAY', 'POSITIONAL'], 
    required: true,
    default: 'INTRADAY'
  },
  intradayExitTime: { 
    type: String, 
    default: '15:15' // Default exit time for intraday bots (3:15 PM)
  },
  autoSquareOff: { 
    type: Boolean, 
    default: true // Auto exit for intraday bots
  },
  allowMultiplePositions: { 
    type: Boolean, 
    default: false // Allow multiple open positions simultaneously
  },
  maxPositionHoldDays: { 
    type: Number, 
    default: 1 // For positional bots - max days to hold position
  }
}, {
  timestamps: true
})

export default mongoose.models.Bot || mongoose.model('Bot', BotSchema)