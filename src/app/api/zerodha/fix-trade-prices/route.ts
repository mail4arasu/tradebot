import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import dbConnect from '@/lib/mongoose'
import User from '@/models/User'
import Trade from '@/models/Trade'
import { getEffectiveUser } from '@/lib/impersonation-utils'

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

    console.log(`Starting price fix and duplicate removal for user ${user.email}`)

    // STEP 1: Remove duplicate trades
    // Find all trades grouped by orderId
    const duplicateTrades = await Trade.aggregate([
      { $match: { userId: user._id } },
      { 
        $group: { 
          _id: "$orderId", 
          trades: { $push: "$$ROOT" }, 
          count: { $sum: 1 } 
        } 
      },
      { $match: { count: { $gt: 1 } } }
    ])

    let duplicatesRemovedCount = 0
    console.log(`Found ${duplicateTrades.length} sets of duplicate trades`)

    for (const duplicateGroup of duplicateTrades) {
      const trades = duplicateGroup.trades
      // Keep the trade with the highest price (most likely correct) and most recent timestamp
      const bestTrade = trades.reduce((best, current) => {
        if (current.price > best.price) return current
        if (current.price === best.price && new Date(current.timestamp) > new Date(best.timestamp)) return current
        return best
      })

      // Delete the other duplicates
      for (const trade of trades) {
        if (trade._id.toString() !== bestTrade._id.toString()) {
          await Trade.findByIdAndDelete(trade._id)
          duplicatesRemovedCount++
          console.log(`Removed duplicate trade ${trade.tradeId} (orderId: ${trade.orderId})`)
        }
      }
    }

    // STEP 2: Fix trades with price 0 or null that have zerodhaData
    const tradesWithZeroPrices = await Trade.find({
      userId: user._id,
      $or: [
        { price: 0 },
        { price: null },
        { price: { $exists: false } }
      ],
      zerodhaData: { $exists: true, $ne: null }
    })

    console.log(`Found ${tradesWithZeroPrices.length} trades with zero/null prices`)

    let fixedCount = 0
    let skippedCount = 0
    const errors: string[] = []

    for (const trade of tradesWithZeroPrices) {
      try {
        const zerodhaData = trade.zerodhaData
        const correctPrice = zerodhaData.average_price || zerodhaData.price

        if (correctPrice && correctPrice > 0) {
          trade.price = correctPrice
          await trade.save()
          fixedCount++
          console.log(`Fixed trade ${trade.tradeId}: ${trade.price} -> ${correctPrice}`)
        } else {
          skippedCount++
          console.log(`Skipped trade ${trade.tradeId}: no valid price in zerodhaData`)
        }
      } catch (error) {
        console.error(`Error fixing trade ${trade.tradeId}:`, error)
        errors.push(`Trade ${trade.tradeId}: ${error.message}`)
      }
    }

    return NextResponse.json({
      success: true,
      summary: {
        duplicatesRemoved: duplicatesRemovedCount,
        totalFound: tradesWithZeroPrices.length,
        fixed: fixedCount,
        skipped: skippedCount,
        errors: errors.length
      },
      errors: errors.length > 0 ? errors : undefined,
      message: `Successfully removed ${duplicatesRemovedCount} duplicate trades and fixed ${fixedCount} trade prices, skipped ${skippedCount} trades without valid prices`
    })

  } catch (error) {
    console.error('Error fixing trade prices:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}