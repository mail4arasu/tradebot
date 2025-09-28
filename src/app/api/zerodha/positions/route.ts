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

      // Fetch positions from Zerodha
      const positionsResponse = await zerodhaAPI.getPositions()
      console.log('Positions API response:', positionsResponse)

      // The response contains both net and day positions
      const positions = positionsResponse.data || {}
      const netPositions = positions.net || []
      const dayPositions = positions.day || []

      // Filter only positions with non-zero quantity
      const activeNetPositions = netPositions.filter((pos: any) => pos.quantity !== 0)
      const activeDayPositions = dayPositions.filter((pos: any) => pos.quantity !== 0)

      return NextResponse.json({
        success: true,
        positions: {
          net: activeNetPositions,
          day: activeDayPositions
        },
        totalNet: activeNetPositions.length,
        totalDay: activeDayPositions.length
      })

    } catch (zerodhaError) {
      console.error('Zerodha API error:', zerodhaError)
      
      return NextResponse.json({ 
        error: 'Failed to fetch positions from Zerodha. Please check your connection.' 
      }, { status: 400 })
    }
  } catch (error) {
    console.error('Error fetching positions:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}