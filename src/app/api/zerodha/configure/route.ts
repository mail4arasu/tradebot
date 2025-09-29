import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import dbConnect from '@/lib/mongoose'
import User from '@/models/User'
// Removed encryption import - storing plain text for simplicity
import { checkImpersonationRestrictions, createImpersonationMessage } from '@/lib/impersonation'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check impersonation restrictions
    const impersonationCheck = await checkImpersonationRestrictions(['read_only'])
    if (impersonationCheck.isImpersonating && impersonationCheck.isRestricted) {
      return NextResponse.json(createImpersonationMessage(), { status: 403 })
    }

    const { apiKey, apiSecret } = await request.json()

    if (!apiKey || !apiSecret) {
      return NextResponse.json({ error: 'API Key and Secret are required' }, { status: 400 })
    }

    await dbConnect()

    // Store credentials as plain text - no encryption needed for private dashboard
    await User.findOneAndUpdate(
      { email: session.user.email },
      {
        $set: {
          'zerodhaConfig.apiKey': apiKey,
          'zerodhaConfig.apiSecret': apiSecret,
          'zerodhaConfig.isConnected': false, // Will be set to true after successful test
        }
      },
      { new: true, upsert: true }
    )

    return NextResponse.json({ 
      message: 'Zerodha credentials saved successfully',
      isConnected: false 
    })
  } catch (error) {
    console.error('Error saving Zerodha credentials:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}