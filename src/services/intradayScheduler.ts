import { ObjectId } from 'mongodb'
import clientPromise from '@/lib/mongodb'
import { getIntradayPositionsForAutoExit, updatePositionWithExit, markPositionForAutoExit } from '@/utils/positionManager'
import { 
  validatePositionInZerodha, 
  reconcileExternallyClosedPosition, 
  recordValidationResult,
  executeNormalAutoExit 
} from '@/utils/positionValidation'

interface ScheduledExit {
  positionId: string
  exitTime: string
  timeoutId?: NodeJS.Timeout
}

/**
 * Intraday Auto-Exit Scheduler
 * Manages automatic square-off of intraday positions at specified times
 */
class IntradayScheduler {
  private static instance: IntradayScheduler
  private scheduledExits: Map<string, ScheduledExit> = new Map()
  private isInitialized = false

  static getInstance(): IntradayScheduler {
    if (!IntradayScheduler.instance) {
      IntradayScheduler.instance = new IntradayScheduler()
    }
    return IntradayScheduler.instance
  }

  /**
   * Initialize the scheduler and load existing positions
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return

    try {
      console.log('🚀 Initializing Intraday Auto-Exit Scheduler...')
      
      // Load existing open intraday positions and schedule their exits
      await this.scheduleExistingPositions()
      
      // Set up daily cleanup at market close
      this.scheduleDailyCleanup()
      
      this.isInitialized = true
      console.log('✅ Intraday Auto-Exit Scheduler initialized successfully')
    } catch (error) {
      console.error('❌ Failed to initialize Intraday Scheduler:', error)
      throw error
    }
  }

  /**
   * Schedule auto-exit for a specific position
   */
  async schedulePositionExit(positionId: string, exitTime: string): Promise<void> {
    try {
      // Cancel any existing schedule for this position
      this.cancelPositionExit(positionId)

      // Calculate milliseconds until exit time
      const msUntilExit = this.calculateMsUntilTime(exitTime)
      
      if (msUntilExit <= 0) {
        // Exit time has already passed for today, execute immediately
        console.log(`⏰ Exit time already passed for position ${positionId}, executing immediately`)
        await this.executeAutoExit(positionId)
        return
      }

      // Schedule the exit
      const timeoutId = setTimeout(async () => {
        await this.executeAutoExit(positionId)
      }, msUntilExit)

      // Store the scheduled exit
      this.scheduledExits.set(positionId, {
        positionId,
        exitTime,
        timeoutId
      })

      // Mark position as scheduled in database
      await markPositionForAutoExit(new ObjectId(positionId))

      console.log(`📅 Scheduled auto-exit for position ${positionId} at ${exitTime} (in ${Math.round(msUntilExit / 1000 / 60)} minutes)`)
    } catch (error) {
      console.error(`❌ Failed to schedule exit for position ${positionId}:`, error)
      throw error
    }
  }

  /**
   * Cancel scheduled exit for a position
   */
  cancelPositionExit(positionId: string): void {
    const scheduledExit = this.scheduledExits.get(positionId)
    if (scheduledExit && scheduledExit.timeoutId) {
      clearTimeout(scheduledExit.timeoutId)
      this.scheduledExits.delete(positionId)
      console.log(`❌ Cancelled scheduled exit for position ${positionId}`)
    }
  }

  /**
   * Execute auto square-off for a position with pre-exit validation
   */
  private async executeAutoExit(positionId: string): Promise<void> {
    try {
      console.log(`🚀 Executing auto square-off with pre-validation for position: ${positionId}`)
      
      const client = await clientPromise
      const db = client.db('tradebot')
      
      // Get position details from database
      const position = await db.collection('positions').findOne({
        _id: new ObjectId(positionId),
        status: { $in: ['OPEN', 'PARTIAL'] }
      })

      if (!position) {
        console.log(`⚠️ Position ${positionId} not found or already closed in database`)
        this.scheduledExits.delete(positionId)
        return
      }

      // ⭐ PRE-EXIT VALIDATION: Check if position exists in Zerodha
      console.log(`🔍 Pre-validation: Checking position ${position.positionId} in Zerodha`)
      const validation = await validatePositionInZerodha(position)

      if (validation.existsInZerodha) {
        // SCENARIO 1: Position exists in Zerodha - proceed with normal auto-exit
        console.log(`✅ Position ${position.positionId} confirmed in Zerodha - executing auto-exit`)
        
        const exitResult = await executeNormalAutoExit(position, validation)
        
        if (exitResult.success) {
          // Create execution record for successful auto-exit
          const autoExitExecution = {
            userId: position.userId,
            botId: position.botId,
            signalId: new ObjectId(),
            allocationId: position.allocationId,
            symbol: position.symbol,
            exchange: position.exchange,
            instrumentType: position.instrumentType,
            quantity: position.currentQuantity,
            orderType: 'SELL',
            requestedPrice: null,
            executedPrice: exitResult.executedPrice,
            executedQuantity: exitResult.executedQuantity,
            zerodhaOrderId: exitResult.orderId,
            zerodhaTradeId: null,
            status: 'EXECUTED',
            submittedAt: new Date(),
            executedAt: new Date(),
            error: null,
            retryCount: 0,
            zerodhaResponse: {
              validationData: validation,
              orderResponse: exitResult.response
            },
            pnl: validation.zerodhaPnl || 0,
            fees: 0,
            isEmergencyExit: false,
            riskCheckPassed: true,
            positionId: position._id,
            parentPositionId: position._id,
            tradeType: 'EXIT',
            exitReason: 'AUTO_SQUARE_OFF',
            createdAt: new Date(),
            updatedAt: new Date()
          }

          const executionResult = await db.collection('tradeexecutions').insertOne(autoExitExecution)

          // Update position with successful exit
          await updatePositionWithExit(position._id, {
            executionId: executionResult.insertedId,
            signalId: autoExitExecution.signalId,
            quantity: position.currentQuantity,
            price: exitResult.executedPrice || 0,
            orderId: exitResult.orderId || 'AUTO_EXIT',
            reason: 'AUTO_SQUARE_OFF'
          })

          // Record validation result
          await recordValidationResult(position.positionId, validation, 'AUTO_EXIT')
          
          console.log(`✅ Auto square-off completed successfully for position ${positionId}`)
        } else {
          console.error(`❌ Auto square-off order failed for position ${positionId}: ${exitResult.error}`)
          // Record failed attempt but don't update position
          await recordValidationResult(position.positionId, validation, 'AUTO_EXIT')
        }

      } else {
        // SCENARIO 2: Position missing in Zerodha - reconcile as external exit
        console.log(`🔄 Position ${position.positionId} not found in Zerodha - reconciling as external exit`)
        
        await reconcileExternallyClosedPosition(position, validation)
        await recordValidationResult(position.positionId, validation, 'RECONCILIATION')
        
        console.log(`✅ Position ${positionId} reconciled as externally closed`)
      }

      // Remove from scheduled exits regardless of outcome
      this.scheduledExits.delete(positionId)

    } catch (error) {
      console.error(`❌ Error in auto-exit processing for position ${positionId}:`, error)
      // Remove from scheduled exits to prevent retry loops
      this.scheduledExits.delete(positionId)
    }
  }

  /**
   * Simulate auto-exit execution
   */
  private async simulateAutoExit(position: any): Promise<any> {
    // Simulate processing delay
    await new Promise(resolve => setTimeout(resolve, 100))
    
    // Simulate 98% success rate for auto exits
    const success = Math.random() > 0.02
    
    if (success) {
      // Simulate market price (slightly worse than last price due to market order)
      const marketPrice = position.averagePrice * (0.98 + Math.random() * 0.04) // ±2% from entry
      
      return {
        success: true,
        orderId: `AUTO_EXIT_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        tradeId: `AUTO_TRD_${Date.now()}`,
        executedPrice: marketPrice,
        executedQuantity: position.currentQuantity,
        error: null,
        response: {
          status: 'COMPLETE',
          order_timestamp: new Date().toISOString(),
          average_price: marketPrice,
          auto_square_off: true
        }
      }
    } else {
      return {
        success: false,
        orderId: null,
        tradeId: null,
        executedPrice: null,
        executedQuantity: null,
        error: 'Auto square-off failed - market conditions',
        response: null
      }
    }
  }

  /**
   * Load and schedule exits for existing open intraday positions
   */
  private async scheduleExistingPositions(): Promise<void> {
    try {
      const openPositions = await getIntradayPositionsForAutoExit()
      
      console.log(`📊 Found ${openPositions.length} open intraday positions to schedule`)
      
      for (const position of openPositions) {
        if (position.scheduledExitTime && !position.autoSquareOffScheduled) {
          await this.schedulePositionExit(position._id.toString(), position.scheduledExitTime)
        }
      }
    } catch (error) {
      console.error('❌ Error loading existing positions:', error)
    }
  }

  /**
   * Calculate milliseconds until a specific time today
   */
  private calculateMsUntilTime(timeString: string): number {
    const [hours, minutes] = timeString.split(':').map(Number)
    const now = new Date()
    const targetTime = new Date()
    
    targetTime.setHours(hours, minutes, 0, 0)
    
    // If target time has passed today, schedule for tomorrow
    if (targetTime <= now) {
      targetTime.setDate(targetTime.getDate() + 1)
    }
    
    return targetTime.getTime() - now.getTime()
  }

  /**
   * Schedule daily cleanup at market close
   */
  private scheduleDailyCleanup(): void {
    // Schedule cleanup at 4 PM every day (after market close)
    const cleanupTime = this.calculateMsUntilTime('16:00')
    
    setTimeout(() => {
      this.performDailyCleanup()
      // Schedule next cleanup
      this.scheduleDailyCleanup()
    }, cleanupTime)
    
    console.log(`🧹 Daily cleanup scheduled in ${Math.round(cleanupTime / 1000 / 60 / 60)} hours`)
  }

  /**
   * Perform daily cleanup tasks
   */
  private async performDailyCleanup(): Promise<void> {
    try {
      console.log('🧹 Performing daily cleanup...')
      
      // Clear all scheduled exits (they should have been executed by now)
      this.scheduledExits.clear()
      
      // Reset daily trade counters
      const client = await clientPromise
      const db = client.db('tradebot')
      
      await db.collection('userbotallocations').updateMany(
        {},
        { $set: { currentDayTrades: 0 } }
      )
      
      // Clean up old closed positions (older than 30 days)
      const thirtyDaysAgo = new Date()
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
      
      const cleanupResult = await db.collection('positions').deleteMany({
        status: 'CLOSED',
        updatedAt: { $lt: thirtyDaysAgo }
      })
      
      console.log(`🧹 Daily cleanup completed - Removed ${cleanupResult.deletedCount} old positions`)
    } catch (error) {
      console.error('❌ Error during daily cleanup:', error)
    }
  }

  /**
   * Get current scheduler status
   */
  getStatus(): {
    isInitialized: boolean
    scheduledExits: number
    scheduledPositions: string[]
  } {
    return {
      isInitialized: this.isInitialized,
      scheduledExits: this.scheduledExits.size,
      scheduledPositions: Array.from(this.scheduledExits.keys())
    }
  }

  /**
   * Emergency stop - cancel all scheduled exits
   */
  emergencyStop(): void {
    console.log('🛑 Emergency stop activated - cancelling all scheduled exits')
    
    for (const [positionId, scheduledExit] of this.scheduledExits) {
      if (scheduledExit.timeoutId) {
        clearTimeout(scheduledExit.timeoutId)
      }
    }
    
    this.scheduledExits.clear()
    console.log('🛑 All scheduled exits cancelled')
  }
}

// Export singleton instance
export const intradayScheduler = IntradayScheduler.getInstance()

// Auto-initialize when module is loaded (in production environment)
if (process.env.NODE_ENV === 'production') {
  intradayScheduler.initialize().catch(error => {
    console.error('❌ Failed to auto-initialize intraday scheduler:', error)
  })
}