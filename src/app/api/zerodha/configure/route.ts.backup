import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import dbConnect from '@/lib/mongoose'
import User from '@/models/User'
import { encrypt } from '@/utils/encryption'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { apiKey, apiSecret } = await request.json()

    if (!apiKey || !apiSecret) {
      return NextResponse.json({ error: 'API Key and Secret are required' }, { status: 400 })
    }

    await dbConnect()

    const encryptedApiKey = encrypt(apiKey)
    const encryptedApiSecret = encrypt(apiSecret)

    await User.findOneAndUpdate(
      { email: session.user.email },
      {
        $set: {
          'zerodhaConfig.apiKey': encryptedApiKey,
          'zerodhaConfig.apiSecret': encryptedApiSecret,
          'zerodhaConfig.isConnected': false, // Will be set to true after successful test
        }
      },
      { new: true, upsert: true }
    )

    return NextResponse.json({ 
      message: 'Zerodha credentials saved successfully',
      isConnected: false 
    })
  } catch (error) {
    console.error('Error saving Zerodha credentials:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}