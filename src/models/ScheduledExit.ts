import mongoose from 'mongoose'

const ScheduledExitSchema = new mongoose.Schema({
  positionId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    ref: 'Position'
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    ref: 'User'
  },
  symbol: {
    type: String,
    required: true
  },
  scheduledExitTime: {
    type: String,  // "15:15" format
    required: true
  },
  scheduledForDate: {
    type: Date,
    required: true,
    default: () => {
      // Default to today's date
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      return today
    }
  },
  status: {
    type: String,
    enum: ['PENDING', 'EXECUTING', 'COMPLETED', 'FAILED', 'CANCELLED'],
    default: 'PENDING'
  },
  
  // Execution tracking
  executionAttempts: {
    type: Number,
    default: 0
  },
  lastExecutionAttempt: {
    type: Date
  },
  lastExecutionError: {
    type: String
  },
  
  // Restart detection
  scheduledBy: {
    processId: String,
    schedulerVersion: String,
    scheduledAt: Date
  },
  
  // Execution results
  executedAt: {
    type: Date
  },
  executionMethod: {
    type: String,
    enum: ['AUTO_TIMEOUT', 'MANUAL_TRIGGER', 'RESTART_RECOVERY', 'IMMEDIATE_EXECUTION']
  },
  executionDetails: {
    type: mongoose.Schema.Types.Mixed
  },
  
  // Audit trail
  auditLog: [{
    timestamp: { type: Date, default: Date.now },
    action: String,  // 'SCHEDULED', 'EXECUTION_STARTED', 'EXECUTION_COMPLETED', 'ERROR', 'CANCELLED'
    details: String,
    processId: String
  }]
}, {
  timestamps: true
})

// Indexes for efficient queries
ScheduledExitSchema.index({ positionId: 1 }, { unique: true })
ScheduledExitSchema.index({ status: 1, scheduledForDate: 1 })
ScheduledExitSchema.index({ scheduledExitTime: 1, status: 1 })
ScheduledExitSchema.index({ userId: 1, status: 1 })

// Helper method to add audit log entry
ScheduledExitSchema.methods.addAuditLog = function(action: string, details: string, processId?: string) {
  this.auditLog.push({
    timestamp: new Date(),
    action,
    details,
    processId: processId || process.pid?.toString() || 'unknown'
  })
}

// Static method to find pending exits for a specific time
ScheduledExitSchema.statics.findPendingExitsForTime = function(timeString: string, date?: Date) {
  const targetDate = date || new Date()
  targetDate.setHours(0, 0, 0, 0)
  
  return this.find({
    scheduledExitTime: timeString,
    scheduledForDate: targetDate,
    status: 'PENDING'
  }).populate('positionId')
}

// Static method to find overdue exits
ScheduledExitSchema.statics.findOverdueExits = function(currentTime?: Date) {
  const now = currentTime || new Date()
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)
  
  // Find exits scheduled for today or earlier that haven't been executed
  return this.find({
    scheduledForDate: { $lte: today },
    status: 'PENDING',
    // Add time comparison logic here if needed
  }).populate('positionId')
}

export default mongoose.models.ScheduledExit || mongoose.model('ScheduledExit', ScheduledExitSchema)