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
    // Check for duplicates by both orderId and tradeId
    
    let duplicatesRemovedCount = 0
    
    // Check for duplicates by tradeId (what users see in the UI)
    const duplicatesByTradeId = await Trade.aggregate([
      { $match: { userId: user._id, tradeId: { $exists: true, $ne: null } } },
      { 
        $group: { 
          _id: "$tradeId", 
          trades: { $push: "$$ROOT" }, 
          count: { $sum: 1 } 
        } 
      },
      { $match: { count: { $gt: 1 } } }
    ])

    console.log(`Found ${duplicatesByTradeId.length} sets of duplicate trades by tradeId`)

    for (const duplicateGroup of duplicatesByTradeId) {
      const trades = duplicateGroup.trades
      console.log(`Processing tradeId ${duplicateGroup._id} with ${trades.length} duplicates`)
      
      // Keep the trade with the highest price (most likely correct) and most recent timestamp
      const bestTrade = trades.reduce((best, current) => {
        if (current.price > best.price) return current
        if (current.price === best.price && new Date(current.timestamp) > new Date(best.timestamp)) return current
        return best
      })

      console.log(`Keeping trade with price ${bestTrade.price} (${bestTrade._id})`)

      // Delete the other duplicates
      for (const trade of trades) {
        if (trade._id.toString() !== bestTrade._id.toString()) {
          await Trade.findByIdAndDelete(trade._id)
          duplicatesRemovedCount++
          console.log(`Removed duplicate trade ${trade.tradeId} (orderId: ${trade.orderId}, price: ${trade.price})`)
        }
      }
    }

    // Also check for duplicates by orderId (backup check)
    const duplicatesByOrderId = await Trade.aggregate([
      { $match: { userId: user._id, orderId: { $exists: true, $ne: null } } },
      { 
        $group: { 
          _id: "$orderId", 
          trades: { $push: "$$ROOT" }, 
          count: { $sum: 1 } 
        } 
      },
      { $match: { count: { $gt: 1 } } }
    ])

    console.log(`Found ${duplicatesByOrderId.length} sets of duplicate trades by orderId`)

    for (const duplicateGroup of duplicatesByOrderId) {
      const trades = duplicateGroup.trades
      console.log(`Processing orderId ${duplicateGroup._id} with ${trades.length} duplicates`)
      
      // Keep the trade with the highest price (most likely correct) and most recent timestamp
      const bestTrade = trades.reduce((best, current) => {
        if (current.price > best.price) return current
        if (current.price === best.price && new Date(current.timestamp) > new Date(best.timestamp)) return current
        return best
      })

      console.log(`Keeping trade with price ${bestTrade.price} (${bestTrade._id})`)

      // Delete the other duplicates
      for (const trade of trades) {
        if (trade._id.toString() !== bestTrade._id.toString()) {
          await Trade.findByIdAndDelete(trade._id)
          duplicatesRemovedCount++
          console.log(`Removed duplicate trade ${trade.tradeId} (orderId: ${trade.orderId}, price: ${trade.price})`)
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
      message: `Successfully removed ${duplicatesRemovedCount} duplicate trades (checked both tradeId and orderId) and fixed ${fixedCount} trade prices, skipped ${skippedCount} trades without valid prices`
    })

  } catch (error) {
    console.error('Error fixing trade prices:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}