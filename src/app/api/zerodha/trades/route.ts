import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import dbConnect from '@/lib/mongoose'
import User from '@/models/User'
import Trade from '@/models/Trade'
import { ZerodhaAPI } from '@/lib/zerodha'
import { getEffectiveUser } from '@/lib/impersonation-utils'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get effective user (handles impersonation)
    const { user, isImpersonating } = await getEffectiveUser()
    
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Get query parameters for filtering
    const { searchParams } = new URL(request.url)
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')
    const limit = parseInt(searchParams.get('limit') || '100')
    const source = searchParams.get('source') // 'database', 'live', or 'hybrid' (default)

    try {
      let trades = []
      let dataSource = 'database'

      if (source === 'live' || source === 'hybrid') {
        // Check if we have Zerodha credentials for live data
        if (user?.zerodhaConfig?.apiKey && user?.zerodhaConfig?.apiSecret && user?.zerodhaConfig?.accessToken) {
          try {
            const zerodhaAPI = new ZerodhaAPI(
              user.zerodhaConfig.apiKey,
              user.zerodhaConfig.apiSecret,
              user.zerodhaConfig.accessToken
            )

            // Fetch current day trades from Zerodha API
            const tradesResponse = await zerodhaAPI.getTrades()
            const liveTradesData = tradesResponse.data || []
            
            // Convert Zerodha format to our standard format
            const liveTrades = liveTradesData.map((trade: any) => ({
              trade_id: trade.trade_id,
              tradingsymbol: trade.tradingsymbol,
              exchange: trade.exchange,
              transaction_type: trade.transaction_type,
              quantity: Math.abs(trade.quantity),
              price: trade.average_price || trade.price || 0,
              trade_date: trade.trade_date || trade.fill_timestamp,
              order_id: trade.order_id,
              product: trade.product,
              dataSource: 'live'
            }))

            if (source === 'live') {
              trades = liveTrades
              dataSource = 'live'
            } else {
              // Hybrid: combine with database data
              const dbTrades = await getStoredTrades(user._id, startDate, endDate, limit)
              trades = [...liveTrades, ...dbTrades]
              dataSource = 'hybrid'
            }
          } catch (zerodhaError) {
            console.error('Zerodha API error, falling back to database:', zerodhaError)
            // Fall back to database if live API fails
            trades = await getStoredTrades(user._id, startDate, endDate, limit)
          }
        } else {
          // No credentials, use database
          trades = await getStoredTrades(user._id, startDate, endDate, limit)
        }
      } else {
        // Database only
        trades = await getStoredTrades(user._id, startDate, endDate, limit)
      }

      // Sort trades by date (newest first)
      trades.sort((a: any, b: any) => {
        const dateA = new Date(a.trade_date || a.timestamp)
        const dateB = new Date(b.trade_date || b.timestamp)
        return dateB.getTime() - dateA.getTime()
      })

      return NextResponse.json({
        success: true,
        trades: trades.slice(0, limit),
        total: trades.length,
        dataSource,
        hasMore: trades.length > limit,
        syncInfo: {
          lastSync: user.zerodhaConfig?.lastSync,
          totalStoredTrades: await Trade.countDocuments({ userId: user._id })
        }
      })

    } catch (error) {
      console.error('Error fetching trades:', error)
      
      return NextResponse.json({ 
        error: 'Failed to fetch trades. Please try again.' 
      }, { status: 400 })
    }
  } catch (error) {
    console.error('Error in trades endpoint:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// Helper function to get stored trades from database
async function getStoredTrades(userId: string, startDate?: string | null, endDate?: string | null, limit: number = 100) {
  const query: any = { userId }

  // Add date filtering if provided
  if (startDate || endDate) {
    query.timestamp = {}
    if (startDate) query.timestamp.$gte = new Date(startDate)
    if (endDate) query.timestamp.$lte = new Date(endDate + 'T23:59:59')
  }

  const dbTrades = await Trade.find(query)
    .sort({ timestamp: -1 })
    .limit(limit)
    .lean()

  // Convert database format to API format with bot information
  return dbTrades.map(trade => ({
    trade_id: trade.tradeId,
    tradingsymbol: trade.tradingSymbol,
    exchange: trade.exchange,
    transaction_type: trade.transactionType,
    quantity: trade.quantity,
    price: trade.price,
    trade_date: trade.timestamp.toISOString(),
    order_id: trade.orderId,
    product: trade.product,
    bot_id: trade.botId,
    bot_name: trade.botName || (trade.tradeSource === 'BOT' ? 'Unknown Bot' : 'Manual Trade'),
    trade_source: trade.tradeSource || 'Manual',
    dataSource: 'database'
  }))
}