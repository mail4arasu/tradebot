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
        data: []
      }, { status: 400 })
    }

    try {
      const zerodhaAPI = new ZerodhaAPI(
        user.zerodhaConfig.apiKey,
        user.zerodhaConfig.apiSecret,
        user.zerodhaConfig.accessToken
      )

      const holdings = await zerodhaAPI.getHoldings()
      
      return NextResponse.json({
        success: true,
        data: holdings.data || []
      })

    } catch (zerodhaError) {
      console.error('Zerodha API error:', zerodhaError)
      return NextResponse.json({ 
        error: 'Failed to fetch holdings data',
        data: []
      }, { status: 400 })
    }
  } catch (error) {
    console.error('Error fetching holdings:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}