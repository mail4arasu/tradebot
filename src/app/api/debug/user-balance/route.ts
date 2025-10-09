import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import dbConnect from '@/lib/mongoose'
import User from '@/models/User'
import { ZerodhaAPI } from '@/lib/zerodha'
import { decrypt } from '@/lib/encryption'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    // Only allow admin access
    if (!session?.user?.email || session.user.email !== 'mail4arasu@gmail.com') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 401 })
    }

    const url = new URL(request.url)
    const userEmail = url.searchParams.get('email')
    
    if (!userEmail) {
      return NextResponse.json({ error: 'Email parameter required' }, { status: 400 })
    }

    await dbConnect()
    
    const user = await User.findOne({ email: userEmail })
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    console.log(`🔍 Debugging balance issue for user: ${userEmail}`)
    console.log(`📋 User ID: ${user._id}`)
    console.log(`📋 User Name: ${user.name}`)

    const zerodhaConfig = user.zerodhaConfig || {}
    console.log(`📋 Zerodha Config exists: ${!!zerodhaConfig}`)
    console.log(`📋 API Key exists: ${!!zerodhaConfig.apiKey}`)
    console.log(`📋 API Secret exists: ${!!zerodhaConfig.apiSecret}`)
    console.log(`📋 Access Token exists: ${!!zerodhaConfig.accessToken}`)
    console.log(`📋 Is Connected: ${zerodhaConfig.isConnected}`)
    console.log(`📋 Stored Balance: ${zerodhaConfig.balance}`)
    console.log(`📋 Last Sync: ${zerodhaConfig.lastSync}`)

    // Check if all required fields exist
    if (!zerodhaConfig.apiKey || !zerodhaConfig.apiSecret || !zerodhaConfig.accessToken) {
      return NextResponse.json({
        error: 'Incomplete Zerodha configuration',
        debug: {
          hasApiKey: !!zerodhaConfig.apiKey,
          hasApiSecret: !!zerodhaConfig.apiSecret, 
          hasAccessToken: !!zerodhaConfig.accessToken,
          isConnected: zerodhaConfig.isConnected,
          storedBalance: zerodhaConfig.balance
        }
      })
    }

    // Try to decrypt credentials and test API call
    try {
      const apiKey = decrypt(zerodhaConfig.apiKey)
      const apiSecret = decrypt(zerodhaConfig.apiSecret)
      const accessToken = decrypt(zerodhaConfig.accessToken)

      console.log(`🔑 API Key (first 10 chars): ${apiKey.substring(0, 10)}...`)
      console.log(`🔑 Access Token (first 20 chars): ${accessToken.substring(0, 20)}...`)

      const zerodhaAPI = new ZerodhaAPI(apiKey, apiSecret, accessToken)

      // Test API calls
      const [marginsResult, profileResult] = await Promise.all([
        zerodhaAPI.getMargins().catch(e => ({ error: e.message })),
        zerodhaAPI.getProfile().catch(e => ({ error: e.message }))
      ])

      console.log(`📊 Margins API Result:`, marginsResult)
      console.log(`👤 Profile API Result:`, profileResult)

      return NextResponse.json({
        success: true,
        user: {
          id: user._id,
          name: user.name,
          email: user.email
        },
        zerodhaConfig: {
          hasApiKey: !!zerodhaConfig.apiKey,
          hasApiSecret: !!zerodhaConfig.apiSecret,
          hasAccessToken: !!zerodhaConfig.accessToken,
          isConnected: zerodhaConfig.isConnected,
          storedBalance: zerodhaConfig.balance,
          lastSync: zerodhaConfig.lastSync
        },
        apiTests: {
          margins: marginsResult,
          profile: profileResult
        }
      })

    } catch (decryptError) {
      console.error(`❌ Decryption error:`, decryptError)
      return NextResponse.json({
        error: 'Credential decryption failed',
        debug: {
          decryptionError: decryptError.message
        }
      })
    }

  } catch (error) {
    console.error('❌ Debug balance error:', error)
    return NextResponse.json({ 
      error: 'Debug failed',
      details: error.message 
    }, { status: 500 })
  }
}