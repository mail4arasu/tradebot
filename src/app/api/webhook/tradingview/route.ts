import { NextRequest, NextResponse } from 'next/server'
import clientPromise from '@/lib/mongodb'
import { ObjectId } from 'mongodb'

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

        // Execute trade for this user
        const executionResult = await executeTradeForUser(
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

async function executeTradeForUser(allocation: any, bot: any, payload: TradingViewAlert, signalId: ObjectId, db: any) {
  try {
    console.log(`💼 Executing trade for user: ${allocation.userId}`)

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