import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import dbConnect from '@/lib/mongoose'
import User from '@/models/User'
import { ZerodhaAPI } from '@/lib/zerodha'
import { decrypt, encrypt } from '@/utils/encryption'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const requestToken = searchParams.get('request_token')
    const status = searchParams.get('status')
    
    console.log('OAuth callback received:', { requestToken, status })
    
    if (status !== 'success' || !requestToken) {
      console.log('OAuth failed or missing request token')
      return NextResponse.redirect(new URL('/settings?error=oauth_failed', 'https://niveshawealth.in'))
    }

    // Get the current session to match the user
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      console.log('No session found during OAuth callback')
      return NextResponse.redirect(new URL('/settings?error=no_session', 'https://niveshawealth.in'))
    }

    await dbConnect()
    
    // Find the current user by session email
    const user = await User.findOne({ email: session.user.email })
    
    if (!user?.zerodhaConfig?.apiKey) {
      console.log('User not found or missing API key')
      return NextResponse.redirect(new URL('/settings?error=no_api_key', 'https://niveshawealth.in'))
    }
    const apiKey = decrypt(user.zerodhaConfig.apiKey)
    const apiSecret = decrypt(user.zerodhaConfig.apiSecret)
    
    console.log('Attempting token exchange for user:', session.user.email)
    console.log('Decrypted credentials:', {
      apiKeyLength: apiKey.length,
      apiSecretLength: apiSecret.length,
      apiKeyPreview: apiKey.substring(0, 6) + '***',
      requestTokenLength: requestToken.length
    })
    
    // Exchange request token for access token
    const accessToken = await ZerodhaAPI.getAccessToken(apiKey, apiSecret, requestToken)
    const encryptedAccessToken = encrypt(accessToken)
    
    console.log('Token exchange successful, updating user')
    
    // Update user with access token
    await User.findByIdAndUpdate(user._id, {
      'zerodhaConfig.accessToken': encryptedAccessToken,
      'zerodhaConfig.isConnected': true,
      'zerodhaConfig.lastSync': new Date()
    })
    
    console.log('User updated successfully')
    return NextResponse.redirect(new URL('/settings?success=connected', 'https://niveshawealth.in'))
  } catch (error) {
    console.error('OAuth callback error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.redirect(new URL('/settings?error=token_exchange_failed&details=' + encodeURIComponent(errorMessage), 'https://niveshawealth.in'))
  }
}