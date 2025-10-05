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

      // Fetch comprehensive portfolio data
      const [portfolioData, trades] = await Promise.all([
        zerodhaAPI.getPortfolioData(),
        zerodhaAPI.getTrades()
      ])

      console.log('Fetched portfolio data for dashboard:', portfolioData)

      // Calculate monthly P&L from trades
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

      // Extract portfolio data
      const portfolio = portfolioData.data || {}
      const currentBalance = user.zerodhaConfig.balance || 0

      return NextResponse.json({
        success: true,
        // Current balance
        balance: currentBalance,
        
        // Portfolio Summary
        portfolioValue: portfolio.totalCurrentValue || 0,
        totalInvestmentValue: portfolio.totalInvestmentValue || 0,
        totalPnL: portfolio.totalPnL || 0,
        totalPnLPercentage: portfolio.totalPnLPercentage || 0,
        dayPnL: portfolio.totalDayPnL || 0,
        
        // Margin Information
        availableMargin: portfolio.availableMargin || 0,
        usedMargin: portfolio.usedMargin || 0,
        totalMargin: portfolio.totalMargin || 0,
        marginUtilization: portfolio.marginUtilization || 0,
        
        // Trading Data
        monthlyPnL: Math.round(monthlyPnL * 100) / 100,
        pnlPercentage: currentBalance > 0 ? Math.round((monthlyPnL / currentBalance) * 10000) / 100 : 0,
        monthlyTrades,
        totalTrades: trades.data?.length || 0,
        
        // Holdings and Positions count
        holdingsCount: portfolio.holdings?.data?.length || 0,
        positionsCount: (portfolio.positions?.data?.net?.length || 0) + (portfolio.positions?.data?.day?.length || 0)
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