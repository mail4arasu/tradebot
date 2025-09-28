import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import clientPromise from '@/lib/mongodb'
import { isAdminUser } from '@/lib/admin'
import { ObjectId } from 'mongodb'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const client = await clientPromise
    const db = client.db('tradebot')
    const users = db.collection('users')

    // Check if current user is admin
    if (!(await isAdminUser())) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const url = new URL(request.url)
    const action = url.searchParams.get('action')

    if (action === 'stats') {
      // Get user statistics
      const totalUsers = await users.countDocuments()
      const activeUsers = await users.countDocuments({ status: 'active' })
      const suspendedUsers = await users.countDocuments({ status: 'suspended' })
      const restrictedUsers = await users.countDocuments({ status: 'restricted' })
      const adminUsers = await users.countDocuments({ role: 'admin' })
      
      // Recent registrations (last 30 days)
      const thirtyDaysAgo = new Date()
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
      const recentRegistrations = await users.countDocuments({
        createdAt: { $gte: thirtyDaysAgo }
      })

      // Users with Zerodha connected
      const zerodhaConnectedUsers = await users.countDocuments({
        'zerodhaConfig.isConnected': true
      })

      return NextResponse.json({
        totalUsers,
        activeUsers,
        suspendedUsers,
        restrictedUsers,
        adminUsers,
        recentRegistrations,
        zerodhaConnectedUsers
      })
    } else {
      // Get all users with pagination
      const page = parseInt(url.searchParams.get('page') || '1')
      const limit = parseInt(url.searchParams.get('limit') || '10')
      const skip = (page - 1) * limit

      const allUsers = await users
        .find({}, {
          projection: {
            password: 0, // Don't return password
            'zerodhaConfig.apiKey': 0, // Don't return sensitive Zerodha data
            'zerodhaConfig.apiSecret': 0
          }
        })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .toArray()

      // Get bot allocations for each user
      const userBotAllocations = db.collection('userbotallocations')
      const bots = db.collection('bots')
      
      const usersWithBots = await Promise.all(allUsers.map(async (user) => {
        const allocations = await userBotAllocations
          .find({ userId: user._id })
          .toArray()
        
        const botDetails = await Promise.all(allocations.map(async (allocation) => {
          const bot = await bots.findOne({ _id: allocation.botId })
          return {
            botName: bot?.name || 'Unknown Bot',
            strategy: bot?.strategy || 'Unknown',
            allocatedAmount: allocation.allocatedAmount,
            isActive: allocation.isActive,
            totalPnl: allocation.totalPnl || 0
          }
        }))
        
        return {
          ...user,
          botAllocations: botDetails
        }
      }))

      const totalUsers = await users.countDocuments()

      return NextResponse.json({
        users: usersWithBots,
        pagination: {
          page,
          limit,
          total: totalUsers,
          pages: Math.ceil(totalUsers / limit)
        }
      })
    }
  } catch (error) {
    console.error('Admin users API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const client = await clientPromise
    const db = client.db('tradebot')
    const users = db.collection('users')

    // Check if current user is admin
    if (!(await isAdminUser())) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const { userId, action, status } = await request.json()

    if (!userId || !action) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Prevent admin from modifying their own status
    if (userId === session.user.id) {
      return NextResponse.json({ error: 'Cannot modify your own account' }, { status: 400 })
    }

    let updateData: any = {}

    switch (action) {
      case 'updateStatus':
        if (!status || !['active', 'suspended', 'restricted'].includes(status)) {
          return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
        }
        updateData.status = status
        break
      case 'makeAdmin':
        updateData.role = 'admin'
        break
      case 'removeAdmin':
        updateData.role = 'user'
        break
      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }

    const result = await users.updateOne(
      { _id: new ObjectId(userId) },
      { $set: updateData }
    )

    if (result.matchedCount === 0) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true, message: 'User updated successfully' })
  } catch (error) {
    console.error('Admin user update error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const client = await clientPromise
    const db = client.db('tradebot')
    const users = db.collection('users')

    // Check if current user is admin
    if (!(await isAdminUser())) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const { userId } = await request.json()

    if (!userId) {
      return NextResponse.json({ error: 'User ID required' }, { status: 400 })
    }

    // Prevent admin from deleting their own account
    if (userId === session.user.id) {
      return NextResponse.json({ error: 'Cannot delete your own account' }, { status: 400 })
    }

    const result = await users.deleteOne({ _id: new ObjectId(userId) })

    if (result.deletedCount === 0) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true, message: 'User deleted successfully' })
  } catch (error) {
    console.error('Admin user delete error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}