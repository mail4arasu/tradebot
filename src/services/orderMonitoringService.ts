import { ObjectId } from 'mongodb'
import clientPromise from '@/lib/mongodb'
import OrderState from '@/models/OrderState'
import { ZerodhaAPI } from '@/lib/zerodha'
import { confirmOrderExecution } from '@/utils/orderConfirmation'
import { decrypt } from '@/lib/encryption'

interface MonitoringConfig {
  checkInterval: number      // How often to check pending orders (ms)
  maxOrderAge: number        // Max age for orders before marking stale (ms)
  batchSize: number          // How many orders to process per batch
  retryStaleOrders: boolean  // Whether to retry stale orders
}

const DEFAULT_CONFIG: MonitoringConfig = {
  checkInterval: 30000,      // Check every 30 seconds
  maxOrderAge: 3600000,      // 1 hour max age
  batchSize: 10,             // Process 10 orders per batch
  retryStaleOrders: true     // Retry stale orders
}

/**
 * Background service to monitor pending order confirmations
 * Runs continuously to catch orders that weren't confirmed during initial placement
 */
export class OrderMonitoringService {
  private static instance: OrderMonitoringService
  private isRunning = false
  private config: MonitoringConfig
  private monitoringInterval: NodeJS.Timeout | null = null

  constructor(config: Partial<MonitoringConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  static getInstance(config?: Partial<MonitoringConfig>): OrderMonitoringService {
    if (!OrderMonitoringService.instance) {
      OrderMonitoringService.instance = new OrderMonitoringService(config)
    }
    return OrderMonitoringService.instance
  }

  /**
   * Start the monitoring service
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('📊 Order monitoring service already running')
      return
    }

    console.log('🚀 Starting order monitoring service')
    console.log(`⚙️ Config: checkInterval=${this.config.checkInterval/1000}s, maxAge=${this.config.maxOrderAge/60000}min`)

    this.isRunning = true

    // Initial check
    await this.performMonitoringCycle()

    // Set up recurring checks
    this.monitoringInterval = setInterval(async () => {
      try {
        await this.performMonitoringCycle()
      } catch (error) {
        console.error('❌ Error in order monitoring cycle:', error)
      }
    }, this.config.checkInterval)

    console.log('✅ Order monitoring service started')
  }

  /**
   * Stop the monitoring service
   */
  stop(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval)
      this.monitoringInterval = null
    }
    this.isRunning = false
    console.log('🛑 Order monitoring service stopped')
  }

  /**
   * Perform one monitoring cycle
   */
  private async performMonitoringCycle(): Promise<void> {
    console.log('🔍 Starting order monitoring cycle')

    try {
      // Get pending orders
      const pendingOrders = await OrderState.findPendingConfirmations()
        .limit(this.config.batchSize)
        .populate('userId', 'zerodhaConfig')

      if (pendingOrders.length === 0) {
        console.log('📊 No pending orders to monitor')
        return
      }

      console.log(`📋 Found ${pendingOrders.length} pending orders to check`)

      // Process each order
      for (const orderState of pendingOrders) {
        try {
          await this.checkOrderStatus(orderState)
        } catch (error) {
          console.error(`❌ Error checking order ${orderState.orderId}:`, error)
          await this.handleOrderCheckError(orderState, error)
        }
      }

      // Handle stale orders
      if (this.config.retryStaleOrders) {
        await this.handleStaleOrders()
      }

    } catch (error) {
      console.error('❌ Error in monitoring cycle:', error)
    }
  }

  /**
   * Check status of a specific order
   */
  private async checkOrderStatus(orderState: any): Promise<void> {
    console.log(`🔍 Checking order status: ${orderState.orderId}`)

    // Update monitoring status
    orderState.confirmationStatus = 'CONFIRMING'
    orderState.lastStatusCheck = new Date()
    orderState.confirmationAttempts += 1
    orderState.addStatusHistory('MONITORING_CHECK', `Attempt ${orderState.confirmationAttempts}`)
    await orderState.save()

    // Get user's Zerodha credentials
    const user = orderState.userId
    if (!user?.zerodhaConfig?.apiKey) {
      throw new Error('User Zerodha configuration not found')
    }

    // Initialize Zerodha client
    const zerodhaClient = new ZerodhaAPI(
      decrypt(user.zerodhaConfig.apiKey),
      decrypt(user.zerodhaConfig.apiSecret),
      decrypt(user.zerodhaConfig.accessToken)
    )

    // Check order status with single attempt (no polling)
    const orders = await zerodhaClient.getOrders()
    const order = orders.data?.find((o: any) => o.order_id === orderState.orderId)

    if (!order) {
      console.warn(`⚠️ Order ${orderState.orderId} not found in Zerodha`)
      orderState.addStatusHistory('ORDER_NOT_FOUND', 'Order not found in Zerodha orders list')
      orderState.markForManualReview('Order not found in Zerodha')
      await orderState.save()
      return
    }

    // Update order state based on current status
    await this.updateOrderStateFromZerodha(orderState, order)
  }

  /**
   * Update order state based on Zerodha order data
   */
  private async updateOrderStateFromZerodha(orderState: any, zerodhaOrder: any): Promise<void> {
    const status = zerodhaOrder.status
    const filledQty = parseInt(zerodhaOrder.filled_quantity || '0')
    const avgPrice = parseFloat(zerodhaOrder.average_price || zerodhaOrder.price || '0')

    // Update basic fields
    orderState.executionStatus = status
    orderState.executedQuantity = filledQty
    orderState.pendingQuantity = parseInt(zerodhaOrder.pending_quantity || '0')
    orderState.zerodhaOrderData = zerodhaOrder
    orderState.statusMessage = zerodhaOrder.status_message

    console.log(`📊 Order ${orderState.orderId} status: ${status}, filled: ${filledQty}`)

    switch (status) {
      case 'COMPLETE':
        orderState.confirmationStatus = 'CONFIRMED'
        orderState.executedPrice = avgPrice
        orderState.addStatusHistory('EXECUTION_CONFIRMED', `Executed: ${filledQty} @ ₹${avgPrice}`)
        
        // Create/update position if not already done
        await this.ensurePositionCreated(orderState)
        break

      case 'CANCELLED':
      case 'REJECTED':
        orderState.confirmationStatus = 'FAILED'
        orderState.error = zerodhaOrder.status_message || `Order ${status.toLowerCase()}`
        orderState.addStatusHistory('EXECUTION_FAILED', orderState.error)
        
        // Update trade execution record as failed
        await this.updateTradeExecutionStatus(orderState, 'FAILED')
        break

      case 'OPEN':
      case 'TRIGGER PENDING':
        // Still pending - check if it's getting stale
        const orderAge = Date.now() - orderState.createdAt.getTime()
        if (orderAge > this.config.maxOrderAge) {
          orderState.markForManualReview(`Order pending for ${Math.round(orderAge/60000)} minutes`)
        }
        orderState.addStatusHistory('STILL_PENDING', `Status: ${status}`)
        break

      default:
        console.warn(`❓ Unknown order status: ${status}`)
        orderState.addStatusHistory('UNKNOWN_STATUS', `Unknown status: ${status}`)
        break
    }

    await orderState.save()
  }

  /**
   * Ensure position is created for executed orders
   */
  private async ensurePositionCreated(orderState: any): Promise<void> {
    if (orderState.executedQuantity === 0) return

    try {
      const client = await clientPromise
      const db = client.db('tradebot')

      // Check if position already exists
      const existingPosition = await db.collection('positions').findOne({
        entryOrderId: orderState.orderId
      })

      if (existingPosition) {
        console.log(`✅ Position already exists for order ${orderState.orderId}`)
        return
      }

      // Get trade execution record
      const tradeExecution = await db.collection('tradeexecutions').findOne({
        _id: orderState.tradeExecutionId
      })

      if (!tradeExecution) {
        throw new Error('Trade execution record not found')
      }

      // Create position
      const position = {
        userId: orderState.userId,
        botId: tradeExecution.botId,
        allocationId: tradeExecution.allocationId,
        symbol: orderState.symbol,
        exchange: orderState.exchange,
        instrumentType: tradeExecution.instrumentType || 'CE',
        positionId: `${tradeExecution.signalId}_${orderState.orderId}`,
        
        // Entry details
        entryExecutionId: orderState.tradeExecutionId,
        entrySignalId: tradeExecution.signalId,
        entryPrice: orderState.executedPrice,
        entryQuantity: orderState.executedQuantity,
        entryTime: new Date(),
        entryOrderId: orderState.orderId,
        side: orderState.transactionType === 'BUY' ? 'LONG' : 'SHORT',
        
        // Current status
        status: 'OPEN',
        currentQuantity: orderState.executedQuantity,
        averagePrice: orderState.executedPrice,
        
        // Bot configuration
        isIntraday: tradeExecution.isIntraday !== false, // Default to true
        scheduledExitTime: tradeExecution.scheduledExitTime,
        autoSquareOffScheduled: false,
        
        // P&L tracking
        unrealizedPnl: 0,
        realizedPnl: 0,
        totalFees: 0,
        
        // Timestamps
        createdAt: new Date(),
        updatedAt: new Date()
      }

      const result = await db.collection('positions').insertOne(position)
      console.log(`✅ Position created for order ${orderState.orderId}: ${result.insertedId}`)

      // Update trade execution record with complete references
      await this.updateTradeExecutionStatus(orderState, 'EXECUTED')

    } catch (error) {
      console.error(`❌ Error creating position for order ${orderState.orderId}:`, error)
      orderState.markForManualReview(`Failed to create position: ${error.message}`)
      await orderState.save()
    }
  }

  /**
   * Update trade execution record status with complete Zerodha references
   */
  private async updateTradeExecutionStatus(orderState: any, status: string): Promise<void> {
    try {
      const client = await clientPromise
      const db = client.db('tradebot')

      // Extract complete Zerodha references from order data
      const zerodhaOrder = orderState.zerodhaOrderData
      const updateData: any = {
        status: status,
        executedAt: status === 'EXECUTED' ? new Date() : null,
        executedPrice: orderState.executedPrice,
        executedQuantity: orderState.executedQuantity,
        zerodhaOrderId: orderState.orderId,
        error: orderState.error,
        zerodhaResponse: zerodhaOrder,
        updatedAt: new Date()
      }

      // Capture exchange_order_id if available
      if (zerodhaOrder?.exchange_order_id) {
        updateData.exchangeOrderId = zerodhaOrder.exchange_order_id
        console.log(`📋 Capturing exchange_order_id: ${zerodhaOrder.exchange_order_id}`)
      }

      // If order is executed, also fetch and capture trade_id
      if (status === 'EXECUTED' && orderState.executedQuantity > 0) {
        try {
          // Get user's Zerodha credentials for trade lookup
          const user = orderState.userId
          if (user?.zerodhaConfig?.apiKey) {
            const zerodhaClient = new ZerodhaAPI(
              decrypt(user.zerodhaConfig.apiKey),
              decrypt(user.zerodhaConfig.apiSecret),
              decrypt(user.zerodhaConfig.accessToken)
            )

            // Fetch trades to get trade_id
            const tradesResponse = await zerodhaClient.getTrades()
            const relatedTrade = tradesResponse.data?.find((trade: any) => 
              trade.order_id === orderState.orderId
            )

            if (relatedTrade?.trade_id) {
              updateData.zerodhaTradeId = relatedTrade.trade_id
              console.log(`📋 Capturing trade_id: ${relatedTrade.trade_id} for order: ${orderState.orderId}`)
            }
          }
        } catch (tradeError) {
          console.warn(`⚠️ Could not fetch trade_id for order ${orderState.orderId}:`, tradeError.message)
        }
      }

      await db.collection('tradeexecutions').updateOne(
        { _id: orderState.tradeExecutionId },
        { $set: updateData }
      )

      console.log(`✅ Trade execution ${orderState.tradeExecutionId} updated to ${status}`)

    } catch (error) {
      console.error(`❌ Error updating trade execution:`, error)
    }
  }

  /**
   * Handle stale orders that haven't been confirmed
   */
  private async handleStaleOrders(): Promise<void> {
    const staleOrders = await OrderState.findStaleOrders(60) // 60 minutes

    if (staleOrders.length === 0) return

    console.log(`🕐 Found ${staleOrders.length} stale orders`)

    for (const orderState of staleOrders) {
      console.log(`🕐 Handling stale order: ${orderState.orderId}`)
      orderState.markForManualReview(`Order stale - no status update for ${Math.round((Date.now() - orderState.lastStatusCheck.getTime())/60000)} minutes`)
      await orderState.save()
    }
  }

  /**
   * Handle errors during order checking
   */
  private async handleOrderCheckError(orderState: any, error: any): Promise<void> {
    orderState.error = error.message
    orderState.addStatusHistory('CHECK_ERROR', `Error: ${error.message}`)
    
    // If too many attempts, mark for manual review
    if (orderState.confirmationAttempts >= 5) {
      orderState.markForManualReview(`Multiple check errors: ${error.message}`)
    }
    
    await orderState.save()
  }

  /**
   * Get service status
   */
  getStatus(): any {
    return {
      isRunning: this.isRunning,
      config: this.config,
      uptime: this.isRunning ? Date.now() - (this.monitoringInterval ? 0 : Date.now()) : 0
    }
  }
}

// Export singleton instance
export const orderMonitoringService = OrderMonitoringService.getInstance()

// Auto-start in production
if (process.env.NODE_ENV === 'production') {
  setTimeout(() => {
    orderMonitoringService.start().catch(error => {
      console.error('❌ Failed to start order monitoring service:', error)
    })
  }, 10000) // Start after 10 seconds delay
}