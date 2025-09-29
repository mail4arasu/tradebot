import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import dbConnect from '@/lib/mongoose'
import User from '@/models/User'
import { ZerodhaAPI } from '@/lib/zerodha'
// Removed encryption import - using plain text credentials

export async function POST(_request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await dbConnect()
    
    const user = await User.findOne({ email: session.user.email })
    
    if (!user?.zerodhaConfig?.apiKey) {
      return NextResponse.json({ error: 'API Key not found. Please save your credentials first.' }, { status: 400 })
    }

    // Use plain text API key - no decryption needed
    const apiKey = user.zerodhaConfig.apiKey
    const redirectUrl = process.env.NEXTAUTH_URL + '/api/zerodha/callback'
    const loginUrl = ZerodhaAPI.getLoginUrl(apiKey, redirectUrl)

    return NextResponse.json({ loginUrl })
  } catch (error) {
    console.error('Error generating auth URL:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}