import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import clientPromise from '@/lib/mongodb'
import dbConnect from '@/lib/mongoose'
import User from '@/models/User'

/**
 * Gets the effective user (either the logged-in user or the impersonated user)
 * Returns both the user object and impersonation context
 */
export async function getEffectiveUser() {
  const session = await getServerSession(authOptions)
  
  if (!session?.user?.email) {
    return { user: null, isImpersonating: false, impersonationDetails: null }
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
  
  return {
    user,
    isImpersonating,
    impersonationDetails,
    originalAdminEmail: session.user.email
  }
}

/**
 * Gets just the effective user email (for backward compatibility)
 */
export async function getEffectiveUserEmail(): Promise<string | null> {
  const session = await getServerSession(authOptions)
  
  if (!session?.user?.email) {
    return null
  }

  // Check for active impersonation session
  const client = await clientPromise
  const db = client.db('tradebot')
  
  const activeImpersonation = await db.collection('impersonation_sessions').findOne({
    adminEmail: session.user.email,
    expiresAt: { $gt: new Date() }
  })

  return activeImpersonation ? activeImpersonation.targetUserEmail : session.user.email
}