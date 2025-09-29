import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import dbConnect from '@/lib/mongoose'
import User from '@/models/User'
import { ZerodhaAPI } from '@/lib/zerodha'

export async function POST(_request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await dbConnect()
    
    const user = await User.findOne({ email: session.user.email })
    
    if (!user?.zerodhaConfig?.apiKey || !user?.zerodhaConfig?.apiSecret || !user?.zerodhaConfig?.accessToken) {
      return NextResponse.json({ 
        error: 'Zerodha not connected. Please connect your Zerodha account first.',
        isConnected: false
      }, { status: 400 })
    }

    try {
      // Initialize Zerodha API client
      const zerodhaAPI = new ZerodhaAPI(
        user.zerodhaConfig.apiKey,
        user.zerodhaConfig.apiSecret,
        user.zerodhaConfig.accessToken
      )

      // Fetch current balance from Zerodha
      const margins = await zerodhaAPI.getMargins()
      console.log('Synced margins for user:', session.user.email, margins)
      
      let balance = 0
      if (margins && margins.data && margins.data.equity && margins.data.equity.available) {
        balance = margins.data.equity.available.cash || 0
      }

      // Update user balance in database
      await User.findByIdAndUpdate(user._id, {
        'zerodhaConfig.balance': balance,
        'zerodhaConfig.lastSync': new Date()
      })

      return NextResponse.json({
        success: true,
        balance: balance,
        message: 'Balance synced successfully',
        lastSync: new Date()
      })

    } catch (zerodhaError) {
      console.error('Zerodha API error during balance sync:', zerodhaError)
      return NextResponse.json({ 
        error: 'Failed to sync balance from Zerodha. Please check your connection.',
        details: zerodhaError instanceof Error ? zerodhaError.message : 'Unknown error'
      }, { status: 400 })
    }
  } catch (error) {
    console.error('Error syncing balance:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}