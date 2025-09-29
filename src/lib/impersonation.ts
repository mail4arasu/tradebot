import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import clientPromise from '@/lib/mongodb'

export async function checkImpersonationRestrictions(allowedActions: string[] = []) {
  const session = await getServerSession(authOptions)
  
  if (!session?.user?.email) {
    return { isImpersonating: false, isRestricted: false }
  }

  const client = await clientPromise
  const db = client.db('tradebot')
  
  // Check for active impersonation session
  const activeImpersonation = await db.collection('impersonation_sessions').findOne({
    adminEmail: session.user.email,
    expiresAt: { $gt: new Date() }
  })

  if (!activeImpersonation) {
    return { isImpersonating: false, isRestricted: false }
  }

  // Define restricted actions during impersonation
  const restrictedActions = [
    'change_password',
    'update_api_keys',
    'delete_account',
    'modify_zerodha_config',
    'financial_transactions',
    'admin_actions'
  ]

  const hasRestrictedAction = restrictedActions.some(action => 
    !allowedActions.includes(action) && allowedActions.length === 0
  )

  return {
    isImpersonating: true,
    isRestricted: hasRestrictedAction,
    impersonationDetails: {
      adminEmail: activeImpersonation.adminEmail,
      targetUserEmail: activeImpersonation.targetUserEmail,
      startTime: activeImpersonation.startTime,
      expiresAt: activeImpersonation.expiresAt
    }
  }
}

export function createImpersonationMessage() {
  return {
    error: 'This action is restricted during impersonation mode for security reasons.',
    code: 'IMPERSONATION_RESTRICTED'
  }
}