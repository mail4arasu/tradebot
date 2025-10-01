import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import dbConnect from '@/lib/mongoose'
import User from '@/models/User'

export async function GET(request: NextRequest) {
  try {
    console.log('=== User Test API Called ===')
    
    const session = await getServerSession(authOptions)
    console.log('Session:', session?.user?.email || 'No session')
    
    if (!session?.user?.email) {
      return NextResponse.json({ 
        error: 'Not authenticated',
        timestamp: new Date().toISOString()
      }, { status: 401 })
    }

    await dbConnect()
    console.log('Connected to database')

    // Find user using email from session
    const user = await User.findOne({ email: session.user.email })
    
    console.log('Database query result:')
    console.log('- User found:', !!user)
    console.log('- User name:', user?.name)
    console.log('- User email:', user?.email)
    console.log('- Zerodha config exists:', !!user?.zerodhaConfig)

    if (!user) {
      return NextResponse.json({ 
        error: 'User not found in database',
        sessionEmail: session.user.email,
        timestamp: new Date().toISOString()
      }, { status: 404 })
    }

    return NextResponse.json({
      success: true,
      sessionEmail: session.user.email,
      userFromDB: {
        id: user._id,
        name: user.name,
        email: user.email,
        hasZerodhaConfig: !!user.zerodhaConfig,
        zerodhaDetails: user.zerodhaConfig ? {
          hasApiKey: !!user.zerodhaConfig.apiKey,
          hasApiSecret: !!user.zerodhaConfig.apiSecret,
          hasAccessToken: !!user.zerodhaConfig.accessToken,
          isConnected: !!user.zerodhaConfig.isConnected,
          balance: user.zerodhaConfig.balance || 0
        } : null
      },
      timestamp: new Date().toISOString()
    })

  } catch (error: any) {
    console.error('Error in user test:', error)
    return NextResponse.json({
      error: 'Server error',
      details: error.message,
      timestamp: new Date().toISOString()
    }, { status: 500 })
  }
}