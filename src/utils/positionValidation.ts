import { ObjectId } from 'mongodb'
import clientPromise from '@/lib/mongodb'
import { ZerodhaAPI } from '@/lib/zerodha'
import { decrypt } from '@/lib/encryption'
import { placeEnhancedExitOrder, createExitTradeExecution } from '@/utils/enhancedExitOrder'

export interface ZerodhaValidationResult {
  existsInZerodha: boolean
  zerodhaQuantity: number
  zerodhaPrice: number
  zerodhaPnl: number
  validationTime: Date
  rawZerodhaData?: any
  validationError?: string
}

export interface ExternalExitData {
  positionId: ObjectId
  userId: ObjectId
  detectedAt: Date
  originalQuantity: number
  estimatedExitPrice: number
  reconciliationMethod: string
}

/**
 * Validates if a position still exists in user's Zerodha account
 */
export async function validatePositionInZerodha(position: any): Promise<ZerodhaValidationResult> {
  try {
    console.log(`🔍 Validating position ${position.positionId} in Zerodha for user ${position.userId}`)
    
    // Get user's Zerodha configuration
    const client = await clientPromise
    const db = client.db('tradebot')
    
    const user = await db.collection('users').findOne({ _id: position.userId })
    if (!user?.zerodhaConfig?.isConnected) {
      throw new Error('User Zerodha not connected')
    }

    // Initialize Zerodha client
    const zerodhaClient = new ZerodhaAPI(
      decrypt(user.zerodhaConfig.apiKey),
      decrypt(user.zerodhaConfig.apiSecret),
      decrypt(user.zerodhaConfig.accessToken)
    )

    // Fetch current positions from Zerodha
    const zerodhaPositionsResponse = await zerodhaClient.getPositions()
    const zerodhaPositions = zerodhaPositionsResponse?.data || {}
    
    // Look for matching position in both net and day positions
    let matchingPosition = null
    
    // Check net positions first (carries forward positions)
    const netPositions = zerodhaPositions.net || []
    matchingPosition = netPositions.find((zPos: any) => 
      zPos.tradingsymbol === position.symbol &&
      zPos.exchange === position.exchange &&
      Math.abs(zPos.quantity) > 0
    )
    
    // If not found in net, check day positions (intraday positions)
    if (!matchingPosition) {
      const dayPositions = zerodhaPositions.day || []
      matchingPosition = dayPositions.find((zPos: any) => 
        zPos.tradingsymbol === position.symbol &&
        zPos.exchange === position.exchange &&
        Math.abs(zPos.quantity) > 0
      )
    }

    const result: ZerodhaValidationResult = {
      existsInZerodha: !!matchingPosition,
      zerodhaQuantity: matchingPosition?.quantity || 0,
      zerodhaPrice: matchingPosition?.last_price || matchingPosition?.close_price || 0,
      zerodhaPnl: matchingPosition?.pnl || 0,
      validationTime: new Date(),
      rawZerodhaData: matchingPosition
    }

    console.log(`✅ Validation complete for ${position.positionId}: ${result.existsInZerodha ? 'EXISTS' : 'MISSING'}`)
    return result

  } catch (error) {
    console.error(`❌ Zerodha validation failed for position ${position.positionId}:`, error)
    return {
      existsInZerodha: false,
      zerodhaQuantity: 0,
      zerodhaPrice: 0,
      zerodhaPnl: 0,
      validationTime: new Date(),
      validationError: error.message
    }
  }
}

/**
 * Reconciles a position that was manually closed externally
 */
export async function reconcileExternallyClosedPosition(position: any, validation: ZerodhaValidationResult): Promise<void> {
  try {
    console.log(`🔄 Reconciling externally closed position: ${position.positionId}`)
    
    const client = await clientPromise
    const db = client.db('tradebot')

    // Create external exit execution record
    const externalExitExecution = {
      userId: position.userId,
      botId: position.botId,
      signalId: new ObjectId(), // Generate new ObjectId for external exit
      allocationId: position.allocationId,
      symbol: position.symbol,
      exchange: position.exchange,
      instrumentType: position.instrumentType,
      quantity: position.currentQuantity,
      orderType: 'SELL', // Assume sell for square-off
      requestedPrice: null,
      executedPrice: validation.zerodhaPrice || position.averagePrice,
      executedQuantity: position.currentQuantity,
      zerodhaOrderId: 'EXTERNAL_MANUAL',
      zerodhaTradeId: 'EXTERNAL_MANUAL',
      status: 'EXECUTED',
      submittedAt: validation.validationTime,
      executedAt: validation.validationTime,
      error: null,
      retryCount: 0,
      zerodhaResponse: {
        detectedBy: 'PRE_EXIT_VALIDATION',
        originalZerodhaData: validation.rawZerodhaData,
        reconciliationTimestamp: validation.validationTime
      },
      pnl: validation.zerodhaPnl || 0,
      fees: 0, // Unknown for external exits
      isEmergencyExit: false,
      riskCheckPassed: true,
      positionId: position._id,
      parentPositionId: position._id,
      tradeType: 'EXIT',
      exitReason: 'EXTERNAL_MANUAL_EXIT',
      createdAt: validation.validationTime,
      updatedAt: validation.validationTime
    }

    // Insert execution record
    const executionResult = await db.collection('tradeexecutions').insertOne(externalExitExecution)

    // Update position with external exit using existing function
    const { updatePositionWithExit } = await import('./positionManager')
    await updatePositionWithExit(position._id, {
      executionId: executionResult.insertedId,
      signalId: externalExitExecution.signalId,
      quantity: position.currentQuantity,
      price: validation.zerodhaPrice || position.averagePrice,
      orderId: 'EXTERNAL_MANUAL',
      reason: 'EXTERNAL_MANUAL_EXIT'
    })

    // Create external exit audit record
    await db.collection('externalexits').insertOne({
      positionId: position._id,
      userId: position.userId,
      botId: position.botId,
      symbol: position.symbol,
      exchange: position.exchange,
      originalQuantity: position.currentQuantity,
      estimatedExitPrice: validation.zerodhaPrice || position.averagePrice,
      detectedAt: validation.validationTime,
      reconciliationMethod: 'AUTO_SCHEDULER_VALIDATION',
      zerodhaValidation: validation,
      executionId: executionResult.insertedId,
      createdAt: new Date()
    })

    console.log(`✅ Position ${position.positionId} reconciled as externally closed`)

  } catch (error) {
    console.error(`❌ Error reconciling external exit for ${position.positionId}:`, error)
    throw error
  }
}

/**
 * Records the validation result for audit purposes
 */
export async function recordValidationResult(
  positionId: string, 
  validation: ZerodhaValidationResult, 
  actionTaken: 'AUTO_EXIT' | 'RECONCILIATION'
): Promise<void> {
  try {
    const client = await clientPromise
    const db = client.db('tradebot')

    await db.collection('positionvalidations').insertOne({
      positionId,
      validation,
      actionTaken,
      timestamp: new Date()
    })

  } catch (error) {
    console.error('❌ Error recording validation result:', error)
  }
}

/**
 * Executes normal auto-exit for validated existing positions
 */
export async function executeNormalAutoExit(position: any, validation: ZerodhaValidationResult): Promise<any> {
  try {
    console.log(`📤 Executing normal auto-exit for position ${position.positionId}`)
    
    // Get user's Zerodha configuration
    const client = await clientPromise
    const db = client.db('tradebot')
    
    const user = await db.collection('users').findOne({ _id: position.userId })
    if (!user?.zerodhaConfig?.isConnected) {
      throw new Error('User Zerodha not connected')
    }

    // Initialize Zerodha client
    const zerodhaClient = new ZerodhaAPI(
      decrypt(user.zerodhaConfig.apiKey),
      decrypt(user.zerodhaConfig.apiSecret),
      decrypt(user.zerodhaConfig.accessToken)
    )

    // Determine order side (opposite of position side)
    const orderSide = position.side === 'LONG' ? 'SELL' : 'BUY'
    
    // Get entry order references for enhanced exit tracking
    const entryExecution = await db.collection('tradeexecutions').findOne({
      _id: position.entryExecutionId
    })

    // Build enhanced tag with entry order reference
    let orderTag = `AUTO_EXIT_${position.positionId}`
    if (entryExecution?.zerodhaOrderId) {
      orderTag += `_ENTRY_${entryExecution.zerodhaOrderId}`
    }

    // Place square-off order with enhanced traceability
    const orderParams = {
      exchange: position.exchange,
      tradingsymbol: position.symbol,
      transaction_type: orderSide,
      quantity: Math.abs(validation.zerodhaQuantity), // Use actual Zerodha quantity
      order_type: 'MARKET',
      product: position.instrumentType === 'FUTURES' ? 'MIS' : 'CNC', // MIS for intraday
      validity: 'DAY',
      tag: orderTag // Enhanced tag with entry order reference
    }

    console.log(`📋 Enhanced exit order with entry reference:`, {
      exitOrderTag: orderTag,
      entryOrderId: entryExecution?.zerodhaOrderId,
      entryTradeId: entryExecution?.zerodhaTradeId,
      exchangeOrderId: entryExecution?.exchangeOrderId
    })

    console.log(`📋 Placing enhanced auto-exit order with entry references...`)
    
    // Use enhanced exit order placement
    const exitOrderResult = await placeEnhancedExitOrder(
      zerodhaClient,
      position,
      Math.abs(validation.zerodhaQuantity),
      'MARKET',
      'AUTO_SQUARE_OFF',
      undefined,
      { includeEntryReference: true, useEntryOrderData: false }
    )

    if (exitOrderResult.success) {
      console.log(`✅ Enhanced auto-exit order placed: ${exitOrderResult.orderId}`)
      console.log(`📋 Entry references captured:`, exitOrderResult.entryReferences)
      
      // Create exit trade execution record with entry references
      const executionId = await createExitTradeExecution(
        position,
        exitOrderResult,
        new ObjectId().toString(),
        'AUTO_SQUARE_OFF'
      )
      
      return {
        success: true,
        orderId: exitOrderResult.orderId,
        executedPrice: validation.zerodhaPrice,
        executedQuantity: Math.abs(validation.zerodhaQuantity),
        response: exitOrderResult.orderResponse,
        entryReferences: exitOrderResult.entryReferences,
        executionId: executionId
      }
    } else {
      console.error(`❌ Enhanced auto-exit order failed:`, exitOrderResult.error)
      return {
        success: false,
        error: exitOrderResult.error || 'Enhanced auto-exit order placement failed',
        response: exitOrderResult
      }
    }

  } catch (error) {
    console.error(`❌ Normal auto-exit failed for ${position.positionId}:`, error)
    return {
      success: false,
      error: error.message,
      executedPrice: null,
      executedQuantity: null
    }
  }
}