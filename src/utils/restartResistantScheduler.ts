import { ObjectId } from 'mongodb'
import clientPromise from '@/lib/mongodb'
import ScheduledExit from '@/models/ScheduledExit'
import { validatePositionInZerodha, executeNormalAutoExit } from '@/utils/positionValidation'

interface SchedulerState {
  isInitialized: boolean
  processId: string
  schedulerVersion: string
  startTime: Date
  activeTimeouts: Map<string, NodeJS.Timeout>
}

/**
 * Restart-Resistant Scheduler
 * Stores all state in database, recovers from restarts
 */
export class RestartResistantScheduler {
  private static instance: RestartResistantScheduler
  private state: SchedulerState
  private checkInterval: NodeJS.Timeout | null = null

  constructor() {
    this.state = {
      isInitialized: false,
      processId: process.pid?.toString() || `proc_${Date.now()}`,
      schedulerVersion: '2.0.0',
      startTime: new Date(),
      activeTimeouts: new Map()
    }
  }

  static getInstance(): RestartResistantScheduler {
    if (!RestartResistantScheduler.instance) {
      RestartResistantScheduler.instance = new RestartResistantScheduler()
    }
    return RestartResistantScheduler.instance
  }

  /**
   * Initialize the restart-resistant scheduler
   */
  async initialize(): Promise<void> {
    if (this.state.isInitialized) return

    try {
      console.log(`🚀 Initializing Restart-Resistant Scheduler v${this.state.schedulerVersion}`)
      console.log(`📊 Process ID: ${this.state.processId}`)
      console.log(`⏰ Start Time: ${this.state.startTime.toISOString()}`)

      await this.connectToDatabase()
      
      // Step 1: Detect restart and recover state
      await this.detectRestartAndRecover()
      
      // Step 2: Schedule pending exits
      await this.schedulePendingExits()
      
      // Step 3: Handle overdue exits
      await this.handleOverdueExits()
      
      // Step 4: Start monitoring
      this.startContinuousMonitoring()
      
      this.state.isInitialized = true
      console.log(`✅ Restart-Resistant Scheduler initialized successfully`)
      
    } catch (error) {
      console.error(`❌ Failed to initialize Restart-Resistant Scheduler:`, error)
      throw error
    }
  }

  /**
   * Schedule a position for auto-exit (database-backed)
   */
  async schedulePositionExit(positionId: string, exitTime: string, userId: string, symbol: string): Promise<void> {
    try {
      console.log(`📅 Scheduling auto-exit for position ${positionId} at ${exitTime}`)
      
      // Check if already scheduled
      const existing = await ScheduledExit.findOne({ positionId: new ObjectId(positionId) })
      
      if (existing && existing.status === 'PENDING') {
        console.log(`⚠️ Position ${positionId} already scheduled, updating...`)
        existing.scheduledExitTime = exitTime
        existing.addAuditLog('RESCHEDULED', `Updated exit time to ${exitTime}`, this.state.processId)
        await existing.save()
      } else {
        // Create new scheduled exit
        const scheduledExit = new ScheduledExit({
          positionId: new ObjectId(positionId),
          userId: new ObjectId(userId),
          symbol,
          scheduledExitTime: exitTime,
          scheduledBy: {
            processId: this.state.processId,
            schedulerVersion: this.state.schedulerVersion,
            scheduledAt: new Date()
          }
        })
        
        scheduledExit.addAuditLog('SCHEDULED', `Scheduled for auto-exit at ${exitTime}`, this.state.processId)
        await scheduledExit.save()
        console.log(`✅ Created database record for scheduled exit: ${scheduledExit._id}`)
      }
      
      // Calculate and set timeout
      await this.setTimeoutForExit(positionId, exitTime)
      
      // Update position flag for backward compatibility
      await this.updatePositionScheduledFlag(positionId, true)
      
    } catch (error) {
      console.error(`❌ Failed to schedule exit for position ${positionId}:`, error)
      throw error
    }
  }

  /**
   * Cancel scheduled exit
   */
  async cancelPositionExit(positionId: string, reason: string = 'Manual cancellation'): Promise<void> {
    try {
      console.log(`❌ Cancelling scheduled exit for position ${positionId}: ${reason}`)
      
      // Update database
      const scheduledExit = await ScheduledExit.findOne({ positionId: new ObjectId(positionId) })
      if (scheduledExit && scheduledExit.status === 'PENDING') {
        scheduledExit.status = 'CANCELLED'
        scheduledExit.addAuditLog('CANCELLED', reason, this.state.processId)
        await scheduledExit.save()
      }
      
      // Clear timeout
      const timeoutId = this.state.activeTimeouts.get(positionId)
      if (timeoutId) {
        clearTimeout(timeoutId)
        this.state.activeTimeouts.delete(positionId)
      }
      
      // Update position flag
      await this.updatePositionScheduledFlag(positionId, false)
      
    } catch (error) {
      console.error(`❌ Failed to cancel exit for position ${positionId}:`, error)
    }
  }

  /**
   * Get current scheduler status
   */
  getStatus(): any {
    return {
      isInitialized: this.state.isInitialized,
      processId: this.state.processId,
      schedulerVersion: this.state.schedulerVersion,
      startTime: this.state.startTime,
      activeTimeouts: this.state.activeTimeouts.size,
      activeTimeoutIds: Array.from(this.state.activeTimeouts.keys())
    }
  }

  /**
   * Private methods
   */

  private async connectToDatabase(): Promise<void> {
    await clientPromise
    console.log(`📊 Connected to database for scheduler state management`)
  }

  private async detectRestartAndRecover(): Promise<void> {
    console.log(`🔍 Detecting restart and recovering state...`)
    
    try {
      // Find any pending exits from previous processes
      const pendingExits = await ScheduledExit.find({ status: 'PENDING' })
      
      console.log(`📊 Found ${pendingExits.length} pending exits from previous sessions`)
      
      for (const exit of pendingExits) {
        exit.addAuditLog('RESTART_DETECTED', 
          `Process restart detected. Previous process: ${exit.scheduledBy?.processId || 'unknown'}`, 
          this.state.processId)
        await exit.save()
      }
      
      if (pendingExits.length > 0) {
        console.log(`🔄 Restart detected! Recovering ${pendingExits.length} scheduled exits`)
      }
    } catch (error) {
      console.error(`❌ Error detecting restart state:`, error)
      console.log(`💡 ScheduledExit collection may not exist yet. Creating...`)
      
      // Try to create the collection by creating a dummy document
      try {
        const dummyExit = new ScheduledExit({
          positionId: '507f1f77bcf86cd799439011',
          userId: '507f1f77bcf86cd799439011', 
          symbol: 'INIT_DUMMY',
          scheduledExitTime: '15:15',
          status: 'CANCELLED'
        })
        await dummyExit.save()
        await ScheduledExit.deleteOne({ _id: dummyExit._id })
        console.log(`✅ ScheduledExit collection created successfully`)
      } catch (createError) {
        console.error(`❌ Failed to create ScheduledExit collection:`, createError)
        throw createError
      }
    }
  }

  private async schedulePendingExits(): Promise<void> {
    console.log(`📋 Scheduling pending exits from database...`)
    
    const pendingExits = await ScheduledExit.find({ 
      status: 'PENDING' 
    }).populate('positionId')
    
    console.log(`📊 Found ${pendingExits.length} pending exits to schedule`)
    
    for (const exit of pendingExits) {
      if (exit.positionId && ['OPEN', 'PARTIAL'].includes((exit.positionId as any).status)) {
        await this.setTimeoutForExit(exit.positionId.toString(), exit.scheduledExitTime)
        exit.addAuditLog('RESCHEDULED_AFTER_RESTART', 
          `Rescheduled after process restart`, 
          this.state.processId)
        await exit.save()
      } else {
        // Position no longer valid
        exit.status = 'CANCELLED'
        exit.addAuditLog('AUTO_CANCELLED', 
          `Position no longer open/partial`, 
          this.state.processId)
        await exit.save()
      }
    }
  }

  private async handleOverdueExits(): Promise<void> {
    console.log(`⏰ Checking for overdue exits...`)
    
    const now = new Date()
    const pendingExits = await ScheduledExit.find({ 
      status: 'PENDING' 
    }).populate('positionId')
    
    let overdueCount = 0
    
    for (const exit of pendingExits) {
      const isOverdue = this.isExitTimeOverdue(exit.scheduledExitTime, now)
      
      if (isOverdue && exit.positionId) {
        console.log(`🚨 Found overdue exit for position ${exit.positionId}: ${exit.scheduledExitTime}`)
        overdueCount++
        
        exit.addAuditLog('OVERDUE_DETECTED', 
          `Exit time ${exit.scheduledExitTime} has passed, executing immediately`, 
          this.state.processId)
        await exit.save()
        
        // Execute immediately
        await this.executeAutoExit(exit.positionId.toString(), 'IMMEDIATE_EXECUTION')
      }
    }
    
    if (overdueCount > 0) {
      console.log(`⚡ Executed ${overdueCount} overdue auto-exits immediately`)
    }
  }

  private async setTimeoutForExit(positionId: string, exitTime: string): Promise<void> {
    const msUntilExit = this.calculateMsUntilTime(exitTime)
    
    if (msUntilExit <= 0) {
      console.log(`⏰ Exit time ${exitTime} already passed for position ${positionId}, executing immediately`)
      await this.executeAutoExit(positionId, 'IMMEDIATE_EXECUTION')
      return
    }
    
    // Clear any existing timeout
    const existingTimeout = this.state.activeTimeouts.get(positionId)
    if (existingTimeout) {
      clearTimeout(existingTimeout)
    }
    
    // Set new timeout
    const timeoutId = setTimeout(async () => {
      await this.executeAutoExit(positionId, 'AUTO_TIMEOUT')
    }, msUntilExit)
    
    this.state.activeTimeouts.set(positionId, timeoutId)
    
    const minutes = Math.round(msUntilExit / 1000 / 60)
    console.log(`⏳ Set timeout for position ${positionId} - executing in ${minutes} minutes`)
  }

  private async executeAutoExit(positionId: string, method: string): Promise<void> {
    try {
      console.log(`🚀 Executing auto-exit for position ${positionId} via ${method}`)
      
      // Update database status
      const scheduledExit = await ScheduledExit.findOne({ positionId: new ObjectId(positionId) })
      if (!scheduledExit) {
        console.error(`❌ No scheduled exit found for position ${positionId}`)
        return
      }
      
      scheduledExit.status = 'EXECUTING'
      scheduledExit.executionAttempts += 1
      scheduledExit.lastExecutionAttempt = new Date()
      scheduledExit.executionMethod = method as any
      scheduledExit.addAuditLog('EXECUTION_STARTED', `Starting auto-exit via ${method}`, this.state.processId)
      await scheduledExit.save()
      
      // Get position details
      const client = await clientPromise
      const db = client.db('tradebot')
      const position = await db.collection('positions').findOne({
        _id: new ObjectId(positionId),
        status: { $in: ['OPEN', 'PARTIAL'] }
      })
      
      if (!position) {
        console.log(`⚠️ Position ${positionId} not found or already closed`)
        scheduledExit.status = 'COMPLETED'
        scheduledExit.addAuditLog('COMPLETED', 'Position already closed', this.state.processId)
        await scheduledExit.save()
        this.state.activeTimeouts.delete(positionId)
        return
      }
      
      // Validate and execute
      const validation = await validatePositionInZerodha(position)
      
      if (validation.existsInZerodha) {
        console.log(`✅ Position ${positionId} confirmed in Zerodha, executing auto-exit`)
        
        const exitResult = await executeNormalAutoExit(position, validation)
        
        if (exitResult.success) {
          scheduledExit.status = 'COMPLETED'
          scheduledExit.executedAt = new Date()
          scheduledExit.executionDetails = {
            orderId: exitResult.orderId,
            executedPrice: exitResult.executedPrice,
            executedQuantity: exitResult.executedQuantity
          }
          scheduledExit.addAuditLog('EXECUTION_COMPLETED', 
            `Successfully executed - Order: ${exitResult.orderId}`, 
            this.state.processId)
          
          console.log(`✅ Auto-exit completed successfully for position ${positionId}`)
        } else {
          scheduledExit.status = 'FAILED'
          scheduledExit.lastExecutionError = exitResult.error || 'Unknown error'
          scheduledExit.addAuditLog('EXECUTION_FAILED', 
            `Auto-exit failed: ${exitResult.error}`, 
            this.state.processId)
          
          console.error(`❌ Auto-exit failed for position ${positionId}: ${exitResult.error}`)
        }
      } else {
        console.log(`🔄 Position ${positionId} not found in Zerodha, marking as externally closed`)
        scheduledExit.status = 'COMPLETED'
        scheduledExit.executedAt = new Date()
        scheduledExit.addAuditLog('COMPLETED', 
          'Position externally closed', 
          this.state.processId)
      }
      
      await scheduledExit.save()
      this.state.activeTimeouts.delete(positionId)
      await this.updatePositionScheduledFlag(positionId, false)
      
    } catch (error) {
      console.error(`❌ Error executing auto-exit for position ${positionId}:`, error)
      
      // Update database with error
      const scheduledExit = await ScheduledExit.findOne({ positionId: new ObjectId(positionId) })
      if (scheduledExit) {
        scheduledExit.status = 'FAILED'
        scheduledExit.lastExecutionError = error.message
        scheduledExit.addAuditLog('EXECUTION_ERROR', 
          `Exception during execution: ${error.message}`, 
          this.state.processId)
        await scheduledExit.save()
      }
      
      this.state.activeTimeouts.delete(positionId)
    }
  }

  private calculateMsUntilTime(timeString: string): number {
    const [hours, minutes] = timeString.split(':').map(Number)
    const now = new Date()
    const targetTime = new Date()
    
    targetTime.setHours(hours, minutes, 0, 0)
    
    // If target time has passed today, it's overdue
    if (targetTime <= now) {
      return 0  // Overdue
    }
    
    return targetTime.getTime() - now.getTime()
  }

  private isExitTimeOverdue(timeString: string, currentTime: Date): boolean {
    const [hours, minutes] = timeString.split(':').map(Number)
    const exitTime = new Date(currentTime)
    exitTime.setHours(hours, minutes, 0, 0)
    
    return currentTime > exitTime
  }

  private async updatePositionScheduledFlag(positionId: string, scheduled: boolean): Promise<void> {
    try {
      const client = await clientPromise
      const db = client.db('tradebot')
      
      await db.collection('positions').updateOne(
        { _id: new ObjectId(positionId) },
        { 
          $set: { 
            autoSquareOffScheduled: scheduled,
            updatedAt: new Date()
          }
        }
      )
    } catch (error) {
      console.error(`❌ Failed to update position scheduled flag:`, error)
    }
  }

  private startContinuousMonitoring(): void {
    console.log(`👁️ Starting continuous monitoring...`)
    
    // Check every 30 seconds for any issues
    this.checkInterval = setInterval(async () => {
      try {
        await this.performHealthCheck()
      } catch (error) {
        console.error(`❌ Health check failed:`, error)
      }
    }, 30000)
  }

  private async performHealthCheck(): Promise<void> {
    // Check for any exits that should have executed but didn't
    const stalledExits = await ScheduledExit.find({
      status: 'EXECUTING',
      lastExecutionAttempt: { $lt: new Date(Date.now() - 5 * 60 * 1000) } // 5 minutes ago
    })
    
    for (const exit of stalledExits) {
      console.log(`🚨 Detected stalled execution for position ${exit.positionId}`)
      exit.status = 'FAILED'
      exit.lastExecutionError = 'Execution stalled - timeout'
      exit.addAuditLog('STALLED_DETECTED', 'Execution stalled, marking as failed', this.state.processId)
      await exit.save()
    }
  }

  /**
   * Get all pending exits for admin interface
   */
  async getPendingExits(): Promise<any[]> {
    return await ScheduledExit.find({ status: 'PENDING' })
      .populate('positionId')
      .populate('userId', 'name email')
      .sort({ scheduledExitTime: 1 })
  }

  /**
   * Emergency stop all scheduled exits
   */
  async emergencyStop(): Promise<void> {
    console.log(`🛑 Emergency stop activated - cancelling all scheduled exits`)
    
    // Clear all timeouts
    for (const [positionId, timeoutId] of this.state.activeTimeouts) {
      clearTimeout(timeoutId)
    }
    this.state.activeTimeouts.clear()
    
    // Update database
    await ScheduledExit.updateMany(
      { status: 'PENDING' },
      { 
        $set: { 
          status: 'CANCELLED',
          $push: {
            auditLog: {
              timestamp: new Date(),
              action: 'EMERGENCY_STOP',
              details: 'Emergency stop activated',
              processId: this.state.processId
            }
          }
        }
      }
    )
    
    console.log(`🛑 Emergency stop completed`)
  }
}

// Export singleton instance
export const restartResistantScheduler = RestartResistantScheduler.getInstance()