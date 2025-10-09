import { ZerodhaAPI } from '@/lib/zerodha'
import clientPromise from '@/lib/mongodb'

export interface ExitOrderParams {
  exchange: string
  tradingsymbol: string
  transaction_type: string
  quantity: number
  order_type: string
  product: string
  validity: string
  price?: number
  trigger_price?: number
}

export interface EnhancedExitOrderConfig {
  includeEntryReference: boolean
  useEntryOrderData: boolean
  customTag?: string
}

export interface ExitOrderResult {
  success: boolean
  orderId?: string
  orderResponse?: any
  error?: string
  entryReferences?: {
    entryOrderId?: string
    entryTradeId?: string
    exchangeOrderId?: string
  }
}

/**
 * Enhanced exit order placement that uses stored Zerodha references
 * Provides better traceability and supports advanced order types
 */
export async function placeEnhancedExitOrder(
  zerodhaClient: ZerodhaAPI,
  position: any,
  exitQuantity: number,
  orderType: 'MARKET' | 'LIMIT' = 'MARKET',
  exitReason: string = 'AUTO_EXIT',
  price?: number,
  config: EnhancedExitOrderConfig = { includeEntryReference: true, useEntryOrderData: false }
): Promise<ExitOrderResult> {
  
  try {
    const client = await clientPromise
    const db = client.db('tradebot')

    // Get entry execution data for enhanced tracking
    let entryExecution = null
    let entryReferences = {}
    
    if (config.includeEntryReference && position.entryExecutionId) {
      entryExecution = await db.collection('tradeexecutions').findOne({
        _id: position.entryExecutionId
      })

      if (entryExecution) {
        entryReferences = {
          entryOrderId: entryExecution.zerodhaOrderId,
          entryTradeId: entryExecution.zerodhaTradeId,
          exchangeOrderId: entryExecution.exchangeOrderId
        }
        console.log(`📋 Found entry references:`, entryReferences)
      }
    }

    // Determine order side (opposite of position side)
    const orderSide = position.side === 'LONG' ? 'SELL' : 'BUY'
    
    // Build enhanced order tag with entry references
    let orderTag = config.customTag || `${exitReason}_${position.positionId}`
    if (entryExecution?.zerodhaOrderId) {
      orderTag += `_ENTRY_${entryExecution.zerodhaOrderId}`
    }

    // Prepare order parameters
    const orderParams: ExitOrderParams = {
      exchange: position.exchange,
      tradingsymbol: position.symbol,
      transaction_type: orderSide,
      quantity: Math.abs(exitQuantity),
      order_type: orderType,
      product: position.instrumentType === 'FUTURES' ? 'MIS' : 'CNC',
      validity: 'DAY'
    }

    // Add price for limit orders
    if (orderType === 'LIMIT' && price) {
      orderParams.price = price
    }

    console.log(`📋 Enhanced exit order placement:`, {
      position: position.positionId,
      side: position.side,
      exitSide: orderSide,
      quantity: exitQuantity,
      orderType: orderType,
      tag: orderTag,
      entryReferences,
      orderParams
    })

    // Place the order
    const orderResponse = await zerodhaClient.placeOrder('regular', {
      ...orderParams,
      tag: orderTag
    })

    const orderResult = orderResponse?.data || orderResponse

    if (orderResponse.status === 'success' && orderResult.order_id) {
      console.log(`✅ Enhanced exit order placed successfully: ${orderResult.order_id}`)
      
      return {
        success: true,
        orderId: orderResult.order_id,
        orderResponse: orderResponse,
        entryReferences
      }
    } else {
      console.error(`❌ Exit order placement failed:`, orderResponse)
      return {
        success: false,
        error: orderResponse.message || 'Order placement failed',
        entryReferences
      }
    }

  } catch (error) {
    console.error(`❌ Enhanced exit order error:`, error)
    return {
      success: false,
      error: error.message
    }
  }
}

/**
 * Enhanced exit order for webhook signals that references entry orders
 */
export async function placeWebhookExitOrder(
  zerodhaClient: ZerodhaAPI,
  position: any,
  payload: any,
  signalId: string
): Promise<ExitOrderResult> {
  
  const orderType = payload.order_type || 'MARKET'
  const exitQuantity = payload.quantity || position.currentQuantity
  const price = payload.price

  return await placeEnhancedExitOrder(
    zerodhaClient,
    position,
    exitQuantity,
    orderType,
    'WEBHOOK_EXIT',
    price,
    {
      includeEntryReference: true,
      useEntryOrderData: false,
      customTag: `WEBHOOK_EXIT_${signalId}_${position.positionId}`
    }
  )
}

/**
 * Create exit trade execution record with entry references
 */
export async function createExitTradeExecution(
  position: any,
  exitOrderResult: ExitOrderResult,
  signalId: string,
  exitReason: string,
  payload?: any
): Promise<string | null> {
  
  try {
    const client = await clientPromise
    const db = client.db('tradebot')

    const exitExecution = {
      userId: position.userId,
      botId: position.botId,
      signalId: signalId,
      allocationId: position.allocationId,
      symbol: position.symbol,
      exchange: position.exchange,
      instrumentType: position.instrumentType,
      quantity: payload?.quantity || position.currentQuantity,
      orderType: 'SELL', // Will be adjusted based on position side
      requestedPrice: payload?.price || null,
      executedPrice: null, // Will be updated after confirmation
      executedQuantity: null,
      zerodhaOrderId: exitOrderResult.orderId,
      zerodhaTradeId: null, // Will be captured during confirmation
      exchangeOrderId: null, // Will be captured during confirmation
      status: 'SUBMITTED',
      submittedAt: new Date(),
      executedAt: null,
      error: null,
      retryCount: 0,
      zerodhaResponse: exitOrderResult.orderResponse,
      pnl: 0, // Will be calculated after execution
      fees: 0,
      isEmergencyExit: false,
      riskCheckPassed: true,
      positionId: position._id,
      parentPositionId: position._id,
      tradeType: 'EXIT',
      exitReason: exitReason,
      
      // Enhanced entry references
      entryOrderId: exitOrderResult.entryReferences?.entryOrderId,
      entryTradeId: exitOrderResult.entryReferences?.entryTradeId,
      entryExchangeOrderId: exitOrderResult.entryReferences?.exchangeOrderId,
      
      createdAt: new Date(),
      updatedAt: new Date()
    }

    const result = await db.collection('tradeexecutions').insertOne(exitExecution)
    console.log(`✅ Exit trade execution created with entry references: ${result.insertedId}`)
    
    return result.insertedId.toString()

  } catch (error) {
    console.error(`❌ Error creating exit trade execution:`, error)
    return null
  }
}