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
  parameters: { type: mongoose.Schema.Types.Mixed, default: {} }
}, {
  timestamps: true
})

export default mongoose.models.Bot || mongoose.model('Bot', BotSchema)