import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import clientPromise from '@/lib/mongodb'
import { ObjectId } from 'mongodb'
import { isAdminUser } from '@/lib/admin'

// PUT - Update bot configuration (Admin only)
export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check if user is admin
    if (!(await isAdminUser())) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const payload = await request.json()
    const { botId, ...updateData } = payload

    if (!botId) {
      return NextResponse.json(
        { error: 'Missing botId' },
        { status: 400 }
      )
    }

    const client = await clientPromise
    const db = client.db('tradebot')

    // Update bot configuration
    const result = await db.collection('bots').updateOne(
      { _id: new ObjectId(botId) },
      {
        $set: {
          ...updateData,
          updatedAt: new Date()
        }
      }
    )

    if (result.matchedCount === 0) {
      return NextResponse.json(
        { error: 'Bot not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Bot configuration updated successfully'
    })

  } catch (error) {
    console.error('❌ Error updating bot config:', error)
    return NextResponse.json(
      { error: 'Failed to update bot configuration' },
      { status: 500 }
    )
  }
}