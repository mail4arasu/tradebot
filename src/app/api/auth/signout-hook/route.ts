import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import clientPromise from '@/lib/mongodb'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.email) {
      return NextResponse.json({ success: true })
    }

    const client = await clientPromise
    const db = client.db('tradebot')
    
    // Clear any impersonation sessions for this admin when they sign out
    const result = await db.collection('impersonation_sessions').deleteMany({
      adminEmail: session.user.email
    })

    if (result.deletedCount > 0) {
      console.log(`Cleared ${result.deletedCount} impersonation session(s) for ${session.user.email}`)
      
      // Log the forced session end
      await db.collection('audit_logs').insertOne({
        adminEmail: session.user.email,
        action: 'impersonation_force_end',
        reason: 'admin_signout',
        timestamp: new Date(),
        metadata: {
          deletedSessions: result.deletedCount,
          userAgent: request.headers.get('user-agent'),
          ip: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown'
        }
      })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error clearing impersonation sessions on signout:', error)
    return NextResponse.json({ success: true }) // Don't fail signout due to this error
  }
}