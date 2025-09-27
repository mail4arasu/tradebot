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
  pnl: { type: Number }
}, {
  timestamps: true
})

export default mongoose.models.Trade || mongoose.model('Trade', TradeSchema)