import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import dbConnect from '@/lib/mongoose'
import User from '@/models/User'
import clientPromise from '@/lib/mongodb'
import { ObjectId } from 'mongodb'

export async function GET(_request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await dbConnect()
    
    // Check for active impersonation session
    const client = await clientPromise
    const db = client.db('tradebot')
    
    const activeImpersonation = await db.collection('impersonation_sessions').findOne({
      adminEmail: session.user.email,
      expiresAt: { $gt: new Date() }
    })

    let targetEmail = session.user.email
    let isImpersonating = false
    let impersonationDetails = null

    if (activeImpersonation) {
      targetEmail = activeImpersonation.targetUserEmail
      isImpersonating = true
      impersonationDetails = {
        targetUserId: activeImpersonation.targetUserId,
        targetUserEmail: activeImpersonation.targetUserEmail,
        adminEmail: activeImpersonation.adminEmail,
        startTime: activeImpersonation.startTime,
        expiresAt: activeImpersonation.expiresAt
      }
    }
    
    const user = await User.findOne({ email: targetEmail })
    
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const userProfile = {
      _id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      image: user.image,
      emailVerified: user.emailVerified,
      phoneVerified: user.phoneVerified,
      role: user.role || 'user',
      status: user.status || 'active',
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      zerodhaConfig: user.zerodhaConfig ? {
        isConnected: user.zerodhaConfig.isConnected,
        balance: user.zerodhaConfig.balance,
        lastSync: user.zerodhaConfig.lastSync,
        apiKey: user.zerodhaConfig.apiKey ? '••••••••••••••••' : undefined
      } : undefined,
      // Include impersonation information if active
      impersonation: isImpersonating ? {
        isImpersonating: true,
        details: impersonationDetails
      } : { isImpersonating: false }
    }

    return NextResponse.json(userProfile)
  } catch (error) {
    console.error('Error fetching user profile:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}