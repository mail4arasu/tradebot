import { NextRequest, NextResponse } from 'next/server'
import clientPromise from '@/lib/mongodb'
import { ObjectId } from 'mongodb'
import { executeOptionsBotTrade, validateOptionsBotConfig } from '@/utils/optionsBotExecution'
import { 
  createPosition, 
  updatePositionWithExit, 
  getOpenPositions, 
  determineSignalType, 
  determinePositionSide 
} from '@/utils/positionManager'
import { intradayScheduler } from '@/services/intradayScheduler'

// TradingView Alert Interface
interface TradingViewAlert {
  symbol: string
  action: 'BUY' | 'SELL' | 'EXIT' | 'ENTRY'
  price?: number
  quantity?: number
  strategy?: string
  timestamp?: string
  exchange?: string
  instrumentType?: string
  message?: string
  passphrase?: string
  stopLoss?: number
  target?: number
  botId?: string // Optional bot identifier
}

// Enhanced webhook processing for multi-user system
export async function POST(request: NextRequest) {
  try {
    // Parse the incoming webhook payload
    const payload: TradingViewAlert = await request.json()
    
    console.log('📡 Received TradingView webhook:', payload)

    // Basic validation
    if (!payload.symbol || !payload.action) {
      return NextResponse.json(
        { error: 'Missing required fields: symbol, action' },
        { status: 400 }
      )
    }

    // Connect to database
    const client = await clientPromise
    const db = client.db('tradebot')
    
    // Find the bot that should process this signal
    let targetBot = null
    
    if (payload.botId) {
      // Specific bot targeted
      targetBot = await db.collection('bots').findOne({ 
        _id: new ObjectId(payload.botId),
        isActive: true,
        emergencyStop: { $ne: true }
      })
    } else {
      // Find bot by symbol and strategy match
      const query: any = {
        isActive: true,
        emergencyStop: { $ne: true },
        symbol: payload.symbol || 'NIFTY50'
      }
      
      if (payload.strategy) {
        query.strategy = { $regex: payload.strategy, $options: 'i' }
      }
      
      targetBot = await db.collection('bots').findOne(query)
    }

    if (!targetBot) {
      console.log('⚠️ No active bot found for signal:', payload.symbol)
      return NextResponse.json(
        { error: 'No active bot found for this signal' },
        { status: 404 }
      )
    }

    // Check global emergency stop
    if (targetBot.emergencyStop) {
      console.log('🛑 Emergency stop active for bot:', targetBot.name)
      return NextResponse.json(
        { error: 'Bot is in emergency stop mode' },
        { status: 423 }
      )
    }

    // Create webhook signal record
    const webhookSignal = {
      botId: targetBot._id,
      signal: payload.action,
      symbol: payload.symbol,
      exchange: payload.exchange || targetBot.exchange || 'NFO',
      instrumentType: payload.instrumentType || targetBot.instrumentType || 'FUTURES',
      price: payload.price,
      stopLoss: payload.stopLoss,
      target: payload.target,
      processed: false,
      processedAt: null,
      emergencyStop: false,
      rawPayload: payload,
      affectedUsers: [],
      totalUsersTargeted: 0,
      successfulExecutions: 0,
      failedExecutions: 0,
      createdAt: new Date(),
      updatedAt: new Date()
    }

    const signalResult = await db.collection('webhooksignals').insertOne(webhookSignal)
    console.log('📡 Signal recorded:', signalResult.insertedId)

    // Process signal for all users who have this bot enabled
    const processingResult = await processSignalForAllUsers(
      signalResult.insertedId,
      targetBot,
      payload,
      db
    )

    // Update signal with processing results
    await db.collection('webhooksignals').updateOne(
      { _id: signalResult.insertedId },
      {
        $set: {
          processed: true,
          processedAt: new Date(),
          affectedUsers: processingResult.affectedUsers,
          totalUsersTargeted: processingResult.totalUsers,
          successfulExecutions: processingResult.successful,
          failedExecutions: processingResult.failed,
          updatedAt: new Date()
        }
      }
    )

    return NextResponse.json({
      success: true,
      message: 'Signal processed successfully',
      botName: targetBot.name,
      signalId: signalResult.insertedId.toString(),
      action: payload.action,
      results: {
        totalUsers: processingResult.totalUsers,
        successful: processingResult.successful,
        failed: processingResult.failed
      }
    })

  } catch (error) {
    console.error('❌ Webhook processing error:', error)
    
    return NextResponse.json(
      { error: 'Internal server error processing webhook' },
      { status: 500 }
    )
  }
}

async function processSignalForAllUsers(signalId: ObjectId, bot: any, payload: TradingViewAlert, db: any) {
  try {
    console.log(`🔄 Processing signal for bot: ${bot.name}`)

    // Find all users who have this bot enabled
    const userAllocations = await db.collection('userbotallocations').find({
      botId: bot._id,
      isActive: true
    }).toArray()

    console.log(`👥 Found ${userAllocations.length} users with bot enabled`)

    const results = {
      totalUsers: userAllocations.length,
      successful: 0,
      failed: 0,
      affectedUsers: [] as any[]
    }

    // Process each user allocation
    for (const allocation of userAllocations) {
      try {
        // Check user-specific trade limits
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        
        const todayTrades = await db.collection('tradeexecutions').countDocuments({
          userId: allocation.userId,
          botId: bot._id,
          createdAt: { $gte: today }
        })

        // Check if user has reached daily trade limit
        if (todayTrades >= allocation.maxTradesPerDay) {
          console.log(`📊 Daily trade limit reached for user: ${allocation.userId}`)
          results.affectedUsers.push({
            userId: allocation.userId,
            executed: false,
            executionId: null,
            error: 'Daily trade limit reached'
          })
          results.failed++
          continue
        }

        // Check trading hours
        const now = new Date()
        const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`
        
        if (currentTime < allocation.enabledHours.start || currentTime > allocation.enabledHours.end) {
          console.log(`⏰ Outside trading hours for user: ${allocation.userId}`)
          results.affectedUsers.push({
            userId: allocation.userId,
            executed: false,
            executionId: null,
            error: 'Outside configured trading hours'
          })
          results.failed++
          continue
        }

        // Execute trade for this user with position management
        const executionResult = await executeTradeWithPositionManagement(
          allocation,
          bot,
          payload,
          signalId,
          db
        )

        results.affectedUsers.push({
          userId: allocation.userId,
          executed: executionResult.success,
          executionId: executionResult.executionId,
          error: executionResult.error
        })

        if (executionResult.success) {
          results.successful++
          
          // Update user's daily trade count
          await db.collection('userbotallocations').updateOne(
            { _id: allocation._id },
            { 
              $inc: { currentDayTrades: 1, totalTrades: 1 },
              $set: { lastSignalTime: new Date() }
            }
          )
        } else {
          results.failed++
        }

      } catch (userError) {
        console.error(`❌ Error processing user ${allocation.userId}:`, userError)
        results.affectedUsers.push({
          userId: allocation.userId,
          executed: false,
          executionId: null,
          error: userError.message
        })
        results.failed++
      }
    }

    return results

  } catch (error) {
    console.error('❌ Signal processing error:', error)
    throw error
  }
}

async function executeTradeWithPositionManagement(allocation: any, bot: any, payload: TradingViewAlert, signalId: ObjectId, db: any) {
  try {
    console.log(`💼 Executing trade with position management for user: ${allocation.userId}`)
    
    // Determine signal type
    const signalType = determineSignalType(payload)
    console.log(`📊 Signal type determined: ${signalType}`)
    
    if (signalType === 'ENTRY') {
      return await processEntrySignal(allocation, bot, payload, signalId, db)
    } else if (signalType === 'EXIT') {
      return await processExitSignal(allocation, bot, payload, signalId, db)
    } else {
      console.log(`⚠️ Unknown signal type: ${payload.action}`)
      return {
        success: false,
        executionId: null,
        error: `Unknown signal type: ${payload.action}`
      }
    }
  } catch (error) {
    console.error('❌ Error in position-aware trade execution:', error)
    return {
      success: false,
      executionId: null,
      error: error.message
    }
  }
}

async function processEntrySignal(allocation: any, bot: any, payload: TradingViewAlert, signalId: ObjectId, db: any) {
  try {
    console.log(`🚪 Processing ENTRY signal for user: ${allocation.userId}`)
    
    // Check if bot allows multiple positions
    if (!bot.allowMultiplePositions) {
      const openPositions = await getOpenPositions(new ObjectId(allocation.userId), bot._id)
      if (openPositions.length > 0) {
        console.log(`❌ Multiple positions not allowed for bot: ${bot.name}`)
        return {
          success: false,
          executionId: null,
          error: 'Multiple positions not allowed for this bot'
        }
      }
    }
    
    // Execute the entry trade using existing logic
    const executionResult = await executeTradeForUser(allocation, bot, payload, signalId, db)
    
    if (executionResult.success) {
      // Create position record
      const positionData = {
        userId: new ObjectId(allocation.userId),
        botId: bot._id,
        allocationId: allocation._id,
        symbol: payload.symbol,
        exchange: payload.exchange || bot.exchange || 'NFO',
        instrumentType: payload.instrumentType || bot.instrumentType || 'FUTURES',
        entryExecutionId: executionResult.executionId,
        entrySignalId: signalId,
        entryPrice: payload.price || 0,
        entryQuantity: allocation.quantity,
        entryTime: new Date(),
        entryOrderId: executionResult.orderId || 'SIMULATED',
        side: determinePositionSide(payload),
        isIntraday: bot.tradingType === 'INTRADAY',
        scheduledExitTime: bot.tradingType === 'INTRADAY' ? bot.intradayExitTime : undefined,
        stopLoss: payload.stopLoss,
        target: payload.target
      }
      
      const positionId = await createPosition(positionData)
      console.log(`📊 Position created: ${positionId}`)
      
      // Update trade execution with position link
      await db.collection('tradeexecutions').updateOne(
        { _id: executionResult.executionId },
        {
          $set: {
            positionId: positionId,
            tradeType: 'ENTRY',
            updatedAt: new Date()
          }
        }
      )
      
      // Schedule intraday auto-exit if needed
      if (bot.tradingType === 'INTRADAY' && bot.autoSquareOff && bot.intradayExitTime) {
        try {
          await intradayScheduler.schedulePositionExit(positionId.toString(), bot.intradayExitTime)
          console.log(`📅 Intraday auto-exit scheduled for position ${positionId} at ${bot.intradayExitTime}`)
        } catch (schedulerError) {
          console.error(`❌ Failed to schedule auto-exit for position ${positionId}:`, schedulerError)
          // Don't fail the trade, just log the error
        }
      }
    }
    
    return executionResult
  } catch (error) {
    console.error('❌ Error processing entry signal:', error)
    return {
      success: false,
      executionId: null,
      error: error.message
    }
  }
}

async function processExitSignal(allocation: any, bot: any, payload: TradingViewAlert, signalId: ObjectId, db: any) {
  try {
    console.log(`🚪 Processing EXIT signal for user: ${allocation.userId}`)
    
    // Find open positions for this user and bot
    const openPositions = await getOpenPositions(new ObjectId(allocation.userId), bot._id)
    
    if (openPositions.length === 0) {
      console.log(`⚠️ No open positions found for user: ${allocation.userId}, bot: ${bot.name}`)
      return {
        success: false,
        executionId: null,
        error: 'No open positions to exit'
      }
    }
    
    console.log(`📊 Found ${openPositions.length} open position(s) to exit`)
    
    // Process exit for each open position
    const exitResults = []
    for (const position of openPositions) {
      try {
        // Calculate exit quantity (for now, exit full position)
        const exitQuantity = position.currentQuantity
        
        // Create exit trade execution
        const exitPayload = {
          ...payload,
          action: 'SELL' // Convert EXIT to SELL for execution
        }
        
        const executionResult = await executeTradeForUser(allocation, bot, exitPayload, signalId, db)
        
        if (executionResult.success) {
          // Update position with exit
          await updatePositionWithExit(position._id, {
            executionId: executionResult.executionId,
            signalId: signalId,
            quantity: exitQuantity,
            price: payload.price || 0,
            orderId: executionResult.orderId || 'SIMULATED',
            reason: 'SIGNAL'
          })
          
          // Update trade execution with position link
          await db.collection('tradeexecutions').updateOne(
            { _id: executionResult.executionId },
            {
              $set: {
                positionId: position._id,
                parentPositionId: position._id,
                tradeType: exitQuantity >= position.entryQuantity ? 'EXIT' : 'PARTIAL_EXIT',
                exitReason: 'SIGNAL',
                updatedAt: new Date()
              }
            }
          )
          
          console.log(`✅ Position ${position.positionId} exit processed successfully`)
        }
        
        exitResults.push(executionResult)
      } catch (positionError) {
        console.error(`❌ Error processing exit for position ${position._id}:`, positionError)
        exitResults.push({
          success: false,
          executionId: null,
          error: positionError.message
        })
      }
    }
    
    // Return result of the first exit (can be enhanced later)
    return exitResults.length > 0 ? exitResults[0] : {
      success: false,
      executionId: null,
      error: 'No exits processed'
    }
    
  } catch (error) {
    console.error('❌ Error processing exit signal:', error)
    return {
      success: false,
      executionId: null,
      error: error.message
    }
  }
}

async function executeTradeForUser(allocation: any, bot: any, payload: TradingViewAlert, signalId: ObjectId, db: any) {
  try {
    console.log(`💼 Executing trade for user: ${allocation.userId}`)

    // Check if this is a Nifty50 Options Bot
    const isOptionsBot = bot.instrumentType === 'OPTIONS' && 
                        (bot.symbol === 'NIFTY' || bot.symbol === 'NIFTY50') &&
                        bot.name && bot.name.toLowerCase().includes('options')

    if (isOptionsBot) {
      console.log(`🎯 Detected Nifty50 Options Bot: ${bot.name}`)
      return await executeOptionsBot(allocation, bot, payload, signalId, db)
    }

    // Standard futures/equity execution
    // Create trade execution record
    const tradeExecution = {
      userId: allocation.userId,
      botId: bot._id,
      signalId: signalId,
      allocationId: allocation._id,
      symbol: payload.symbol,
      exchange: payload.exchange || bot.exchange || 'NFO',
      instrumentType: payload.instrumentType || bot.instrumentType || 'FUTURES',
      quantity: allocation.quantity, // User-defined quantity
      orderType: payload.action,
      requestedPrice: payload.price,
      executedPrice: null,
      executedQuantity: null,
      zerodhaOrderId: null,
      zerodhaTradeId: null,
      status: 'PENDING',
      submittedAt: null,
      executedAt: null,
      error: null,
      retryCount: 0,
      zerodhaResponse: null,
      pnl: null,
      fees: null,
      isEmergencyExit: false,
      riskCheckPassed: true,
      createdAt: new Date(),
      updatedAt: new Date()
    }

    const executionResult = await db.collection('tradeexecutions').insertOne(tradeExecution)
    console.log('📋 Trade execution record created:', executionResult.insertedId)

    // Here you would integrate with Zerodha API
    // For now, simulate the execution
    const zerodhaResult = await simulateZerodhaExecution(tradeExecution, allocation)

    // Update execution record with results
    await db.collection('tradeexecutions').updateOne(
      { _id: executionResult.insertedId },
      {
        $set: {
          status: zerodhaResult.success ? 'EXECUTED' : 'FAILED',
          submittedAt: new Date(),
          executedAt: zerodhaResult.success ? new Date() : null,
          zerodhaOrderId: zerodhaResult.orderId,
          zerodhaTradeId: zerodhaResult.tradeId,
          executedPrice: zerodhaResult.executedPrice,
          executedQuantity: zerodhaResult.executedQuantity,
          error: zerodhaResult.error,
          zerodhaResponse: zerodhaResult.response,
          updatedAt: new Date()
        }
      }
    )

    // If successful, create trade history record
    if (zerodhaResult.success) {
      await createTradeHistoryRecord(tradeExecution, zerodhaResult, executionResult.insertedId, db)
    }

    return {
      success: zerodhaResult.success,
      executionId: executionResult.insertedId,
      orderId: zerodhaResult.orderId,
      error: zerodhaResult.error
    }

  } catch (error) {
    console.error('❌ Trade execution error:', error)
    return {
      success: false,
      executionId: null,
      orderId: null,
      error: error.message
    }
  }
}

async function executeOptionsBot(allocation: any, bot: any, payload: TradingViewAlert, signalId: ObjectId, db: any) {
  try {
    console.log(`🤖 Executing Nifty50 Options Bot for user: ${allocation.userId}`)

    // Get user's Zerodha configuration
    const user = await db.collection('users').findOne({ _id: new ObjectId(allocation.userId) })
    if (!user?.zerodhaConfig?.accessToken) {
      throw new Error('User Zerodha configuration not found')
    }

    // Prepare options bot configuration using user's specific settings
    const optionsConfig = {
      capital: allocation.allocatedAmount, // User's allocated capital for this bot
      riskPercentage: allocation.riskPercentage, // User's configured risk percentage
      deltaThreshold: bot.parameters?.deltaThreshold || 0.6, // From bot configuration
      lotSize: 75 // Correct NIFTY options lot size
    }

    console.log(`👤 User-specific config: Capital=₹${optionsConfig.capital.toLocaleString()}, Risk=${optionsConfig.riskPercentage}%`)

    // Validate options bot configuration
    const configValidation = validateOptionsBotConfig(optionsConfig)
    if (!configValidation.valid) {
      throw new Error(`Invalid options bot config: ${configValidation.error}`)
    }

    // Prepare signal for options bot
    const optionsSignal = {
      action: payload.action as 'BUY' | 'SELL',
      price: payload.price || 19500, // Default NIFTY price if not provided
      symbol: 'NIFTY',
      timestamp: new Date()
    }

    // Execute sophisticated options analysis
    console.log(`📊 Running sophisticated options analysis...`)
    const optionsResult = await executeOptionsBotTrade(
      optionsSignal,
      optionsConfig,
      {
        apiKey: user.zerodhaConfig.apiKey,
        accessToken: user.zerodhaConfig.accessToken
      }
    )

    // Create detailed trade execution record for options
    const optionsTradeExecution = {
      userId: allocation.userId,
      botId: bot._id,
      signalId: signalId,
      allocationId: allocation._id,
      
      // Original signal data
      originalSymbol: payload.symbol,
      originalAction: payload.action,
      originalPrice: payload.price,
      
      // Options-specific data
      selectedContract: optionsResult.selectedContract,
      positionSize: optionsResult.positionSize,
      
      // Standard execution fields
      symbol: optionsResult.selectedContract?.symbol || 'NIFTY_OPTIONS',
      exchange: 'NFO',
      instrumentType: 'OPTIONS',
      quantity: optionsResult.positionSize?.quantity || 0,
      orderType: payload.action,
      requestedPrice: optionsResult.selectedContract?.premium || 0,
      executedPrice: null,
      executedQuantity: null,
      zerodhaOrderId: null,
      zerodhaTradeId: null,
      status: optionsResult.success ? 'EXECUTED' : 'FAILED',
      submittedAt: new Date(),
      executedAt: optionsResult.success ? new Date() : null,
      error: optionsResult.error || null,
      retryCount: 0,
      zerodhaResponse: optionsResult.executionDetails || null,
      pnl: null,
      fees: null,
      isEmergencyExit: false,
      riskCheckPassed: true,
      
      // Options analysis details
      optionsAnalysis: {
        atmStrike: optionsResult.selectedContract?.strike,
        delta: optionsResult.selectedContract?.delta,
        openInterest: optionsResult.selectedContract?.openInterest,
        premium: optionsResult.selectedContract?.premium,
        expiryDate: optionsResult.selectedContract?.expiry,
        optionType: optionsResult.selectedContract?.optionType,
        lots: optionsResult.positionSize?.lots,
        totalInvestment: optionsResult.positionSize?.totalInvestment,
        riskAmount: optionsResult.positionSize?.riskAmount
      },
      
      createdAt: new Date(),
      updatedAt: new Date()
    }

    const executionResult = await db.collection('tradeexecutions').insertOne(optionsTradeExecution)
    console.log('📋 Options trade execution record created:', executionResult.insertedId)

    // Create trade history record if successful
    if (optionsResult.success && optionsResult.selectedContract) {
      await createTradeHistoryRecord({
        ...optionsTradeExecution,
        symbol: optionsResult.selectedContract.symbol,
        quantity: optionsResult.positionSize?.quantity || 0,
        price: optionsResult.selectedContract.premium
      }, {
        success: true,
        orderId: `OPT_${Date.now()}`,
        tradeId: `OPTTRD_${Date.now()}`,
        executedPrice: optionsResult.selectedContract.premium,
        executedQuantity: optionsResult.positionSize?.quantity || 0,
        response: { 
          status: 'COMPLETE',
          options_analysis: optionsResult,
          order_timestamp: new Date().toISOString()
        }
      }, executionResult.insertedId, db)
    }

    return {
      success: optionsResult.success,
      executionId: executionResult.insertedId,
      orderId: optionsResult.success ? `OPT_${Date.now()}` : null,
      error: optionsResult.error,
      optionsDetails: {
        selectedContract: optionsResult.selectedContract,
        positionSize: optionsResult.positionSize
      }
    }

  } catch (error) {
    console.error('❌ Options bot execution error:', error)
    return {
      success: false,
      executionId: null,
      orderId: null,
      error: error.message || 'Unknown error in options bot execution'
    }
  }
}

async function simulateZerodhaExecution(tradeExecution: any, allocation: any) {
  // This simulates Zerodha API integration
  console.log(`🔄 Simulating Zerodha ${tradeExecution.orderType} for user ${allocation.userId}`)
  
  // Simulate processing time
  await new Promise(resolve => setTimeout(resolve, 500))
  
  // Simulate 95% success rate
  const success = Math.random() > 0.05
  
  if (success) {
    return {
      success: true,
      orderId: `SIM_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      tradeId: `TRD_${Date.now()}`,
      executedPrice: tradeExecution.requestedPrice || 18500, // Default Nifty price
      executedQuantity: tradeExecution.quantity,
      error: null,
      response: {
        status: 'COMPLETE',
        order_timestamp: new Date().toISOString(),
        average_price: tradeExecution.requestedPrice || 18500
      }
    }
  } else {
    return {
      success: false,
      orderId: null,
      tradeId: null,
      executedPrice: null,
      executedQuantity: null,
      error: 'Simulated execution failure',
      response: null
    }
  }
}

async function createTradeHistoryRecord(tradeExecution: any, zerodhaResult: any, executionId: ObjectId, db: any) {
  const tradeHistory = {
    userId: tradeExecution.userId,
    tradingSymbol: tradeExecution.symbol,
    exchange: tradeExecution.exchange,
    instrumentToken: 123456, // Would come from Zerodha
    quantity: zerodhaResult.executedQuantity,
    price: zerodhaResult.executedPrice,
    product: 'MIS', // Intraday
    orderType: 'MARKET',
    transactionType: tradeExecution.orderType === 'BUY' || tradeExecution.orderType === 'ENTRY' ? 'BUY' : 'SELL',
    timestamp: new Date(),
    orderId: zerodhaResult.orderId,
    botId: tradeExecution.botId,
    pnl: null, // Calculate later
    tradeSource: 'BOT',
    executionId: executionId,
    signalId: tradeExecution.signalId,
    tradeId: zerodhaResult.tradeId,
    fees: 0, // Would come from Zerodha
    syncedAt: new Date(),
    lastSyncCheck: new Date(),
    zerodhaData: zerodhaResult.response,
    createdAt: new Date(),
    updatedAt: new Date()
  }

  await db.collection('trades').insertOne(tradeHistory)
  console.log('📊 Trade history record created')
}

// GET method for webhook testing
export async function GET() {
  return NextResponse.json({
    message: 'TradingView Webhook Endpoint - Enhanced Multi-User System',
    status: 'active',
    timestamp: new Date().toISOString(),
    features: [
      'Multi-user trade execution',
      'User-defined position sizing',
      'Daily trade limits per user',
      'Trading hours configuration',
      'Emergency stop functionality',
      'Comprehensive trade tracking'
    ],
    samplePayload: {
      symbol: 'NIFTY50',
      action: 'BUY',
      price: 18500,
      strategy: 'Opening Breakout',
      exchange: 'NFO',
      instrumentType: 'FUTURES',
      passphrase: 'your-secret-passphrase'
    }
  })
}