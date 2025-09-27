import mongoose from 'mongoose'

const ZerodhaConfigSchema = new mongoose.Schema({
  apiKey: { type: String, required: true },
  apiSecret: { type: String, required: true },
  isConnected: { type: Boolean, default: false },
  balance: { type: Number },
  lastSync: { type: Date }
})

const UserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  phone: { type: String },
  image: { type: String },
  emailVerified: { type: Date },
  phoneVerified: { type: Date },
  zerodhaConfig: ZerodhaConfigSchema
}, {
  timestamps: true
})

export default mongoose.models.User || mongoose.model('User', UserSchema)