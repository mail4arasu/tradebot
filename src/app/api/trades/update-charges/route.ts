import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import dbConnect from '@/lib/mongoose'
import User from '@/models/User'
import Trade from '@/models/Trade'
import { ZerodhaAPI } from '@/lib/zerodha'
import { 
  processTradeCharges, 
  calculateTradeFinancials, 
  updateTradeCharges,
  batchUpdateTradeCharges 
} from '@/utils/chargeProcessor'

export async function POST(request: NextRequest) {
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

    const body = await request.json()
    const { 
      tradeId, 
      startDate, 
      endDate, 
      forceUpdate = false,
      fetchFromZerodha = true 
    } = body

    if (tradeId) {
      // Update charges for a specific trade
      return await updateSingleTradeCharges(tradeId, user, fetchFromZerodha, forceUpdate)
    } else {
      // Batch update charges for a date range
      return await batchUpdateCharges(user, startDate, endDate, fetchFromZerodha, forceUpdate)
    }

  } catch (error) {
    console.error('Error updating trade charges:', error)
    return NextResponse.json(
      { error: 'Failed to update trade charges' },
      { status: 500 }
    )
  }
}

async function updateSingleTradeCharges(
  tradeId: string, 
  user: any, 
  fetchFromZerodha: boolean, 
  forceUpdate: boolean
) {
  try {
    const trade = await Trade.findById(tradeId)
    if (!trade) {
      return NextResponse.json({ error: 'Trade not found' }, { status: 404 })
    }

    if (trade.userId.toString() !== user._id.toString()) {
      return NextResponse.json({ error: 'Unauthorized access to trade' }, { status: 403 })
    }

    // Check if charges already exist and forceUpdate is false
    if (!forceUpdate && trade.charges?.totalCharges && trade.chargesLastUpdated) {
      return NextResponse.json({
        success: true,
        message: 'Charges already exist. Use forceUpdate=true to override.',
        trade: trade,
        updated: false
      })
    }

    let zerodhaCharges = null

    // Fetch latest charges from Zerodha if requested and credentials available
    if (fetchFromZerodha && user.zerodhaConfig?.apiKey && user.zerodhaConfig?.accessToken) {
      try {
        const zerodhaAPI = new ZerodhaAPI(
          user.zerodhaConfig.apiKey,
          user.zerodhaConfig.apiSecret,
          user.zerodhaConfig.accessToken
        )

        // Try to get updated trade data from Zerodha
        const tradesResponse = await zerodhaAPI.getTrades()
        const zerodhaTradeData = tradesResponse.data?.find((t: any) => 
          t.trade_id === trade.tradeId || 
          t.order_id === trade.orderId
        )

        if (zerodhaTradeData && zerodhaTradeData.charges) {
          zerodhaCharges = zerodhaTradeData.charges
          console.log('✅ Found Zerodha charges for trade:', trade.tradeId)
        }
      } catch (zerodhaError) {
        console.error('⚠️ Error fetching from Zerodha, using calculation fallback:', zerodhaError)
      }
    }

    // Process charges (real or calculated)
    const charges = processTradeCharges(trade, zerodhaCharges)
    const financials = calculateTradeFinancials(trade, charges)

    // Update trade in database
    const updatedTrade = await updateTradeCharges(trade._id.toString(), charges, financials)

    return NextResponse.json({
      success: true,
      message: 'Trade charges updated successfully',
      trade: updatedTrade,
      updated: true,
      chargeSource: zerodhaCharges ? 'zerodha' : 'calculated'
    })

  } catch (error) {
    console.error('Error updating single trade charges:', error)
    throw error
  }
}

async function batchUpdateCharges(
  user: any, 
  startDate?: string, 
  endDate?: string, 
  fetchFromZerodha: boolean = true,
  forceUpdate: boolean = false
) {
  try {
    const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // Last 30 days
    const end = endDate ? new Date(endDate) : new Date()

    console.log(`🔄 Starting batch update for user ${user.email} from ${start.toISOString()} to ${end.toISOString()}`)

    // Get all trades in the date range
    const query: any = { 
      userId: user._id,
      timestamp: { $gte: start, $lte: end }
    }

    // If not forcing update, only get trades without charges
    if (!forceUpdate) {
      query.$or = [
        { 'charges.totalCharges': { $exists: false } },
        { 'charges.totalCharges': 0 },
        { chargesLastUpdated: { $exists: false } }
      ]
    }

    const trades = await Trade.find(query).sort({ timestamp: 1 })
    console.log(`📊 Found ${trades.length} trades to process`)

    if (trades.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No trades found requiring charge updates',
        updated: 0,
        errors: 0,
        total: 0
      })
    }

    let zerodhaTradesMap = new Map()

    // Fetch latest charges from Zerodha if requested
    if (fetchFromZerodha && user.zerodhaConfig?.apiKey && user.zerodhaConfig?.accessToken) {
      try {
        const zerodhaAPI = new ZerodhaAPI(
          user.zerodhaConfig.apiKey,
          user.zerodhaConfig.apiSecret,
          user.zerodhaConfig.accessToken
        )

        console.log('📡 Fetching latest trade data from Zerodha...')
        const tradesResponse = await zerodhaAPI.getTrades()
        const zerodhaTradesData = tradesResponse.data || []

        // Create a map for quick lookup
        zerodhaTradesData.forEach((trade: any) => {
          if (trade.charges) {
            zerodhaTradesMap.set(trade.trade_id, trade.charges)
            if (trade.order_id) {
              zerodhaTradesMap.set(trade.order_id, trade.charges)
            }
          }
        })

        console.log(`💰 Found charges for ${zerodhaTradesMap.size} trades from Zerodha`)
      } catch (zerodhaError) {
        console.error('⚠️ Error fetching from Zerodha, using calculation fallback for all trades:', zerodhaError)
      }
    }

    // Process each trade
    let updated = 0
    let errors = 0
    const results = []

    for (const trade of trades) {
      try {
        // Get Zerodha charges if available
        const zerodhaCharges = zerodhaTradesMap.get(trade.tradeId) || 
                             zerodhaTradesMap.get(trade.orderId) || 
                             null

        // Process charges
        const charges = processTradeCharges(trade, zerodhaCharges)
        const financials = calculateTradeFinancials(trade, charges)

        // Update trade
        await updateTradeCharges(trade._id.toString(), charges, financials)
        
        results.push({
          tradeId: trade._id.toString(),
          symbol: trade.tradingSymbol,
          chargeSource: zerodhaCharges ? 'zerodha' : 'calculated',
          totalCharges: charges.totalCharges,
          success: true
        })
        
        updated++
      } catch (error) {
        console.error(`❌ Error processing trade ${trade._id}:`, error)
        results.push({
          tradeId: trade._id.toString(),
          symbol: trade.tradingSymbol,
          error: error.message,
          success: false
        })
        errors++
      }
    }

    console.log(`✅ Batch update complete: ${updated} updated, ${errors} errors out of ${trades.length} trades`)

    return NextResponse.json({
      success: true,
      message: `Batch update completed: ${updated} trades updated, ${errors} errors`,
      updated,
      errors,
      total: trades.length,
      results: results.slice(0, 50), // Limit response size
      zerodhaChargesFound: zerodhaTradesMap.size,
      dateRange: { start: start.toISOString(), end: end.toISOString() }
    })

  } catch (error) {
    console.error('Error in batch update:', error)
    throw error
  }
}

// GET endpoint for charge update status
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

    const { searchParams } = new URL(request.url)
    const days = parseInt(searchParams.get('days') || '30')
    
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    
    // Get charge update statistics
    const stats = await Trade.aggregate([
      {
        $match: {
          userId: user._id,
          timestamp: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: null,
          totalTrades: { $sum: 1 },
          tradesWithCharges: {
            $sum: {
              $cond: [
                { $and: [
                  { $exists: ['$charges.totalCharges'] },
                  { $gt: ['$charges.totalCharges', 0] }
                ]},
                1,
                0
              ]
            }
          },
          tradesWithZerodhaCharges: {
            $sum: {
              $cond: [
                { $exists: ['$zerodhaData.charges'] },
                1,
                0
              ]
            }
          },
          lastChargeUpdate: { $max: '$chargesLastUpdated' },
          totalCharges: { $sum: '$charges.totalCharges' },
          totalTurnover: { $sum: '$turnover' }
        }
      }
    ])

    const result = stats[0] || {
      totalTrades: 0,
      tradesWithCharges: 0,
      tradesWithZerodhaCharges: 0,
      lastChargeUpdate: null,
      totalCharges: 0,
      totalTurnover: 0
    }

    return NextResponse.json({
      success: true,
      stats: {
        ...result,
        chargesCoverage: result.totalTrades > 0 ? (result.tradesWithCharges / result.totalTrades * 100).toFixed(1) + '%' : '0%',
        zerodhaDataCoverage: result.totalTrades > 0 ? (result.tradesWithZerodhaCharges / result.totalTrades * 100).toFixed(1) + '%' : '0%',
        avgChargesPerTrade: result.tradesWithCharges > 0 ? (result.totalCharges / result.tradesWithCharges).toFixed(2) : 0,
        dateRange: `Last ${days} days`
      }
    })

  } catch (error) {
    console.error('Error fetching charge update status:', error)
    return NextResponse.json(
      { error: 'Failed to fetch charge update status' },
      { status: 500 }
    )
  }
}