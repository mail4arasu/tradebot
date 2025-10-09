import mongoose from 'mongoose'

const BrokerConfigSchema = new mongoose.Schema({
  // Company Information
  companyName: {
    type: String,
    required: true,
    default: 'TradeBot Portal'
  },
  companyDisplayName: {
    type: String,
    required: true,
    default: '🤖 TRADEBOT PORTAL'
  },
  address: {
    type: String,
    required: true,
    default: 'Technology Hub, Bangalore, Karnataka, India'
  },
  phone: {
    type: String,
    required: true,
    default: '+91 80 4718 1888'
  },
  website: {
    type: String,
    required: true,
    default: 'https://niveshawealth.in'
  },
  email: {
    type: String,
    required: true,
    default: 'info@niveshawealth.in'
  },
  
  // Regulatory Information
  sebiRegistration: {
    type: String,
    required: true,
    default: 'INZ000031633'
  },
  gstNumber: {
    type: String,
    default: '29AAAAA0000A1Z5'
  },
  gstStateCode: {
    type: String,
    default: '29'
  },
  placeOfSupply: {
    type: String,
    default: 'KARNATAKA'
  },
  
  // Compliance Officer
  complianceOfficer: {
    name: {
      type: String,
      required: true,
      default: 'System Administrator'
    },
    phone: {
      type: String,
      required: true,
      default: '+91 80 4718 1888'
    },
    email: {
      type: String,
      required: true,
      default: 'compliance@niveshawealth.in'
    }
  },
  
  // Customer Support
  investorComplaintEmail: {
    type: String,
    required: true,
    default: 'complaints@niveshawealth.in'
  },
  supportEmail: {
    type: String,
    default: 'support@niveshawealth.in'
  },
  supportPhone: {
    type: String,
    default: '+91 80 4718 1888'
  },
  
  // Contract Note Settings
  contractNotePrefix: {
    type: String,
    default: 'CNT'
  },
  invoiceReferencePrefix: {
    type: String,
    default: 'IRN'
  },
  
  // Logo and Branding
  logoUrl: {
    type: String,
    default: ''
  },
  brandColor: {
    type: String,
    default: '#1e3a8a'
  },
  
  // Meta Information
  isActive: {
    type: Boolean,
    default: true
  },
  version: {
    type: Number,
    default: 1
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  },
  updatedBy: {
    type: String,
    default: 'Admin'
  }
}, {
  timestamps: true
})

// Ensure only one active config exists
BrokerConfigSchema.index({ isActive: 1 }, { unique: true, partialFilterExpression: { isActive: true } })

export default mongoose.models.BrokerConfig || mongoose.model('BrokerConfig', BrokerConfigSchema)