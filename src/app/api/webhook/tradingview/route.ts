import { NextRequest, NextResponse } from 'next/server'
import clientPromise from '@/lib/mongodb'
import { ObjectId } from 'mongodb'

// TradingView Alert Interface
interface TradingViewAlert {
  symbol: string
  action: 'BUY' | 'SELL' | 'CLOSE'
  price: number
  quantity?: number
  strategy: string
  timestamp: string
  exchange?: string
  message?: string
  passphrase?: string
}

// Bot Configuration Interface
interface BotConfig {
  _id: ObjectId
  userId: string
  name: string
  strategy: string
  isActive: boolean
  riskLevel: string
  maxTradesPerDay: number
  webhook: {
    url: string
    passphrase: string
    isEnabled: boolean
  }
  tradingConfig: {
    symbol: string
    exchange: string
    lotSize: number
    maxPositionSize: number
  }
}

export async function POST(request: NextRequest) {
  try {
    // Parse the incoming webhook payload
    const payload: TradingViewAlert = await request.json()
    
    console.log('📡 Received TradingView webhook:', payload)

    // Basic validation
    if (!payload.symbol || !payload.action || !payload.strategy) {
      return NextResponse.json(
        { error: 'Missing required fields: symbol, action, strategy' },
        { status: 400 }
      )
    }

    // Connect to database
    const client = await clientPromise
    const db = client.db('tradebot')
    
    // Log the incoming alert
    await db.collection('webhook_logs').insertOne({
      type: 'tradingview_alert',
      payload,
      receivedAt: new Date(),
      processed: false,
      source: 'tradingview'
    })

    // Find the bot configuration that matches this strategy
    const botConfig = await db.collection('bot_configs').findOne({
      strategy: payload.strategy,
      isActive: true,
      'webhook.isEnabled': true
    }) as BotConfig | null

    if (!botConfig) {
      console.log('⚠️ No active bot found for strategy:', payload.strategy)
      return NextResponse.json(
        { error: 'No active bot configuration found for this strategy' },
        { status: 404 }
      )
    }

    // Validate passphrase if provided
    if (botConfig.webhook.passphrase && payload.passphrase !== botConfig.webhook.passphrase) {
      console.log('🔒 Invalid passphrase for bot:', botConfig.name)
      return NextResponse.json(
        { error: 'Invalid passphrase' },
        { status: 401 }
      )
    }

    // Check daily trade limit
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    
    const todayTrades = await db.collection('bot_trades').countDocuments({
      botId: botConfig._id,
      createdAt: { $gte: today }
    })

    if (todayTrades >= botConfig.maxTradesPerDay) {
      console.log('📊 Daily trade limit reached for bot:', botConfig.name)
      return NextResponse.json(
        { error: 'Daily trade limit reached' },
        { status: 429 }
      )
    }

    // Process the alert based on action
    const tradeResult = await processAlert(payload, botConfig, db)

    // Update the webhook log with processing result
    await db.collection('webhook_logs').updateOne(
      { payload, receivedAt: { $gte: new Date(Date.now() - 5000) } },
      { 
        $set: { 
          processed: true, 
          processedAt: new Date(),
          tradeResult
        } 
      }
    )

    return NextResponse.json({
      success: true,
      message: 'Alert processed successfully',
      botName: botConfig.name,
      action: payload.action,
      tradeResult
    })

  } catch (error) {
    console.error('❌ Webhook processing error:', error)
    
    return NextResponse.json(
      { error: 'Internal server error processing webhook' },
      { status: 500 }
    )
  }
}

async function processAlert(alert: TradingViewAlert, botConfig: BotConfig, db: any) {
  try {
    console.log(`🤖 Processing ${alert.action} alert for ${botConfig.name}`)

    // Create trade record
    const trade = {
      botId: botConfig._id,
      userId: botConfig.userId,
      symbol: alert.symbol,
      action: alert.action,
      price: alert.price,
      quantity: alert.quantity || calculateQuantity(botConfig, alert.price),
      strategy: alert.strategy,
      exchange: alert.exchange || botConfig.tradingConfig.exchange,
      alertData: alert,
      status: 'pending',
      createdAt: new Date(),
      executedAt: null,
      zerodhaOrderId: null,
      executionPrice: null,
      executionQuantity: null
    }

    // Insert trade record
    const tradeResult = await db.collection('bot_trades').insertOne(trade)
    console.log('💾 Trade record created:', tradeResult.insertedId)

    // Here you would integrate with Zerodha API to execute the actual trade
    // For now, we'll simulate the trade execution
    const executionResult = await simulateTradeExecution(trade, botConfig)

    // Update trade record with execution details
    await db.collection('bot_trades').updateOne(
      { _id: tradeResult.insertedId },
      {
        $set: {
          status: executionResult.success ? 'executed' : 'failed',
          executedAt: new Date(),
          zerodhaOrderId: executionResult.orderId,
          executionPrice: executionResult.price,
          executionQuantity: executionResult.quantity,
          executionError: executionResult.error
        }
      }
    )

    return {
      success: executionResult.success,
      tradeId: tradeResult.insertedId,
      orderId: executionResult.orderId,
      executionPrice: executionResult.price,
      executionQuantity: executionResult.quantity,
      error: executionResult.error
    }

  } catch (error) {
    console.error('❌ Alert processing error:', error)
    throw error
  }
}

function calculateQuantity(botConfig: BotConfig, price: number): number {
  // Calculate quantity based on risk level
  // For "1 contract per 3 Lakhs capital", we'll use a simple calculation
  const capitalPerContract = 300000 // 3 Lakhs
  const lotSize = botConfig.tradingConfig.lotSize || 25 // Nifty lot size
  
  // For simplicity, return 1 lot for now
  // In production, you'd calculate based on available capital
  return lotSize
}

async function simulateTradeExecution(trade: any, botConfig: BotConfig) {
  // This is a simulation - replace with actual Zerodha API integration
  console.log(`🔄 Simulating ${trade.action} execution for ${trade.symbol}`)
  
  // Simulate some processing time
  await new Promise(resolve => setTimeout(resolve, 1000))
  
  // Return simulated success result
  return {
    success: true,
    orderId: `SIM_${Date.now()}`,
    price: trade.price,
    quantity: trade.quantity,
    error: null
  }
}

// GET method for webhook testing
export async function GET() {
  return NextResponse.json({
    message: 'TradingView Webhook Endpoint',
    status: 'active',
    timestamp: new Date().toISOString(),
    endpoints: {
      webhook: '/api/webhook/tradingview',
      logs: '/api/webhook/logs',
      test: '/api/webhook/test'
    }
  })
}