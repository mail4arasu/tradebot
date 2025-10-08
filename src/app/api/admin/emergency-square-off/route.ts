import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { isAdminUser } from '@/lib/admin'
import dbConnect from '@/lib/mongoose'
import Position from '@/models/Position'
import TradeExecution from '@/models/TradeExecution'
import User from '@/models/User'
import Bot from '@/models/Bot'
import { ZerodhaAPI } from '@/lib/zerodha'
import { decrypt } from '@/lib/encryption'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check if user is admin
    if (!(await isAdminUser())) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const { botId, confirmationCode } = await request.json()

    if (!botId) {
      return NextResponse.json({ error: 'Bot ID is required' }, { status: 400 })
    }

    // Security confirmation - require specific code
    if (confirmationCode !== 'EMERGENCY_SQUARE_OFF') {
      return NextResponse.json({ error: 'Invalid confirmation code' }, { status: 400 })
    }

    await dbConnect()

    // Get bot details
    const bot = await Bot.findById(botId)
    if (!bot) {
      return NextResponse.json({ error: 'Bot not found' }, { status: 404 })
    }

    console.log(`🚨 EMERGENCY SQUARE OFF initiated for bot: ${bot.name} (${botId})`)

    // Find all open positions for this bot
    const openPositions = await Position.find({
      botId: botId,
      status: { $in: ['OPEN', 'PARTIAL'] }
    }).populate('userId', 'email zerodhaConfig')

    if (openPositions.length === 0) {
      return NextResponse.json({
        success: true,
        message: `No open positions found for bot ${bot.name}`,
        results: {
          totalPositions: 0,
          successful: 0,
          failed: 0,
          errors: []
        }
      })
    }

    console.log(`📊 Found ${openPositions.length} open positions to square off`)

    const results = {
      totalPositions: openPositions.length,
      successful: 0,
      failed: 0,
      errors: [] as string[],
      details: [] as any[]
    }

    // Process each position
    for (const position of openPositions) {
      try {
        console.log(`🔄 Processing position ${position.positionId} for user ${position.userId.email}`)

        const user = position.userId
        
        // Check if user has valid Zerodha credentials
        if (!user.zerodhaConfig?.apiKey || !user.zerodhaConfig?.apiSecret || !user.zerodhaConfig?.accessToken) {
          const error = `User ${user.email} missing Zerodha credentials`
          console.error(`❌ ${error}`)
          results.errors.push(error)
          results.failed++
          results.details.push({
            positionId: position.positionId,
            symbol: position.symbol,
            userId: user.email,
            status: 'FAILED',
            error: 'Missing Zerodha credentials'
          })
          continue
        }

        // Initialize Zerodha API for this user
        const zerodhaAPI = new ZerodhaAPI(
          decrypt(user.zerodhaConfig.apiKey),
          decrypt(user.zerodhaConfig.apiSecret),
          decrypt(user.zerodhaConfig.accessToken)
        )

        // Determine exit quantity (current open quantity)
        const exitQuantity = position.currentQuantity || position.quantity

        if (exitQuantity <= 0) {
          const error = `Position ${position.positionId} has no quantity to square off`
          console.error(`❌ ${error}`)
          results.errors.push(error)
          results.failed++
          results.details.push({
            positionId: position.positionId,
            symbol: position.symbol,
            userId: user.email,
            status: 'FAILED',
            error: 'No quantity to square off'
          })
          continue
        }

        // Determine exit order type (opposite of entry)
        const exitOrderType = position.side === 'LONG' ? 'SELL' : 'BUY'

        console.log(`📤 Placing EMERGENCY exit order: ${exitOrderType} ${exitQuantity} ${position.symbol}`)

        // Place market order to square off position
        const orderResponse = await zerodhaAPI.placeOrder({
          tradingsymbol: position.symbol,
          exchange: position.exchange,
          transaction_type: exitOrderType,
          order_type: 'MARKET',
          quantity: exitQuantity,
          product: position.instrumentType === 'FUTURES' ? 'MIS' : 'MIS', // Intraday for immediate square off
          validity: 'DAY',
          variety: 'regular',
          tag: 'EMERGENCY_SQUARE_OFF'
        })

        if (orderResponse.success) {
          const orderId = orderResponse.data.order_id

          console.log(`✅ Emergency exit order placed successfully: ${orderId}`)

          // Create trade execution record
          const tradeExecution = new TradeExecution({
            userId: user._id,
            botId: botId,
            positionId: position._id,
            symbol: position.symbol,
            exchange: position.exchange,
            orderType: exitOrderType,
            quantity: exitQuantity,
            requestedPrice: 0, // Market order
            executedPrice: 0, // Will be updated when order executes
            executedQuantity: 0, // Will be updated when order executes
            zerodhaOrderId: orderId,
            status: 'PENDING',
            tradeType: 'EXIT',
            exitReason: 'EMERGENCY_SQUARE_OFF',
            zerodhaResponse: orderResponse.data,
            createdAt: new Date()
          })

          await tradeExecution.save()

          // Update position status to indicate emergency square off initiated
          position.status = 'CLOSED' // Mark as closed immediately for emergency
          position.exitReason = 'EMERGENCY_SQUARE_OFF'
          position.emergencySquareOff = true
          position.emergencySquareOffTime = new Date()
          position.updatedAt = new Date()

          // Add exit execution to position
          position.exitExecutions.push(tradeExecution._id)

          await position.save()

          results.successful++
          results.details.push({
            positionId: position.positionId,
            symbol: position.symbol,
            userId: user.email,
            status: 'SUCCESS',
            orderId: orderId,
            exitQuantity: exitQuantity,
            orderType: exitOrderType
          })

          console.log(`✅ Position ${position.positionId} emergency square off completed`)

        } else {
          const error = `Failed to place exit order for ${position.positionId}: ${orderResponse.error}`
          console.error(`❌ ${error}`)
          results.errors.push(error)
          results.failed++
          results.details.push({
            positionId: position.positionId,
            symbol: position.symbol,
            userId: user.email,
            status: 'FAILED',
            error: orderResponse.error || 'Order placement failed'
          })
        }

      } catch (error) {
        const errorMsg = `Error processing position ${position.positionId}: ${error.message}`
        console.error(`❌ ${errorMsg}`)
        results.errors.push(errorMsg)
        results.failed++
        results.details.push({
          positionId: position.positionId,
          symbol: position.symbol,
          userId: position.userId.email,
          status: 'FAILED',
          error: error.message
        })
      }

      // Add delay between orders to respect rate limits
      await new Promise(resolve => setTimeout(resolve, 500))
    }

    // Log final results
    console.log(`🚨 EMERGENCY SQUARE OFF COMPLETED for bot ${bot.name}:`)
    console.log(`📊 Total: ${results.totalPositions}, Success: ${results.successful}, Failed: ${results.failed}`)

    const message = results.failed === 0
      ? `Emergency square off completed successfully for ${bot.name}. All ${results.successful} positions closed.`
      : `Emergency square off completed for ${bot.name}. ${results.successful} positions closed, ${results.failed} failed. Check details for manual intervention required.`

    return NextResponse.json({
      success: true,
      message,
      botName: bot.name,
      results
    })

  } catch (error) {
    console.error('❌ Emergency square off error:', error)
    return NextResponse.json({
      error: 'Failed to execute emergency square off',
      details: error.message
    }, { status: 500 })
  }
}