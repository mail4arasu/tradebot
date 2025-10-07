import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import clientPromise from '@/lib/mongodb'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const client = await clientPromise
    const db = client.db('tradebot')
    const users = db.collection('users')

    // Clear all Zerodha configuration
    await users.updateOne(
      { email: session.user.email },
      {
        $unset: {
          'zerodhaConfig.apiKey': 1,
          'zerodhaConfig.apiSecret': 1,
          'zerodhaConfig.accessToken': 1,
          'zerodhaConfig.lastSync': 1,
        },
        $set: {
          'zerodhaConfig.isConnected': false,
          'zerodhaConfig.balance': 0,
          updatedAt: new Date()
        }
      }
    )

    return NextResponse.json({
      success: true,
      message: 'Zerodha account disconnected successfully'
    })

  } catch (error) {
    console.error('Error disconnecting Zerodha:', error)
    return NextResponse.json(
      { error: 'Failed to disconnect Zerodha account' },
      { status: 500 }
    )
  }
}