import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import clientPromise from '@/lib/mongodb'

/**
 * Server-side utility to check if the current user is an admin
 * NOTE: This checks the ORIGINAL admin user, not the impersonated user
 * @returns Promise<boolean> - true if user is admin, false otherwise
 */
export async function isAdminUser(): Promise<boolean> {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return false
    }

    const client = await clientPromise
    const db = client.db('tradebot')
    
    // Always check the original session user for admin status,
    // not the impersonated user
    const user = await db.collection('users').findOne({ 
      email: session.user.email 
    })
    
    return user?.role === 'admin'
  } catch (error) {
    console.error('Error checking admin status:', error)
    return false
  }
}

/**
 * Server-side utility to get session and verify admin access
 * @returns Promise<{ session: Session | null, isAdmin: boolean }>
 */
export async function getAdminSession() {
  const session = await getServerSession(authOptions)
  const isAdmin = await isAdminUser()
  
  return { session, isAdmin }
}