import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import dbConnect from '@/lib/mongoose'
import User from '@/models/User'
import { ZerodhaAPI } from '@/lib/zerodha'
import { getEffectiveUser } from '@/lib/impersonation-utils'

export async function GET(_request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get effective user (handles impersonation)
    const { user, isImpersonating } = await getEffectiveUser()
    
    if (!user?.zerodhaConfig?.apiKey || !user?.zerodhaConfig?.apiSecret || !user?.zerodhaConfig?.accessToken) {
      return NextResponse.json({ 
        error: 'Zerodha not connected',
        monthlyPnL: 0,
        pnlPercentage: 0,
        trades: []
      }, { status: 400 })
    }

    try {
      const zerodhaAPI = new ZerodhaAPI(
        user.zerodhaConfig.apiKey,
        user.zerodhaConfig.apiSecret,
        user.zerodhaConfig.accessToken
      )

      // Fetch trades from current month
      const trades = await zerodhaAPI.getTrades()
      console.log('Fetched trades for dashboard:', trades)

      // Calculate monthly P&L
      const currentMonth = new Date().getMonth()
      const currentYear = new Date().getFullYear()
      
      let monthlyPnL = 0
      let monthlyTrades = 0
      
      if (trades.data && Array.isArray(trades.data)) {
        trades.data.forEach((trade: Record<string, any>) => {
          const tradeDate = new Date(trade.trade_date || trade.fill_timestamp)
          if (tradeDate.getMonth() === currentMonth && tradeDate.getFullYear() === currentYear) {
            // Calculate P&L for this trade
            // For sell trades, profit = sell_value - (buy_value + charges)
            // This is a simplified calculation - Zerodha provides more detailed P&L in positions
            if (trade.transaction_type === 'SELL') {
              monthlyPnL += (trade.price * trade.quantity) - (trade.average_price * trade.quantity)
            }
            monthlyTrades++
          }
        })
      }

      // Calculate percentage (simplified - based on current balance)
      const currentBalance = user.zerodhaConfig.balance || 0
      const pnlPercentage = currentBalance > 0 ? (monthlyPnL / currentBalance) * 100 : 0

      return NextResponse.json({
        success: true,
        monthlyPnL: Math.round(monthlyPnL * 100) / 100, // Round to 2 decimal places
        pnlPercentage: Math.round(pnlPercentage * 100) / 100,
        monthlyTrades,
        totalTrades: trades.data?.length || 0
      })

    } catch (zerodhaError) {
      console.error('Zerodha API error:', zerodhaError)
      return NextResponse.json({ 
        error: 'Failed to fetch trading data',
        monthlyPnL: 0,
        pnlPercentage: 0,
        trades: []
      }, { status: 400 })
    }
  } catch (error) {
    console.error('Error fetching dashboard data:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}