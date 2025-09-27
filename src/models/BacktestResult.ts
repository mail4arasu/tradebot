import mongoose from 'mongoose'

const BacktestResultSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  botId: { type: mongoose.Schema.Types.ObjectId, ref: 'Bot', required: true },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  initialCapital: { type: Number, required: true },
  finalCapital: { type: Number, required: true },
  totalReturn: { type: Number, required: true },
  maxDrawdown: { type: Number, required: true },
  sharpeRatio: { type: Number, required: true },
  totalTrades: { type: Number, required: true },
  winningTrades: { type: Number, required: true },
  losingTrades: { type: Number, required: true },
  parameters: { type: mongoose.Schema.Types.Mixed, default: {} },
  trades: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Trade' }]
}, {
  timestamps: true
})

export default mongoose.models.BacktestResult || mongoose.model('BacktestResult', BacktestResultSchema)