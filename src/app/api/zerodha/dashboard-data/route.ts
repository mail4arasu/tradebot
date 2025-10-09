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
        trades: []
      }, { status: 400 })
    }

    try {
      const zerodhaAPI = new ZerodhaAPI(
        user.zerodhaConfig.apiKey,
        user.zerodhaConfig.apiSecret,
        user.zerodhaConfig.accessToken
      )

      // Fetch comprehensive portfolio data including fresh balance
      const [portfolioData, trades, margins] = await Promise.all([
        zerodhaAPI.getPortfolioData(),
        zerodhaAPI.getTrades(),
        zerodhaAPI.getMargins() // Fetch fresh balance
      ])

      console.log('Fetched portfolio data for dashboard:', portfolioData)


      // Extract portfolio data
      const portfolio = portfolioData.data || {}
      
      // Get fresh balance from margins API
      let currentBalance = user.zerodhaConfig.balance || 0
      let availableMargin = 0
      
      console.log(`📊 Processing dashboard data for user: ${user.email}`)
      console.log(`📊 Margins API response:`, JSON.stringify(margins, null, 2))
      
      if (margins && margins.data && margins.data.equity && margins.data.equity.available) {
        currentBalance = margins.data.equity.available.cash || 0
        availableMargin = margins.data.equity.available.adhoc_margin || margins.data.equity.available.net || 0
        
        console.log(`💰 Extracted balance: ₹${currentBalance}`)
        console.log(`💰 Extracted margin: ₹${availableMargin}`)
        
        // Update database with fresh balance
        await User.findByIdAndUpdate(user._id, {
          'zerodhaConfig.balance': currentBalance,
          'zerodhaConfig.lastSync': new Date()
        })
      } else {
        console.log(`❌ No valid margins data found for user: ${user.email}`)
        console.log(`❌ Margins response structure:`, margins)
      }

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
        availableMargin: availableMargin || portfolio.availableMargin || 0,
        usedMargin: portfolio.usedMargin || 0,
        totalMargin: portfolio.totalMargin || 0,
        marginUtilization: portfolio.marginUtilization || 0,
        
        // Trading Data
        totalTrades: trades.data?.length || 0,
        
        // Holdings and Positions count
        holdingsCount: portfolio.holdings?.data?.length || 0,
        positionsCount: (portfolio.positions?.data?.net?.length || 0) + (portfolio.positions?.data?.day?.length || 0)
      })

    } catch (zerodhaError) {
      console.error('Zerodha API error:', zerodhaError)
      return NextResponse.json({ 
        error: 'Failed to fetch trading data',
        trades: []
      }, { status: 400 })
    }
  } catch (error) {
    console.error('Error fetching dashboard data:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}