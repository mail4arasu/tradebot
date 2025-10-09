import mongoose from 'mongoose'

const ZerodhaConfigSchema = new mongoose.Schema({
  apiKey: { type: String }, // Not required initially, user adds later
  apiSecret: { type: String }, // Not required initially, user adds later
  accessToken: { type: String }, // OAuth access token for API calls
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
  zerodhaConfig: ZerodhaConfigSchema,
  // Authentication fields
  authProvider: { type: String, enum: ['credentials', 'google', 'github'], default: 'credentials' },
  password: { type: String },
  
  // Admin and user management fields
  role: { type: String, enum: ['user', 'admin'], default: 'user' },
  status: { type: String, enum: ['active', 'suspended', 'restricted'], default: 'active' },
  lastLoginAt: { type: Date },
  
  // Password reset functionality
  passwordResetToken: { type: String },
  passwordResetExpires: { type: Date },
  passwordResetAttempts: { type: Number, default: 0 },
  lastPasswordReset: { type: Date }
}, {
  timestamps: true
})

export default mongoose.models.User || mongoose.model('User', UserSchema)