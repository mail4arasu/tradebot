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

      // Test connection by fetching user profile
      const profile = await zerodhaAPI.getProfile()
      const margins = await zerodhaAPI.getMargins()

      console.log('Zerodha profile:', profile)
      console.log('Zerodha margins:', JSON.stringify(margins, null, 2))
      
      const balance = margins.equity?.available?.cash || margins.data?.equity?.available?.cash || 0
      console.log('Extracted balance:', balance)

      // Update user with connection status and balance
      await User.findOneAndUpdate(
        { email: session.user.email },
        {
          $set: {
            'zerodhaConfig.isConnected': true,
            'zerodhaConfig.balance': balance,
            'zerodhaConfig.lastSync': new Date()
          }
        }
      )

      return NextResponse.json({
        success: true,
        message: 'Connection successful',
        balance: balance,
        profile: {
          user_name: profile.user_name,
          user_id: profile.user_id,
          broker: profile.broker
        }
      })
    } catch (zerodhaError) {
      console.error('Zerodha API error:', zerodhaError)
      
      // Mark as disconnected
      await User.findOneAndUpdate(
        { email: session.user.email },
        {
          $set: {
            'zerodhaConfig.isConnected': false
          }
        }
      )

      return NextResponse.json({ 
        error: 'Failed to connect to Zerodha. Please check your credentials.' 
      }, { status: 400 })
    }
  } catch (error) {
    console.error('Error testing Zerodha connection:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}