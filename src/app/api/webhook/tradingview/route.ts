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

// Utility function to calculate position size based on user's sizing method
function calculatePositionSizeForAllocation(allocation: any, payload: TradingViewAlert): number {
  const positionSizingMethod = allocation.positionSizingMethod || 'RISK_PERCENTAGE'
  
  if (positionSizingMethod === 'FIXED_QUANTITY') {
    // Use the fixed quantity specified by user
    return allocation.quantity || 1
  } else {
    // RISK_PERCENTAGE: Calculate quantity based on risk and price
    const allocatedAmount = allocation.allocatedAmount || 100000
    const riskPercentage = allocation.riskPercentage || 2
    const price = payload.price || 1
    
    // Calculate risk amount
    const riskAmount = (allocatedAmount * riskPercentage) / 100
    
    // For futures, assume typical margin requirement (estimate 10% of notional)
    // This is a simplified calculation - in practice, you'd get actual margin requirements
    const marginPerLot = price * 75 * 0.10 // Assuming 75 lot size and 10% margin
    
    // Calculate maximum lots based on risk amount
    const maxLots = Math.floor(riskAmount / marginPerLot)
    
    console.log(`📊 Risk-based position sizing: Risk=₹${riskAmount.toLocaleString()}, MarginPerLot=₹${marginPerLot.toLocaleString()}, MaxLots=${maxLots}`)
    
    return Math.max(1, maxLots) // At least 1 lot
  }
}

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
          
          // Record detailed error in tradeexecutions for better tracking
          const errorExecution = {
            userId: allocation.userId,
            botId: bot._id,
            signalId: signalId,
            symbol: payload.symbol,
            exchange: payload.exchange || bot.exchange || 'NFO',
            orderType: payload.action,
            quantity: calculatePositionSizeForAllocation(allocation, payload),
            requestedPrice: payload.price || 0,
            executedPrice: 0,
            executedQuantity: 0,
            zerodhaOrderId: null,
            status: 'FAILED',
            tradeType: payload.action === 'SELL' || payload.action === 'EXIT' ? 'EXIT' : 'ENTRY',
            exitReason: null,
            pnl: 0,
            fees: 0,
            error: `Daily trade limit reached (${todayTrades}/${allocation.maxTradesPerDay} trades today). Trading limit configured in bot allocation settings.`,
            zerodhaResponse: null,
            createdAt: new Date(),
            updatedAt: new Date()
          }
          
          const errorResult = await db.collection('tradeexecutions').insertOne(errorExecution)
          
          results.affectedUsers.push({
            userId: allocation.userId,
            executed: false,
            executionId: errorResult.insertedId,
            error: `Daily trade limit reached (${todayTrades}/${allocation.maxTradesPerDay} trades today)`
          })
          results.failed++
          continue
        }

        // Check trading hours with safe defaults
        const now = new Date()
        const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`
        
        // Use default trading hours if enabledHours is missing or incomplete
        const enabledHours = allocation.enabledHours || {}
        const startTime = enabledHours.start || '09:15'  // Default market start
        const endTime = enabledHours.end || '15:30'      // Default market end
        
        if (currentTime < startTime || currentTime > endTime) {
          console.log(`⏰ Outside trading hours for user: ${allocation.userId} (${currentTime} not between ${startTime}-${endTime})`)
          
          // Record detailed error in tradeexecutions for better tracking
          const errorExecution = {
            userId: allocation.userId,
            botId: bot._id,
            signalId: signalId,
            symbol: payload.symbol,
            exchange: payload.exchange || bot.exchange || 'NFO',
            orderType: payload.action,
            quantity: calculatePositionSizeForAllocation(allocation, payload),
            requestedPrice: payload.price || 0,
            executedPrice: 0,
            executedQuantity: 0,
            zerodhaOrderId: null,
            status: 'FAILED',
            tradeType: payload.action === 'SELL' || payload.action === 'EXIT' ? 'EXIT' : 'ENTRY',
            exitReason: null,
            pnl: 0,
            fees: 0,
            error: `Outside configured trading hours (${currentTime} not between ${startTime}-${endTime}). Check bot allocation settings to modify trading hours.`,
            zerodhaResponse: null,
            createdAt: new Date(),
            updatedAt: new Date()
          }
          
          const errorResult = await db.collection('tradeexecutions').insertOne(errorExecution)
          
          results.affectedUsers.push({
            userId: allocation.userId,
            executed: false,
            executionId: errorResult.insertedId,
            error: `Outside configured trading hours (${startTime}-${endTime})`
          })
          results.failed++
          continue
        }
        
        console.log(`✅ Trading hours check passed for user: ${allocation.userId} (${currentTime} within ${startTime}-${endTime})`)

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
    
    // Calculate position size based on user's sizing method
    const calculatedQuantity = calculatePositionSizeForAllocation(allocation, payload)
    console.log(`📊 Entry position sizing: Method=${allocation.positionSizingMethod || 'RISK_PERCENTAGE'}, Calculated=${calculatedQuantity} lots`)
    
    // Check if bot allows multiple positions
    if (!bot.allowMultiplePositions) {
      const openPositions = await getOpenPositions(new ObjectId(allocation.userId), bot._id)
      if (openPositions.length > 0) {
        console.log(`❌ Multiple positions not allowed for bot: ${bot.name}`)
        
        // Record this as a failed execution in the database for tracking
        const errorExecution = {
          userId: allocation.userId,
          botId: bot._id,
          signalId: signalId,
          symbol: payload.symbol,
          exchange: payload.exchange || bot.exchange || 'NFO',
          orderType: payload.action,
          quantity: calculatedQuantity,
          requestedPrice: payload.price || 0,
          executedPrice: 0,
          executedQuantity: 0,
          zerodhaOrderId: null,
          status: 'FAILED',
          tradeType: 'ENTRY',
          exitReason: null,
          pnl: 0,
          fees: 0,
          error: `Multiple positions not allowed for this bot. Current open positions: ${openPositions.length}. Bot configuration prevents multiple simultaneous positions. Exit existing position first or enable multiple positions in bot settings.`,
          zerodhaResponse: null,
          createdAt: new Date(),
          updatedAt: new Date()
        }
        
        const client = await clientPromise
        const db = client.db('tradebot')
        const errorResult = await db.collection('tradeexecutions').insertOne(errorExecution)
        
        return {
          success: false,
          executionId: errorResult.insertedId,
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
        entryQuantity: calculatedQuantity,
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
    
    // Calculate position size based on user's sizing method  
    const calculatedQuantity = calculatePositionSizeForAllocation(allocation, payload)
    console.log(`📊 Exit position sizing: Method=${allocation.positionSizingMethod || 'RISK_PERCENTAGE'}, Calculated=${calculatedQuantity} lots`)
    
    // Find open positions for this user and bot
    const openPositions = await getOpenPositions(new ObjectId(allocation.userId), bot._id)
    
    if (openPositions.length === 0) {
      console.log(`⚠️ No open positions found for user: ${allocation.userId}, bot: ${bot.name}`)
      
      // Record this as a failed execution in the database for tracking
      const errorExecution = {
        userId: allocation.userId,
        botId: bot._id,
        signalId: signalId,
        symbol: payload.symbol,
        exchange: payload.exchange || bot.exchange || 'NFO',
        orderType: payload.action,
        quantity: calculatedQuantity,
        requestedPrice: payload.price || 0,
        executedPrice: 0,
        executedQuantity: 0,
        zerodhaOrderId: null,
        status: 'FAILED',
        tradeType: 'EXIT',
        exitReason: 'No open positions to exit',
        pnl: 0,
        fees: 0,
        error: `No open positions found to exit. This usually means: 1) Positions were manually closed in Zerodha, 2) Previous exit signal already processed, or 3) No entry signal was executed for this bot.`,
        zerodhaResponse: null,
        createdAt: new Date(),
        updatedAt: new Date()
      }
      
      const client = await clientPromise
      const db = client.db('tradebot')
      const errorResult = await db.collection('tradeexecutions').insertOne(errorExecution)
      
      return {
        success: false,
        executionId: errorResult.insertedId,
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
        
        // Create exit trade execution with proper side handling
        const exitPayload = {
          ...payload,
          // For LONG positions: SELL to exit
          // For SHORT positions: BUY to cover/exit
          action: position.side === 'LONG' ? 'SELL' : 'BUY'
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
    // Calculate position size based on user's sizing method
    const calculatedQuantity = calculatePositionSizeForAllocation(allocation, payload)
    console.log(`📊 Position sizing: Method=${allocation.positionSizingMethod || 'RISK_PERCENTAGE'}, Calculated=${calculatedQuantity} lots`)
    
    // Create trade execution record
    const tradeExecution = {
      userId: allocation.userId,
      botId: bot._id,
      signalId: signalId,
      allocationId: allocation._id,
      symbol: payload.symbol,
      exchange: payload.exchange || bot.exchange || 'NFO',
      instrumentType: payload.instrumentType || bot.instrumentType || 'FUTURES',
      quantity: calculatedQuantity, // Calculated based on user's position sizing method
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

    // Real Zerodha API integration
    const zerodhaResult = await executeRealZerodhaOrder(tradeExecution, allocation, db)

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

    // Prepare signal for options bot with side information
    const side = determinePositionSide(payload)
    const optionsSignal = {
      action: payload.action as 'BUY' | 'SELL' | 'SHORT' | 'SELL_SHORT' | 'LONG',
      price: payload.price || 19500, // Default NIFTY price if not provided
      symbol: 'NIFTY',
      timestamp: new Date(),
      side: side  // Pass the determined side
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
      executedPrice: optionsResult.executionDetails?.executionPrice || null,
      executedQuantity: optionsResult.success ? optionsResult.positionSize?.quantity || 0 : null,
      zerodhaOrderId: optionsResult.executionDetails?.orderId || null,
      zerodhaTradeId: optionsResult.executionDetails?.orderId || null,
      status: optionsResult.success ? 'EXECUTED' : 'FAILED',
      submittedAt: new Date(),
      executedAt: optionsResult.executionDetails?.executionTime || (optionsResult.success ? new Date() : null),
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
        orderId: optionsResult.executionDetails?.orderId || `OPT_${Date.now()}`,
        tradeId: `OPTTRD_${optionsResult.executionDetails?.orderId || Date.now()}`,
        executedPrice: optionsResult.executionDetails?.executionPrice || optionsResult.selectedContract.premium,
        executedQuantity: optionsResult.positionSize?.quantity || 0,
        response: { 
          status: 'COMPLETE',
          options_analysis: optionsResult,
          order_timestamp: optionsResult.executionDetails?.executionTime?.toISOString() || new Date().toISOString(),
          real_order_placed: !!optionsResult.executionDetails?.orderId
        }
      }, executionResult.insertedId, db)
    }

    return {
      success: optionsResult.success,
      executionId: executionResult.insertedId,
      orderId: optionsResult.executionDetails?.orderId || null,
      error: optionsResult.error,
      optionsDetails: {
        selectedContract: optionsResult.selectedContract,
        positionSize: optionsResult.positionSize,
        realOrderPlaced: !!optionsResult.executionDetails?.orderId
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

/**
 * Execute real Zerodha order with proper order type handling
 */
async function executeRealZerodhaOrder(tradeExecution: any, allocation: any, db: any) {
  try {
    console.log(`🚀 Executing real Zerodha ${tradeExecution.orderType} for user ${allocation.userId}`)
    
    // Get user's Zerodha credentials
    const user = await db.collection('users').findOne({ _id: allocation.userId })
    if (!user?.zerodhaConfig?.accessToken) {
      throw new Error('User Zerodha configuration not found or access token missing')
    }
    
    // Import encryption utilities
    const { decrypt } = await import('@/lib/encryption')
    
    // Decrypt credentials
    const apiKey = decrypt(user.zerodhaConfig.apiKey)
    const apiSecret = decrypt(user.zerodhaConfig.apiSecret) 
    const accessToken = decrypt(user.zerodhaConfig.accessToken)
    
    // Initialize Zerodha API
    const { ZerodhaAPI } = await import('@/lib/zerodha')
    const zerodha = new ZerodhaAPI(apiKey, apiSecret, accessToken)
    
    // Determine order type based on signal and bot configuration
    const orderType = determineOrderType(tradeExecution, allocation)
    
    // Prepare order parameters
    const orderParams = {
      exchange: tradeExecution.exchange,
      tradingsymbol: tradeExecution.symbol,
      transaction_type: tradeExecution.orderType === 'BUY' || tradeExecution.orderType === 'ENTRY' ? 'BUY' : 'SELL',
      quantity: tradeExecution.quantity,
      order_type: orderType, // 'MARKET' or 'LIMIT'
      product: tradeExecution.instrumentType === 'FUTURES' ? 'MIS' : 'CNC', // Intraday for futures, delivery for equity
      validity: 'DAY',
      tag: `TRADEBOT_${allocation.botId}_${Date.now()}`
    }
    
    // Add price for limit orders
    if (orderType === 'LIMIT' && tradeExecution.requestedPrice) {
      orderParams.price = tradeExecution.requestedPrice
    }
    
    console.log(`📋 Order parameters:`, {
      ...orderParams,
      tag: orderParams.tag
    })
    
    // Place the order with retry logic
    const orderResponse = await placeOrderWithRetry(zerodha, orderParams, 3)
    
    if (orderResponse.status === 'success') {
      // For market orders, they execute immediately
      // For limit orders, we need to check status
      const orderId = orderResponse.data.order_id
      
      // Wait a moment for execution (market orders execute quickly)
      await new Promise(resolve => setTimeout(resolve, 2000))
      
      // Get order status to check execution
      const orders = await zerodha.getOrders()
      const executedOrder = orders.data?.find((order: any) => order.order_id === orderId)
      
      if (executedOrder && executedOrder.status === 'COMPLETE') {
        return {
          success: true,
          orderId: orderId,
          tradeId: `TRD_${orderId}`,
          executedPrice: executedOrder.average_price || executedOrder.price,
          executedQuantity: executedOrder.filled_quantity,
          error: null,
          response: {
            ...orderResponse,
            order_details: executedOrder,
            execution_timestamp: new Date().toISOString()
          }
        }
      } else if (executedOrder && executedOrder.status === 'OPEN') {
        // Order is pending (limit order not filled yet)
        return {
          success: true,
          orderId: orderId,
          tradeId: `TRD_${orderId}`,
          executedPrice: null, // Not executed yet
          executedQuantity: 0,
          error: null,
          response: {
            ...orderResponse,
            order_details: executedOrder,
            status: 'PENDING',
            message: 'Order placed but not executed yet'
          }
        }
      } else {
        // Order failed or rejected
        return {
          success: false,
          orderId: orderId,
          tradeId: null,
          executedPrice: null,
          executedQuantity: null,
          error: executedOrder?.status_message || 'Order execution failed',
          response: {
            ...orderResponse,
            order_details: executedOrder
          }
        }
      }
    } else {
      throw new Error(orderResponse.message || 'Order placement failed')
    }
    
  } catch (error) {
    console.error(`❌ Real Zerodha execution error:`, error)
    
    // Fallback to simulation in case of API issues (configurable)
    const enableFallback = process.env.ZERODHA_FALLBACK_TO_SIMULATION === 'true'
    
    if (enableFallback) {
      console.log(`🔄 Falling back to simulation due to error: ${error.message}`)
      return await simulateZerodhaExecution(tradeExecution, allocation)
    }
    
    return {
      success: false,
      orderId: null,
      tradeId: null,
      executedPrice: null,
      executedQuantity: null,
      error: error.message || 'Unknown execution error',
      response: null
    }
  }
}

/**
 * Determine order type (MARKET vs LIMIT) based on configuration
 */
function determineOrderType(tradeExecution: any, allocation: any): 'MARKET' | 'LIMIT' {
  // Check if price is specified (indicates limit order preference)
  if (tradeExecution.requestedPrice && tradeExecution.requestedPrice > 0) {
    return 'LIMIT'
  }
  
  // Check allocation-level preference
  if (allocation.preferredOrderType) {
    return allocation.preferredOrderType.toUpperCase()
  }
  
  // Default to MARKET for immediate execution
  return 'MARKET'
}

/**
 * Place order with retry logic and exponential backoff
 */
async function placeOrderWithRetry(zerodha: any, orderParams: any, maxRetries: number = 3): Promise<any> {
  let lastError: any = null
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`📤 Order placement attempt ${attempt}/${maxRetries}`)
      
      const response = await zerodha.placeOrder('regular', orderParams)
      
      if (response.status === 'success') {
        console.log(`✅ Order placed successfully on attempt ${attempt}`)
        return response
      } else {
        throw new Error(response.message || 'Order placement failed')
      }
      
    } catch (error: any) {
      lastError = error
      console.error(`❌ Attempt ${attempt} failed:`, error.message)
      
      // Check if error is retryable
      if (!isRetryableError(error)) {
        console.log(`🚫 Non-retryable error, stopping attempts`)
        throw error
      }
      
      // Exponential backoff: wait 1s, 2s, 4s, etc.
      if (attempt < maxRetries) {
        const waitTime = Math.pow(2, attempt - 1) * 1000
        console.log(`⏳ Waiting ${waitTime}ms before retry...`)
        await new Promise(resolve => setTimeout(resolve, waitTime))
      }
    }
  }
  
  // All retries exhausted
  console.error(`❌ All ${maxRetries} attempts failed. Last error:`, lastError?.message)
  throw lastError || new Error('Order placement failed after all retries')
}

/**
 * Determine if an error is retryable
 */
function isRetryableError(error: any): boolean {
  const errorMessage = error.message?.toLowerCase() || ''
  
  // Network/connection errors - retryable
  if (errorMessage.includes('timeout') ||
      errorMessage.includes('network') ||
      errorMessage.includes('econnreset') ||
      errorMessage.includes('enotfound') ||
      errorMessage.includes('socket')) {
    return true
  }
  
  // Zerodha API rate limiting - retryable
  if (errorMessage.includes('rate limit') ||
      errorMessage.includes('too many requests') ||
      errorMessage.includes('429')) {
    return true
  }
  
  // Temporary server errors - retryable
  if (errorMessage.includes('500') ||
      errorMessage.includes('502') ||
      errorMessage.includes('503') ||
      errorMessage.includes('504')) {
    return true
  }
  
  // Market data related temporary errors - retryable
  if (errorMessage.includes('market data') ||
      errorMessage.includes('price not available')) {
    return true
  }
  
  // Non-retryable errors
  if (errorMessage.includes('insufficient funds') ||
      errorMessage.includes('invalid symbol') ||
      errorMessage.includes('invalid quantity') ||
      errorMessage.includes('unauthorized') ||
      errorMessage.includes('forbidden') ||
      errorMessage.includes('400') ||
      errorMessage.includes('401') ||
      errorMessage.includes('403')) {
    return false
  }
  
  // Default to retryable for unknown errors
  return true
}

/**
 * Fallback simulation function (kept for compatibility and testing)
 */
async function simulateZerodhaExecution(tradeExecution: any, allocation: any) {
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
      executedPrice: tradeExecution.requestedPrice || 18500,
      executedQuantity: tradeExecution.quantity,
      error: null,
      response: {
        status: 'COMPLETE',
        order_timestamp: new Date().toISOString(),
        average_price: tradeExecution.requestedPrice || 18500,
        simulation: true
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