import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import dbConnect from '@/lib/mongoose'
import User from '@/models/User'

export async function POST(_request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    // Only allow admin users to clear all credentials
    if (!session?.user?.email || session.user.email !== 'mail4arasu@gmail.com') {
      return NextResponse.json({ error: 'Unauthorized - Admin only' }, { status: 401 })
    }

    await dbConnect()
    
    // Clear all Zerodha configurations for all users
    const result = await User.updateMany(
      {},
      {
        $unset: {
          'zerodhaConfig.apiKey': 1,
          'zerodhaConfig.apiSecret': 1,
          'zerodhaConfig.accessToken': 1
        },
        $set: {
          'zerodhaConfig.isConnected': false,
          'zerodhaConfig.balance': 0
        }
      }
    )

    console.log('Cleared corrupted credentials for all users:', result.modifiedCount, 'users affected')

    return NextResponse.json({ 
      message: `Successfully cleared credentials for ${result.modifiedCount} users`,
      success: true,
      affectedUsers: result.modifiedCount
    })
  } catch (error) {
    console.error('Error clearing all credentials:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}