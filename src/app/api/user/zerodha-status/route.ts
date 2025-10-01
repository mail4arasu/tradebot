import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import dbConnect from '@/lib/mongoose'
import User from '@/models/User'

export async function GET(request: NextRequest) {
  try {
    console.log('=== New Zerodha Status Check Started ===')
    
    const session = await getServerSession(authOptions)
    console.log('Session user email:', session?.user?.email)
    
    if (!session?.user?.email) {
      console.log('No authenticated user found')
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    await dbConnect()
    console.log('Database connected successfully')

    // Find the actual user in the database
    const user = await User.findOne({ email: session.user.email })
    console.log('User search result:')
    console.log('- Found user:', user ? 'YES' : 'NO')
    console.log('- User name from DB:', user?.name)
    console.log('- User email from DB:', user?.email)
    console.log('- Session email:', session.user.email)
    
    if (!user) {
      console.log('ERROR: User document not found in database')
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const zerodhaConfig = user.zerodhaConfig
    console.log('Zerodha config check:')
    console.log('- Config exists:', !!zerodhaConfig)
    console.log('- Has API key:', !!zerodhaConfig?.apiKey)
    console.log('- Has API secret:', !!zerodhaConfig?.apiSecret)
    console.log('- Has access token:', !!zerodhaConfig?.accessToken)
    console.log('- Is connected:', !!zerodhaConfig?.isConnected)

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

      console.log('Status determination logic:')
      console.log('- Has both API key and secret:', hasApiKey && hasApiSecret)
      console.log('- Has access token:', hasAccessToken)
      console.log('- Is connected:', isConnected)

      if (hasApiKey && hasApiSecret) {
        if (hasAccessToken) {
          if (isConnected) {
            status = 'CONNECTED'
            message = 'Zerodha account is connected and ready for trading'
            canTrade = true
            needsAuth = false
            console.log('Final status: FULLY CONNECTED')
          } else {
            status = 'TOKEN_EXPIRED'
            message = 'Your Zerodha access token may have expired. Please re-authorize.'
            canTrade = false
            needsAuth = true
            console.log('Final status: TOKEN EXPIRED')
          }
        } else {
          status = 'KEYS_STORED'
          message = 'API keys are configured but authorization is required.'
          canTrade = false
          needsAuth = true
          console.log('Final status: KEYS STORED, NEEDS AUTH')
        }
      } else {
        status = 'NOT_CONFIGURED'
        message = 'Zerodha API keys are not configured. Please set up your API credentials.'
        canTrade = false
        needsAuth = false
        console.log('Final status: NOT CONFIGURED')
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
      },
      debug: {
        timestamp: new Date().toISOString(),
        endpoint: '/api/user/zerodha-status',
        sessionEmail: session.user.email,
        userFromDB: user.email
      }
    }

    console.log('FINAL RESPONSE BEING SENT:')
    console.log(JSON.stringify(response, null, 2))
    console.log('=== New Zerodha Status Check Completed ===')
    
    return NextResponse.json(response)

  } catch (error: any) {
    console.error('ERROR in new Zerodha status check:', error)
    return NextResponse.json(
      { 
        error: 'Failed to check status', 
        details: error.message,
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    )
  }
}