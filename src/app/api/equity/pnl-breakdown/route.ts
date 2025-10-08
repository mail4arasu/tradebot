import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import dbConnect from '@/lib/mongoose'
import User from '@/models/User'
import Position from '@/models/Position'
import Bot from '@/models/Bot'
import DailyPnLSnapshot from '@/models/DailyPnLSnapshot'
import { ZerodhaAPI } from '@/lib/zerodha'
import { getEffectiveUser } from '@/lib/impersonation-utils'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await dbConnect()
    
    // Get effective user (handles impersonation)
    const { user, isImpersonating } = await getEffectiveUser()
    
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const { searchParams } = new URL(request.url)
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')
    const botId = searchParams.get('botId') // Optional: filter by specific bot
    const includeRealtime = searchParams.get('realtime') === 'true'

    // Build date filter
    const dateFilter: any = {}
    if (startDate) dateFilter.$gte = startDate
    if (endDate) dateFilter.$lte = endDate

    const query: any = { userId: user._id }
    if (Object.keys(dateFilter).length > 0) {
      query.date = dateFilter
    }

    console.log(`Fetching P&L breakdown for user ${user.email}`, { query, botId, includeRealtime })

    // Get historical P&L snapshots
    const historicalData = await DailyPnLSnapshot.find(query)
      .sort({ date: -1 })
      .limit(365) // Max 1 year of data
      .lean()

    console.log(`Found ${historicalData.length} historical P&L snapshots`)

    // Get current real-time P&L if requested
    let realtimeData = null
    if (includeRealtime && user?.zerodhaConfig?.apiKey && user?.zerodhaConfig?.apiSecret && user?.zerodhaConfig?.accessToken) {
      try {
        const zerodhaAPI = new ZerodhaAPI(
          user.zerodhaConfig.apiKey,
          user.zerodhaConfig.apiSecret,
          user.zerodhaConfig.accessToken
        )

        const [portfolioData, botPositions] = await Promise.all([
          zerodhaAPI.getPortfolioData(),
          Position.find({ 
            userId: user._id, 
            status: { $in: ['OPEN', 'PARTIAL'] } 
          }).populate('botId', 'name').lean()
        ])

        // Calculate bot-specific P&L from current positions
        const botPnLMap = new Map()
        for (const position of botPositions) {
          const botName = position.botId?.name || 'Unknown Bot'
          const currentPnL = botPnLMap.get(botName) || { dayPnL: 0, totalPnL: 0, positions: 0 }
          
          currentPnL.dayPnL += position.unrealizedPnl || 0
          currentPnL.totalPnL += position.totalPnl || 0
          currentPnL.positions += 1
          
          botPnLMap.set(botName, currentPnL)
        }

        realtimeData = {
          date: new Date().toISOString().split('T')[0],
          totalDayPnL: portfolioData.data?.totalDayPnL || 0,
          totalPortfolioPnL: portfolioData.data?.totalPnL || 0,
          totalPortfolioValue: portfolioData.data?.totalCurrentValue || 0,
          totalInvestmentValue: portfolioData.data?.totalInvestmentValue || 0,
          botPerformance: Array.from(botPnLMap.entries()).map(([botName, pnl]) => ({
            botName,
            dayPnL: pnl.dayPnL,
            totalPnL: pnl.totalPnL,
            openPositions: pnl.positions
          })),
          isRealtime: true
        }

        console.log('Generated realtime P&L data:', realtimeData)
      } catch (zerodhaError) {
        console.error('Error fetching realtime P&L:', zerodhaError)
        // Continue without realtime data
      }
    }

    // Filter by bot if specified
    let filteredData = historicalData
    if (botId) {
      filteredData = historicalData.filter(snapshot => 
        snapshot.botPerformance.some(bot => bot.botId.toString() === botId)
      )
    }

    // Calculate summary statistics
    const totalDays = filteredData.length + (realtimeData ? 1 : 0)
    const profitableDays = filteredData.filter(d => d.totalDayPnL > 0).length + 
                          (realtimeData && realtimeData.totalDayPnL > 0 ? 1 : 0)
    
    const totalPnL = filteredData.reduce((sum, d) => sum + d.totalDayPnL, 0) + 
                    (realtimeData ? realtimeData.totalDayPnL : 0)

    // Get unique bots for filtering
    const allBots = await Bot.find({}).select('name description status').lean()
    const activeBots = [...new Set(filteredData.flatMap(d => 
      d.botPerformance.map(b => ({ id: b.botId, name: b.botName }))
    ))]

    // Combine historical and realtime data
    const combinedData = [...filteredData]
    if (realtimeData) {
      combinedData.unshift(realtimeData) // Add at beginning (most recent)
    }

    return NextResponse.json({
      success: true,
      data: {
        snapshots: combinedData,
        summary: {
          totalDays,
          profitableDays,
          winRate: totalDays > 0 ? Math.round((profitableDays / totalDays) * 100) : 0,
          totalPnL,
          averageDailyPnL: totalDays > 0 ? totalPnL / totalDays : 0,
          bestDay: Math.max(...combinedData.map(d => d.totalDayPnL), 0),
          worstDay: Math.min(...combinedData.map(d => d.totalDayPnL), 0)
        },
        availableBots: activeBots,
        allBots: allBots,
        filters: {
          startDate,
          endDate,
          botId,
          includeRealtime
        }
      }
    })

  } catch (error) {
    console.error('Error fetching P&L breakdown:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST endpoint to manually create a P&L snapshot
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await dbConnect()
    
    // Get effective user (handles impersonation)
    const { user, isImpersonating } = await getEffectiveUser()
    
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    if (!user?.zerodhaConfig?.apiKey || !user?.zerodhaConfig?.apiSecret || !user?.zerodhaConfig?.accessToken) {
      return NextResponse.json({ error: 'Zerodha not connected' }, { status: 400 })
    }

    const today = new Date().toISOString().split('T')[0]

    // Check if snapshot already exists for today
    const existingSnapshot = await DailyPnLSnapshot.findOne({
      userId: user._id,
      date: today
    })

    if (existingSnapshot) {
      return NextResponse.json({ 
        error: 'Snapshot already exists for today',
        existing: existingSnapshot
      }, { status: 409 })
    }

    try {
      const zerodhaAPI = new ZerodhaAPI(
        user.zerodhaConfig.apiKey,
        user.zerodhaConfig.apiSecret,
        user.zerodhaConfig.accessToken
      )

      // Fetch comprehensive data from Zerodha
      const [portfolioData, botPositions] = await Promise.all([
        zerodhaAPI.getPortfolioData(),
        Position.find({ 
          userId: user._id,
          status: { $in: ['OPEN', 'PARTIAL', 'CLOSED'] },
          createdAt: { 
            $gte: new Date(today + 'T00:00:00.000Z'),
            $lte: new Date(today + 'T23:59:59.999Z')
          }
        }).populate('botId', 'name').lean()
      ])

      const portfolio = portfolioData.data
      
      // Calculate bot-specific performance
      const botPerformance = []
      const botMap = new Map()

      for (const position of botPositions) {
        const botId = position.botId?._id?.toString() || 'manual'
        const botName = position.botId?.name || 'Manual Trading'
        
        if (!botMap.has(botId)) {
          botMap.set(botId, {
            botId: position.botId?._id,
            botName,
            dayPnL: 0,
            totalPnL: 0,
            openPositions: 0,
            closedPositions: 0,
            totalTrades: 0,
            allocatedAmount: 0
          })
        }

        const botStats = botMap.get(botId)
        botStats.dayPnL += position.unrealizedPnl || 0
        botStats.totalPnL += position.totalPnl || 0
        botStats.totalTrades += 1
        
        if (position.status === 'OPEN' || position.status === 'PARTIAL') {
          botStats.openPositions += 1
        } else {
          botStats.closedPositions += 1
        }
      }

      botPerformance.push(...Array.from(botMap.values()))

      // Create snapshot
      const snapshot = new DailyPnLSnapshot({
        userId: user._id,
        date: today,
        totalDayPnL: portfolio?.totalDayPnL || 0,
        totalPortfolioPnL: portfolio?.totalPnL || 0,
        totalPortfolioValue: portfolio?.totalCurrentValue || 0,
        totalInvestmentValue: portfolio?.totalInvestmentValue || 0,
        availableMargin: portfolio?.availableMargin || 0,
        usedMargin: portfolio?.usedMargin || 0,
        totalMargin: portfolio?.totalMargin || 0,
        botPerformance,
        positions: (portfolio?.positions?.data?.net || []).map((pos: any) => ({
          symbol: pos.tradingsymbol,
          exchange: pos.exchange,
          quantity: pos.quantity,
          averagePrice: pos.average_price,
          lastPrice: pos.last_price,
          dayPnL: pos.pnl,
          unrealizedPnL: pos.unrealised,
          realizedPnL: pos.realised
        })),
        holdings: (portfolio?.holdings?.data || []).map((holding: any) => ({
          symbol: holding.tradingsymbol,
          exchange: holding.exchange,
          quantity: holding.quantity,
          averagePrice: holding.average_price,
          lastPrice: holding.last_price,
          dayChange: holding.day_change,
          totalPnL: holding.pnl
        })),
        zerodhaSnapshot: portfolioData,
        snapshotTime: new Date(),
        dataSource: 'MANUAL'
      })

      await snapshot.save()

      console.log(`Created P&L snapshot for ${user.email} on ${today}`)

      return NextResponse.json({
        success: true,
        snapshot: snapshot.toObject(),
        message: `P&L snapshot created for ${today}`
      })

    } catch (zerodhaError) {
      console.error('Zerodha API error during snapshot creation:', zerodhaError)
      return NextResponse.json({ 
        error: 'Failed to fetch data from Zerodha',
        details: zerodhaError.message 
      }, { status: 400 })
    }

  } catch (error) {
    console.error('Error creating P&L snapshot:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}