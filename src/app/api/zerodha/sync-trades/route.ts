import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import dbConnect from '@/lib/mongoose'
import User from '@/models/User'
import Trade from '@/models/Trade'
import { ZerodhaAPI } from '@/lib/zerodha'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await dbConnect()
    
    const user = await User.findOne({ email: session.user.email })
    
    if (!user?.zerodhaConfig?.apiKey || !user?.zerodhaConfig?.apiSecret) {
      return NextResponse.json({ error: 'Zerodha credentials not found' }, { status: 400 })
    }

    if (!user?.zerodhaConfig?.accessToken) {
      return NextResponse.json({ 
        error: 'Access token not found. Please complete OAuth authorization first.',
        needsAuth: true 
      }, { status: 400 })
    }

    try {
      const zerodhaAPI = new ZerodhaAPI(
        user.zerodhaConfig.apiKey,
        user.zerodhaConfig.apiSecret,
        user.zerodhaConfig.accessToken
      )

      // Fetch both current day trades and recent historical trades
      console.log(`Starting trade sync for user ${user.email}`)
      
      // Get current day trades
      const currentTradesResponse = await zerodhaAPI.getTrades()
      const currentTrades = currentTradesResponse.data || []
      
      // Get historical trades from last 30 days
      const thirtyDaysAgo = new Date()
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
      const fromDate = thirtyDaysAgo.toISOString().split('T')[0]
      const toDate = new Date().toISOString().split('T')[0]
      
      console.log(`Fetching historical trades from ${fromDate} to ${toDate}`)
      const historicalTradesResponse = await zerodhaAPI.getHistoricalTrades(fromDate, toDate)
      const historicalTrades = historicalTradesResponse.data || []
      
      // Combine both current and historical trades, removing duplicates
      const allTrades = [...currentTrades]
      
      // Add historical trades that don't exist in current trades
      for (const historicalTrade of historicalTrades) {
        const existsInCurrent = currentTrades.find(ct => ct.order_id === historicalTrade.order_id)
        if (!existsInCurrent) {
          allTrades.push(historicalTrade)
        }
      }
      
      const zerodhaTradesData = allTrades
      console.log(`Syncing ${zerodhaTradesData.length} trades (${currentTrades.length} current + ${historicalTrades.length} historical) for user ${user.email}`)

      let syncedCount = 0
      let skippedCount = 0
      const errors: string[] = []

      for (const zerodhaTradeData of zerodhaTradesData) {
        try {
          // Check if trade already exists (by Zerodha trade_id)
          const existingTrade = await Trade.findOne({
            userId: user._id,
            tradeId: zerodhaTradeData.trade_id
          })

          if (existingTrade) {
            // Update existing trade with latest data and fix price if needed
            existingTrade.price = zerodhaTradeData.average_price || zerodhaTradeData.price || existingTrade.price
            existingTrade.zerodhaData = zerodhaTradeData
            existingTrade.lastSyncCheck = new Date()
            await existingTrade.save()
            skippedCount++
            continue
          }

          // Create new trade record
          const newTrade = new Trade({
            userId: user._id,
            tradingSymbol: zerodhaTradeData.tradingsymbol,
            exchange: zerodhaTradeData.exchange,
            instrumentToken: zerodhaTradeData.instrument_token,
            quantity: Math.abs(zerodhaTradeData.quantity), // Store as positive number
            price: zerodhaTradeData.average_price || zerodhaTradeData.price || 0,
            product: zerodhaTradeData.product,
            orderType: zerodhaTradeData.order_type || 'MARKET',
            transactionType: zerodhaTradeData.transaction_type,
            timestamp: new Date(zerodhaTradeData.trade_date || zerodhaTradeData.fill_timestamp),
            orderId: zerodhaTradeData.order_id,
            tradeSource: 'MANUAL', // Default to manual, can be updated if from bot
            
            // Zerodha specific fields
            tradeId: zerodhaTradeData.trade_id,
            fees: 0, // Zerodha doesn't provide this in trades API
            
            // Sync tracking
            syncedAt: new Date(),
            lastSyncCheck: new Date(),
            zerodhaData: zerodhaTradeData
          })

          await newTrade.save()
          syncedCount++
          
        } catch (tradeError) {
          console.error(`Error syncing trade ${zerodhaTradeData.trade_id}:`, tradeError)
          errors.push(`Trade ${zerodhaTradeData.trade_id}: ${tradeError.message}`)
        }
      }

      // Update user's last sync time
      user.zerodhaConfig.lastSync = new Date()
      await user.save()

      return NextResponse.json({
        success: true,
        summary: {
          totalFromZerodha: zerodhaTradesData.length,
          synced: syncedCount,
          skipped: skippedCount,
          errors: errors.length
        },
        errors: errors.length > 0 ? errors : undefined,
        message: `Successfully synced ${syncedCount} new trades, skipped ${skippedCount} existing trades`
      })

    } catch (zerodhaError) {
      console.error('Zerodha API error during sync:', zerodhaError)
      
      return NextResponse.json({ 
        error: 'Failed to sync trades from Zerodha. Please check your connection.',
        details: zerodhaError.message 
      }, { status: 400 })
    }
  } catch (error) {
    console.error('Error syncing trades:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// GET endpoint to check sync status
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await dbConnect()
    
    const user = await User.findOne({ email: session.user.email })
    
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Get sync statistics
    const totalTrades = await Trade.countDocuments({ userId: user._id })
    const todayTrades = await Trade.countDocuments({
      userId: user._id,
      timestamp: {
        $gte: new Date(new Date().setHours(0, 0, 0, 0)),
        $lte: new Date(new Date().setHours(23, 59, 59, 999))
      }
    })

    const lastSyncedTrade = await Trade.findOne(
      { userId: user._id },
      {},
      { sort: { syncedAt: -1 } }
    )

    return NextResponse.json({
      success: true,
      syncStatus: {
        lastSync: user.zerodhaConfig?.lastSync,
        totalStoredTrades: totalTrades,
        todayTrades: todayTrades,
        lastSyncedTrade: lastSyncedTrade ? {
          tradeId: lastSyncedTrade.tradeId,
          timestamp: lastSyncedTrade.timestamp,
          syncedAt: lastSyncedTrade.syncedAt
        } : null
      }
    })

  } catch (error) {
    console.error('Error getting sync status:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}