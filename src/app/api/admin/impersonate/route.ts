import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import clientPromise from '@/lib/mongodb'
import { isAdminUser } from '@/lib/admin'
import { ObjectId } from 'mongodb'

interface ImpersonationSession {
  adminId: string
  adminEmail: string
  targetUserId: string
  targetUserEmail: string
  startTime: Date
  expiresAt: Date
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify admin permissions
    if (!(await isAdminUser())) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const client = await clientPromise
    const db = client.db('tradebot')
    
    const { targetUserId } = await request.json()

    if (!targetUserId) {
      return NextResponse.json({ error: 'Target user ID is required' }, { status: 400 })
    }

    // Verify target user exists
    const targetUser = await db.collection('users').findOne({ 
      _id: new ObjectId(targetUserId) 
    })

    if (!targetUser) {
      return NextResponse.json({ error: 'Target user not found' }, { status: 404 })
    }

    // Prevent impersonating other admins
    if (targetUser.role === 'admin') {
      return NextResponse.json({ error: 'Cannot impersonate other administrators' }, { status: 403 })
    }

    // Get current admin user
    const adminUser = await db.collection('users').findOne({ 
      email: session.user.email 
    })

    if (!adminUser) {
      return NextResponse.json({ error: 'Admin user not found' }, { status: 404 })
    }

    // Create impersonation session (expires in 1 hour)
    const impersonationData: ImpersonationSession = {
      adminId: adminUser._id.toString(),
      adminEmail: adminUser.email,
      targetUserId: targetUser._id.toString(),
      targetUserEmail: targetUser.email,
      startTime: new Date(),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000) // 1 hour
    }

    // Store impersonation session
    await db.collection('impersonation_sessions').insertOne(impersonationData)

    // Log the impersonation start
    await db.collection('audit_logs').insertOne({
      adminId: adminUser._id,
      adminEmail: adminUser.email,
      action: 'impersonation_start',
      targetUserId: targetUser._id,
      targetUserEmail: targetUser.email,
      timestamp: new Date(),
      metadata: {
        userAgent: request.headers.get('user-agent'),
        ip: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown'
      }
    })

    return NextResponse.json({
      success: true,
      message: `Now impersonating ${targetUser.name} (${targetUser.email})`,
      impersonation: {
        targetUserId: targetUser._id.toString(),
        targetUserName: targetUser.name,
        targetUserEmail: targetUser.email,
        expiresAt: impersonationData.expiresAt
      }
    })

  } catch (error) {
    console.error('Impersonation error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const client = await clientPromise
    const db = client.db('tradebot')
    
    // Find and remove active impersonation session
    const activeSession = await db.collection('impersonation_sessions').findOne({
      adminEmail: session.user.email,
      expiresAt: { $gt: new Date() }
    })

    if (!activeSession) {
      return NextResponse.json({ error: 'No active impersonation session found' }, { status: 404 })
    }

    // Calculate session duration
    const duration = Math.round((Date.now() - activeSession.startTime.getTime()) / 1000 / 60) // minutes

    // Remove impersonation session
    await db.collection('impersonation_sessions').deleteOne({ _id: activeSession._id })

    // Log the impersonation end
    await db.collection('audit_logs').insertOne({
      adminId: new ObjectId(activeSession.adminId),
      adminEmail: activeSession.adminEmail,
      action: 'impersonation_end',
      targetUserId: new ObjectId(activeSession.targetUserId),
      targetUserEmail: activeSession.targetUserEmail,
      timestamp: new Date(),
      metadata: {
        duration: duration,
        userAgent: request.headers.get('user-agent'),
        ip: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown'
      }
    })

    return NextResponse.json({
      success: true,
      message: 'Impersonation session ended successfully',
      duration: `${duration} minutes`
    })

  } catch (error) {
    console.error('End impersonation error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// Get current impersonation status
export async function GET(_request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const client = await clientPromise
    const db = client.db('tradebot')
    
    // Check for active impersonation session
    const activeSession = await db.collection('impersonation_sessions').findOne({
      adminEmail: session.user.email,
      expiresAt: { $gt: new Date() }
    })

    if (!activeSession) {
      return NextResponse.json({ 
        isImpersonating: false 
      })
    }

    return NextResponse.json({
      isImpersonating: true,
      impersonation: {
        targetUserId: activeSession.targetUserId,
        targetUserEmail: activeSession.targetUserEmail,
        startTime: activeSession.startTime,
        expiresAt: activeSession.expiresAt
      }
    })

  } catch (error) {
    console.error('Get impersonation status error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}