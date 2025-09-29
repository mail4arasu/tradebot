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
      return NextResponse.json({ 
        error: 'API credentials not found. Please configure your Zerodha credentials first.',
        needsCredentials: true 
      }, { status: 400 })
    }

    // Use stored plain text credentials
    const apiKey = user.zerodhaConfig.apiKey
    const apiSecret = user.zerodhaConfig.apiSecret

    console.log('Quick refresh - generating auth URL for user:', session.user.email)
    
    // Generate the Zerodha OAuth URL using stored credentials
    const redirectUrl = process.env.NEXTAUTH_URL + '/api/zerodha/callback'
    const loginUrl = ZerodhaAPI.getLoginUrl(apiKey, redirectUrl)

    return NextResponse.json({ 
      loginUrl,
      message: 'Ready for token refresh. You will be redirected to Zerodha for authentication.' 
    })
  } catch (error) {
    console.error('Error in quick refresh:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}