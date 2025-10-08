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

    console.log(`Starting price fix for user ${user.email}`)

    // Find trades with price 0 or null that have zerodhaData
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
        totalFound: tradesWithZeroPrices.length,
        fixed: fixedCount,
        skipped: skippedCount,
        errors: errors.length
      },
      errors: errors.length > 0 ? errors : undefined,
      message: `Successfully fixed ${fixedCount} trade prices, skipped ${skippedCount} trades without valid prices`
    })

  } catch (error) {
    console.error('Error fixing trade prices:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}