// Database migration script to fix missing enabledHours
const mongoose = require('mongoose');

// Define the schema (simplified version for this script)
const UserBotAllocationSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  botId: { type: mongoose.Schema.Types.ObjectId, ref: 'Bot', required: true },
  allocatedAmount: { type: Number, required: true },
  isActive: { type: Boolean, default: true },
  startDate: { type: Date, required: true },
  endDate: { type: Date },
  currentValue: { type: Number, default: 0 },
  totalPnl: { type: Number, default: 0 },
  quantity: { type: Number, required: true },
  maxTradesPerDay: { type: Number, required: true, default: 1 },
  currentDayTrades: { type: Number, default: 0 },
  lastTradeDate: { type: Date },
  enabledHours: {
    start: { type: String, default: '09:15' },
    end: { type: String, default: '15:30' }
  },
  totalTrades: { type: Number, default: 0 },
  successfulTrades: { type: Number, default: 0 },
  lastSignalTime: { type: Date }
}, {
  timestamps: true
});

const UserBotAllocation = mongoose.model('UserBotAllocation', UserBotAllocationSchema);

async function fixEnabledHours() {
  try {
    console.log('🔧 Connecting to MongoDB...');
    await mongoose.connect('mongodb://localhost:27017/tradebot');
    
    console.log('🔍 Finding allocations with missing or incomplete enabledHours...');
    
    // Find allocations where enabledHours is missing or incomplete
    const allocationsToFix = await UserBotAllocation.find({
      $or: [
        { enabledHours: { $exists: false } },
        { enabledHours: null },
        { 'enabledHours.start': { $exists: false } },
        { 'enabledHours.end': { $exists: false } },
        { 'enabledHours.start': null },
        { 'enabledHours.end': null }
      ]
    });

    console.log(`📊 Found ${allocationsToFix.length} allocations to fix`);

    if (allocationsToFix.length === 0) {
      console.log('✅ All allocations already have proper enabledHours configuration');
      return;
    }

    // Fix each allocation
    let fixedCount = 0;
    for (const allocation of allocationsToFix) {
      console.log(`🔧 Fixing allocation ${allocation._id} for user ${allocation.userId}`);
      
      // Ensure enabledHours object exists
      if (!allocation.enabledHours) {
        allocation.enabledHours = {};
      }
      
      // Set default values if missing
      if (!allocation.enabledHours.start) {
        allocation.enabledHours.start = '09:15';
      }
      
      if (!allocation.enabledHours.end) {
        allocation.enabledHours.end = '15:30';
      }
      
      await allocation.save();
      fixedCount++;
      console.log(`✅ Fixed allocation ${allocation._id} - enabledHours: ${allocation.enabledHours.start}-${allocation.enabledHours.end}`);
    }

    console.log(`🎉 Successfully fixed ${fixedCount} user bot allocations`);
    
    // Verify the fix
    console.log('🔍 Verifying fix...');
    const remainingIssues = await UserBotAllocation.find({
      $or: [
        { enabledHours: { $exists: false } },
        { enabledHours: null },
        { 'enabledHours.start': { $exists: false } },
        { 'enabledHours.end': { $exists: false } },
        { 'enabledHours.start': null },
        { 'enabledHours.end': null }
      ]
    });

    if (remainingIssues.length === 0) {
      console.log('✅ All allocations now have proper enabledHours configuration');
    } else {
      console.log(`❌ Still found ${remainingIssues.length} allocations with issues`);
    }

  } catch (error) {
    console.error('❌ Error fixing enabledHours:', error);
  } finally {
    await mongoose.disconnect();
    console.log('📤 Disconnected from MongoDB');
  }
}

// Run the migration
fixEnabledHours();