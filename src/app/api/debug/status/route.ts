import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import dbConnect from '@/lib/mongoose'
import User from '@/models/User'

export async function GET(request: NextRequest) {
  try {
    console.log('=== Debug Status Check Started ===')
    
    const session = await getServerSession(authOptions)
    console.log('Session user email:', session?.user?.email)
    
    if (!session?.user?.email) {
      console.log('No authenticated user found')
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    await dbConnect()
    console.log('Database connected')

    // Find the actual user in the database
    const user = await User.findOne({ email: session.user.email })
    console.log('User found:', user ? 'Yes' : 'No')
    console.log('User name:', user?.name)
    console.log('User email:', user?.email)
    
    if (!user) {
      console.log('User document not found in database')
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const zerodhaConfig = user.zerodhaConfig

    // Determine detailed status based on actual user data
    let status = 'NOT_CONFIGURED'
    let message = 'No Zerodha integration found'
    let canTrade = false
    let needsAuth = false
    
    if (zerodhaConfig) {
      const hasApiKey = !!zerodhaConfig.apiKey
      const hasApiSecret = !!zerodhaConfig.apiSecret
      const hasAccessToken = !!zerodhaConfig.accessToken
      const isConnected = !!zerodhaConfig.isConnected

      if (hasApiKey && hasApiSecret) {
        if (hasAccessToken) {
          if (isConnected) {
            status = 'CONNECTED'
            message = 'Zerodha account is connected and ready for trading'
            canTrade = true
            needsAuth = false
          } else {
            status = 'TOKEN_EXPIRED'
            message = 'Your Zerodha access token may have expired. Please re-authorize.'
            canTrade = false
            needsAuth = true
          }
        } else {
          status = 'KEYS_STORED'
          message = 'API keys are configured but authorization is required.'
          canTrade = false
          needsAuth = true
        }
      } else {
        status = 'NOT_CONFIGURED'
        message = 'Zerodha API keys are not configured. Please set up your API credentials.'
        canTrade = false
        needsAuth = false
      }
    }

    const response = {
      success: true,
      user: {
        email: user.email,
        name: user.name || 'User',
        hasZerodhaConfig: !!zerodhaConfig,
        hasApiKey: !!zerodhaConfig?.apiKey,
        hasApiSecret: !!zerodhaConfig?.apiSecret,
        hasAccessToken: !!zerodhaConfig?.accessToken,
        isConnected: !!zerodhaConfig?.isConnected,
        balance: zerodhaConfig?.balance || 0,
        lastSync: zerodhaConfig?.lastSync
      },
      status: {
        status,
        message,
        canTrade,
        needsAuth
      }
    }

    console.log('Final response:', response)
    console.log('=== Debug Status Check Completed ===')
    return NextResponse.json(response)

  } catch (error: any) {
    console.error('Error checking user Zerodha status:', error)
    return NextResponse.json(
      { error: 'Failed to check status', details: error.message },
      { status: 500 }
    )
  }
}