import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { isAdminUser } from '@/lib/admin'
import clientPromise from '@/lib/mongodb'

// POST - Clean up simulated/test data (admin only)
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check if user is admin
    if (!(await isAdminUser())) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const client = await clientPromise
    const db = client.db('tradebot')

    // Remove simulated trades (orders starting with SIM_)
    const simulatedTradesResult = await db.collection('trades').deleteMany({
      orderId: { $regex: /^SIM_/ }
    })

    // Remove simulated trade executions
    const simulatedExecutionsResult = await db.collection('tradeexecutions').deleteMany({
      zerodhaOrderId: { $regex: /^SIM_/ }
    })

    console.log(`🧹 CLEANUP COMPLETED:`)
    console.log(`   Simulated trades removed: ${simulatedTradesResult.deletedCount}`)
    console.log(`   Simulated executions removed: ${simulatedExecutionsResult.deletedCount}`)

    return NextResponse.json({
      success: true,
      message: 'Test data cleanup completed',
      removed: {
        simulatedTrades: simulatedTradesResult.deletedCount,
        simulatedExecutions: simulatedExecutionsResult.deletedCount
      }
    })

  } catch (error) {
    console.error('❌ Error cleaning up test data:', error)
    return NextResponse.json(
      { error: 'Failed to clean up test data' },
      { status: 500 }
    )
  }
}