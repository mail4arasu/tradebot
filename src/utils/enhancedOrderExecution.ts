import { ObjectId } from 'mongodb'
import { ZerodhaAPI } from '@/lib/zerodha'
import { placeOrderWithConfirmation, OrderConfirmationResult } from '@/utils/orderConfirmation'
import OrderState from '@/models/OrderState'
import { decrypt } from '@/lib/encryption'

export interface EnhancedExecutionResult {
  success: boolean
  executionId: ObjectId
  orderId?: string
  orderStateId?: ObjectId
  executed: boolean
  executedPrice?: number
  executedQuantity?: number
  error?: string
  confirmationResult?: OrderConfirmationResult
  fallbackToMonitoring: boolean
}

/**
 * Enhanced order execution with robust confirmation
 * Replaces the old executeRealZerodhaOrder function
 */
export async function executeEnhancedZerodhaOrder(
  tradeExecution: any, 
  allocation: any, 
  db: any
): Promise<EnhancedExecutionResult> {
  
  let orderStateId: ObjectId | undefined
  
  try {
    console.log(`🚀 Enhanced Zerodha execution for ${tradeExecution.orderType} - User: ${allocation.userId}`)
    
    // 1. Get user's Zerodha credentials
    const user = await db.collection('users').findOne({ _id: allocation.userId })
    if (!user?.zerodhaConfig?.accessToken) {
      throw new Error('User Zerodha configuration not found or access token missing')
    }
    
    // 2. Decrypt credentials
    const apiKey = decrypt(user.zerodhaConfig.apiKey)
    const apiSecret = decrypt(user.zerodhaConfig.apiSecret) 
    const accessToken = decrypt(user.zerodhaConfig.accessToken)
    
    // 3. Initialize Zerodha API
    const zerodha = new ZerodhaAPI(apiKey, apiSecret, accessToken)
    
    // 4. Prepare order parameters
    const orderParams = {
      exchange: tradeExecution.exchange,
      tradingsymbol: tradeExecution.symbol,
      transaction_type: tradeExecution.orderType, // BUY/SELL
      quantity: tradeExecution.quantity,
      order_type: tradeExecution.requestedPrice ? 'LIMIT' : 'MARKET',
      product: 'MIS', // Intraday
      validity: 'DAY',
      tag: `TB_${tradeExecution.signalId.toString().slice(-8)}_${allocation.botId.toString().slice(-4)}`
    }
    
    if (tradeExecution.requestedPrice) {
      orderParams.price = tradeExecution.requestedPrice
    }
    
    console.log(`📋 Order parameters:`, {
      ...orderParams,
      userId: allocation.userId.toString()
    })
    
    // 5. Create order state record BEFORE placing order
    const orderState = new OrderState({
      orderId: '', // Will be updated after placement
      tradeExecutionId: tradeExecution._id,
      userId: allocation.userId,
      symbol: tradeExecution.symbol,
      exchange: tradeExecution.exchange,
      orderType: orderParams.order_type,
      transactionType: orderParams.transaction_type,
      quantity: tradeExecution.quantity,
      price: tradeExecution.requestedPrice,
      placementStatus: 'PLACED',
      confirmationStatus: 'PENDING'
    })
    
    orderState.addStatusHistory('ORDER_INITIATED', 'Starting enhanced order execution')
    await orderState.save()
    orderStateId = orderState._id
    
    console.log(`📊 Order state record created: ${orderStateId}`)
    
    // 6. Execute order with confirmation
    const confirmationResult = await placeOrderWithConfirmation(zerodha, orderParams)
    
    // 7. Update order state with results
    orderState.orderId = confirmationResult.orderId
    orderState.confirmationStatus = confirmationResult.success ? 
      (confirmationResult.executed ? 'CONFIRMED' : 'PENDING') : 'FAILED'
    orderState.executionStatus = confirmationResult.finalStatus
    orderState.executedQuantity = confirmationResult.executedQuantity || 0
    orderState.executedPrice = confirmationResult.executedPrice
    orderState.pendingQuantity = confirmationResult.pendingQuantity || 0
    orderState.error = confirmationResult.error
    orderState.confirmationAttempts = confirmationResult.attempts
    orderState.totalConfirmationTime = confirmationResult.totalWaitTime
    orderState.zerodhaOrderData = confirmationResult.order
    
    if (confirmationResult.success && confirmationResult.executed) {
      // Order confirmed as executed
      orderState.addStatusHistory('EXECUTION_CONFIRMED', 
        `Executed: ${confirmationResult.executedQuantity} @ ₹${confirmationResult.executedPrice}`)
      
      // Create position immediately
      await createPositionFromOrderState(orderState, tradeExecution, allocation, db)
      
      await orderState.save()
      
      return {
        success: true,
        executionId: tradeExecution._id,
        orderId: confirmationResult.orderId,
        orderStateId: orderState._id,
        executed: true,
        executedPrice: confirmationResult.executedPrice,
        executedQuantity: confirmationResult.executedQuantity,
        confirmationResult,
        fallbackToMonitoring: false
      }
      
    } else if (confirmationResult.success && !confirmationResult.executed) {
      // Order placed but not yet executed (limit order or timeout)
      orderState.addStatusHistory('EXECUTION_PENDING', 
        `Order placed but not executed: ${confirmationResult.error || confirmationResult.finalStatus}`)
      
      // Mark for background monitoring
      orderState.needsManualReview = false // Will be monitored automatically
      await orderState.save()
      
      console.log(`⏳ Order ${confirmationResult.orderId} placed but not executed - will be monitored`)
      
      return {
        success: true, // Order was placed successfully
        executionId: tradeExecution._id,
        orderId: confirmationResult.orderId,
        orderStateId: orderState._id,
        executed: false,
        error: `Order placed but not executed: ${confirmationResult.error || 'timeout'}`,
        confirmationResult,
        fallbackToMonitoring: true
      }
      
    } else {
      // Order placement or confirmation failed
      orderState.placementStatus = 'PLACEMENT_FAILED'
      orderState.addStatusHistory('EXECUTION_FAILED', 
        `Order failed: ${confirmationResult.error}`)
      await orderState.save()
      
      return {
        success: false,
        executionId: tradeExecution._id,
        orderId: confirmationResult.orderId,
        orderStateId: orderState._id,
        executed: false,
        error: confirmationResult.error,
        confirmationResult,
        fallbackToMonitoring: false
      }
    }
    
  } catch (error) {
    console.error(`❌ Enhanced Zerodha execution error:`, error)
    
    // Update order state if it exists
    if (orderStateId) {
      try {
        await OrderState.findByIdAndUpdate(orderStateId, {
          $set: {
            placementStatus: 'PLACEMENT_ERROR',
            confirmationStatus: 'FAILED',
            error: error.message
          },
          $push: {
            statusHistory: {
              status: 'EXCEPTION',
              timestamp: new Date(),
              details: error.message
            }
          }
        })
      } catch (updateError) {
        console.error('❌ Error updating order state:', updateError)
      }
    }
    
    return {
      success: false,
      executionId: tradeExecution._id,
      orderStateId,
      executed: false,
      error: error.message,
      fallbackToMonitoring: false
    }
  }
}

/**
 * Create position from confirmed order state
 */
async function createPositionFromOrderState(
  orderState: any, 
  tradeExecution: any, 
  allocation: any, 
  db: any
): Promise<void> {
  
  try {
    console.log(`🏗️ Creating position from order ${orderState.orderId}`)
    
    const position = {
      userId: allocation.userId,
      botId: allocation.botId,
      allocationId: allocation._id,
      symbol: orderState.symbol,
      exchange: orderState.exchange,
      instrumentType: tradeExecution.instrumentType || 'CE',
      positionId: `${tradeExecution.signalId}_${orderState.orderId}`,
      
      // Entry details
      entryExecutionId: tradeExecution._id,
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
      isIntraday: tradeExecution.isIntraday !== false,
      scheduledExitTime: tradeExecution.scheduledExitTime,
      autoSquareOffScheduled: false,
      
      // P&L tracking
      unrealizedPnl: 0,
      realizedPnl: 0,
      totalFees: 0,
      
      // Risk management
      stopLoss: null,
      target: null,
      
      // Audit
      createdAt: new Date(),
      updatedAt: new Date()
    }
    
    const result = await db.collection('positions').insertOne(position)
    console.log(`✅ Position created: ${result.insertedId}`)
    
    // Update trade execution record
    await db.collection('tradeexecutions').updateOne(
      { _id: tradeExecution._id },
      {
        $set: {
          status: 'EXECUTED',
          executedAt: new Date(),
          executedPrice: orderState.executedPrice,
          executedQuantity: orderState.executedQuantity,
          zerodhaOrderId: orderState.orderId,
          zerodhaResponse: orderState.zerodhaOrderData,
          positionId: result.insertedId,
          updatedAt: new Date()
        }
      }
    )
    
    // Create trade history record
    await createTradeHistoryRecord(tradeExecution, {
      success: true,
      orderId: orderState.orderId,
      executedPrice: orderState.executedPrice,
      executedQuantity: orderState.executedQuantity,
      response: orderState.zerodhaOrderData
    }, tradeExecution._id, db)
    
  } catch (error) {
    console.error(`❌ Error creating position:`, error)
    
    // Mark order state for manual review
    orderState.markForManualReview(`Failed to create position: ${error.message}`)
    await orderState.save()
    
    throw error
  }
}

/**
 * Create trade history record (reuse existing function signature)
 */
async function createTradeHistoryRecord(tradeExecution: any, zerodhaResult: any, executionId: any, db: any): Promise<void> {
  try {
    const tradeRecord = {
      userId: tradeExecution.userId,
      tradeId: zerodhaResult.orderId,
      symbol: tradeExecution.symbol,
      exchange: tradeExecution.exchange,
      transactionType: tradeExecution.orderType,
      quantity: zerodhaResult.executedQuantity,
      price: zerodhaResult.executedPrice,
      timestamp: new Date(),
      zerodhaData: zerodhaResult.response,
      executionId: executionId,
      createdAt: new Date()
    }
    
    await db.collection('trades').insertOne(tradeRecord)
    console.log(`📊 Trade history record created for ${zerodhaResult.orderId}`)
    
  } catch (error) {
    console.error(`❌ Error creating trade history:`, error)
    // Don't throw - this is not critical for order execution
  }
}