import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import dbConnect from '@/lib/mongoose'
import User from '@/models/User'
import { ZerodhaAPI } from '@/lib/zerodha'

export async function GET(_request: NextRequest) {
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

      // Fetch trades from Zerodha
      const tradesResponse = await zerodhaAPI.getTrades()
      console.log('Trades API response:', tradesResponse)

      // Sort trades by date (newest first)
      const trades = tradesResponse.data || []
      trades.sort((a: Record<string, any>, b: Record<string, any>) => {
        const dateA = new Date(a.trade_date || a.fill_timestamp)
        const dateB = new Date(b.trade_date || b.fill_timestamp)
        return dateB.getTime() - dateA.getTime()
      })

      return NextResponse.json({
        success: true,
        trades: trades,
        total: trades.length
      })

    } catch (zerodhaError) {
      console.error('Zerodha API error:', zerodhaError)
      
      return NextResponse.json({ 
        error: 'Failed to fetch trades from Zerodha. Please check your connection.' 
      }, { status: 400 })
    }
  } catch (error) {
    console.error('Error fetching trades:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}