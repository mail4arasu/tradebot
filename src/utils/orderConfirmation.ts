import { ZerodhaAPI } from '@/lib/zerodha'

export interface OrderConfirmationResult {
  success: boolean
  executed: boolean
  orderId: string
  executedPrice?: number
  executedQuantity?: number
  pendingQuantity?: number
  error?: string
  finalStatus: string
  attempts: number
  totalWaitTime: number
  order?: any
}

export interface OrderConfirmationConfig {
  maxWaitTime: number        // Maximum wait time in milliseconds
  pollInterval: number       // Polling interval in milliseconds
  maxAttempts: number        // Maximum number of status checks
  partialFillAcceptable: boolean  // Accept partial fills
}

const DEFAULT_CONFIG: OrderConfirmationConfig = {
  maxWaitTime: 60000,        // 60 seconds max wait
  pollInterval: 2000,        // Check every 2 seconds
  maxAttempts: 30,           // Max 30 attempts
  partialFillAcceptable: true // Accept partial fills
}

/**
 * Robust order confirmation with intelligent polling
 * Handles market orders, limit orders, and partial fills
 */
export async function confirmOrderExecution(
  zerodhaClient: ZerodhaAPI,
  orderId: string,
  expectedQuantity: number,
  config: Partial<OrderConfirmationConfig> = {}
): Promise<OrderConfirmationResult> {
  
  const finalConfig = { ...DEFAULT_CONFIG, ...config }
  const startTime = Date.now()
  let attempts = 0
  let lastKnownOrder: any = null

  console.log(`🔍 Starting order confirmation for ${orderId}`)
  console.log(`⚙️ Config: maxWait=${finalConfig.maxWaitTime/1000}s, poll=${finalConfig.pollInterval/1000}s`)

  while (attempts < finalConfig.maxAttempts && (Date.now() - startTime) < finalConfig.maxWaitTime) {
    attempts++
    
    try {
      console.log(`📊 Attempt ${attempts}/${finalConfig.maxAttempts} - checking order status...`)
      
      // Fetch current orders
      const ordersResponse = await zerodhaClient.getOrders()
      const order = ordersResponse.data?.find((o: any) => o.order_id === orderId)
      
      if (!order) {
        console.warn(`⚠️ Order ${orderId} not found in orders list (attempt ${attempts})`)
        await sleep(finalConfig.pollInterval)
        continue
      }

      lastKnownOrder = order
      const status = order.status
      const filledQty = parseInt(order.filled_quantity || '0')
      const pendingQty = parseInt(order.pending_quantity || '0')
      const avgPrice = parseFloat(order.average_price || order.price || '0')

      console.log(`📋 Order ${orderId} status: ${status}, filled: ${filledQty}/${expectedQuantity}`)

      switch (status) {
        case 'COMPLETE':
          // Order fully executed
          if (filledQty === expectedQuantity) {
            return {
              success: true,
              executed: true,
              orderId,
              executedPrice: avgPrice,
              executedQuantity: filledQty,
              pendingQuantity: 0,
              finalStatus: 'COMPLETE',
              attempts,
              totalWaitTime: Date.now() - startTime,
              order
            }
          } else {
            // Unexpected quantity mismatch
            console.warn(`⚠️ Quantity mismatch: expected ${expectedQuantity}, got ${filledQty}`)
            return {
              success: true,
              executed: true,
              orderId,
              executedPrice: avgPrice,
              executedQuantity: filledQty,
              pendingQuantity: 0,
              error: `Quantity mismatch: expected ${expectedQuantity}, executed ${filledQty}`,
              finalStatus: 'COMPLETE_MISMATCH',
              attempts,
              totalWaitTime: Date.now() - startTime,
              order
            }
          }

        case 'OPEN':
        case 'TRIGGER PENDING':
          // Order still pending
          if (filledQty > 0 && finalConfig.partialFillAcceptable) {
            // Partial fill - decide whether to accept
            const fillPercentage = (filledQty / expectedQuantity) * 100
            console.log(`🔄 Partial fill: ${filledQty}/${expectedQuantity} (${fillPercentage.toFixed(1)}%)`)
            
            if (fillPercentage >= 80) { // Accept if 80%+ filled
              return {
                success: true,
                executed: true,
                orderId,
                executedPrice: avgPrice,
                executedQuantity: filledQty,
                pendingQuantity: pendingQty,
                finalStatus: 'PARTIAL_FILL_ACCEPTED',
                attempts,
                totalWaitTime: Date.now() - startTime,
                order
              }
            }
          }
          
          // Continue waiting for full execution
          console.log(`⏳ Order pending, waiting ${finalConfig.pollInterval/1000}s...`)
          break

        case 'CANCELLED':
        case 'REJECTED':
          // Order failed
          return {
            success: false,
            executed: false,
            orderId,
            error: order.status_message || `Order ${status.toLowerCase()}`,
            finalStatus: status,
            attempts,
            totalWaitTime: Date.now() - startTime,
            order
          }

        default:
          console.warn(`❓ Unknown order status: ${status}`)
          break
      }

      // Wait before next attempt
      await sleep(finalConfig.pollInterval)

    } catch (error) {
      console.error(`❌ Error checking order status (attempt ${attempts}):`, error)
      
      // On API errors, wait longer before retry
      await sleep(Math.min(finalConfig.pollInterval * 2, 10000))
    }
  }

  // Timeout or max attempts reached
  const isTimeout = (Date.now() - startTime) >= finalConfig.maxWaitTime
  const reason = isTimeout ? 'timeout' : 'max attempts'

  return {
    success: false,
    executed: false,
    orderId,
    error: `Order confirmation ${reason} after ${attempts} attempts (${Math.round((Date.now() - startTime)/1000)}s)`,
    finalStatus: lastKnownOrder ? `TIMEOUT_${lastKnownOrder.status}` : 'TIMEOUT_UNKNOWN',
    attempts,
    totalWaitTime: Date.now() - startTime,
    order: lastKnownOrder
  }
}

/**
 * Smart polling configuration based on order type and market conditions
 */
export function getOptimalPollingConfig(orderType: string, productType: string): OrderConfirmationConfig {
  if (orderType === 'MARKET') {
    // Market orders execute quickly
    return {
      maxWaitTime: 30000,     // 30 seconds max
      pollInterval: 1500,     // Check every 1.5 seconds
      maxAttempts: 20,
      partialFillAcceptable: true
    }
  } else if (orderType === 'LIMIT') {
    // Limit orders may take longer
    return {
      maxWaitTime: 300000,    // 5 minutes max
      pollInterval: 5000,     // Check every 5 seconds
      maxAttempts: 60,
      partialFillAcceptable: true
    }
  } else {
    // Default for other order types
    return DEFAULT_CONFIG
  }
}

/**
 * Helper function for async sleep
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Enhanced order placement with built-in confirmation
 */
export async function placeOrderWithConfirmation(
  zerodhaClient: ZerodhaAPI,
  orderParams: any,
  confirmationConfig?: Partial<OrderConfirmationConfig>
): Promise<OrderConfirmationResult> {
  
  console.log(`📋 Placing order with confirmation:`, {
    symbol: orderParams.tradingsymbol,
    quantity: orderParams.quantity,
    orderType: orderParams.order_type,
    transactionType: orderParams.transaction_type
  })

  try {
    // 1. Place the order
    const orderResponse = await zerodhaClient.placeOrder('regular', orderParams)
    
    if (orderResponse.status !== 'success') {
      return {
        success: false,
        executed: false,
        orderId: '',
        error: orderResponse.message || 'Order placement failed',
        finalStatus: 'PLACEMENT_FAILED',
        attempts: 0,
        totalWaitTime: 0
      }
    }

    const orderId = orderResponse.data.order_id
    console.log(`✅ Order placed successfully: ${orderId}`)

    // 2. Get optimal polling configuration
    const config = getOptimalPollingConfig(orderParams.order_type, orderParams.product)
    const finalConfig = { ...config, ...confirmationConfig }

    // 3. Confirm execution
    const confirmationResult = await confirmOrderExecution(
      zerodhaClient,
      orderId,
      parseInt(orderParams.quantity),
      finalConfig
    )

    console.log(`🎯 Order confirmation result:`, {
      orderId,
      success: confirmationResult.success,
      executed: confirmationResult.executed,
      status: confirmationResult.finalStatus,
      attempts: confirmationResult.attempts,
      waitTime: `${Math.round(confirmationResult.totalWaitTime/1000)}s`
    })

    return confirmationResult

  } catch (error) {
    console.error(`❌ Order placement with confirmation failed:`, error)
    return {
      success: false,
      executed: false,
      orderId: '',
      error: error.message,
      finalStatus: 'EXCEPTION',
      attempts: 0,
      totalWaitTime: 0
    }
  }
}