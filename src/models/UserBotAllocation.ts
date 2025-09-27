import mongoose from 'mongoose'

const UserBotAllocationSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  botId: { type: mongoose.Schema.Types.ObjectId, ref: 'Bot', required: true },
  allocatedAmount: { type: Number, required: true },
  isActive: { type: Boolean, default: true },
  startDate: { type: Date, required: true },
  endDate: { type: Date },
  currentValue: { type: Number, default: 0 },
  totalPnl: { type: Number, default: 0 }
}, {
  timestamps: true
})

export default mongoose.models.UserBotAllocation || mongoose.model('UserBotAllocation', UserBotAllocationSchema)