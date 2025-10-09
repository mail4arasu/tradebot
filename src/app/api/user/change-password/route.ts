import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import bcrypt from 'bcryptjs'
import dbConnect from '@/lib/mongoose'
import User from '@/models/User'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await dbConnect()

    const { currentPassword, newPassword, confirmPassword } = await request.json()

    // Validation
    if (!currentPassword || !newPassword || !confirmPassword) {
      return NextResponse.json({ 
        error: 'All password fields are required' 
      }, { status: 400 })
    }

    if (newPassword !== confirmPassword) {
      return NextResponse.json({ 
        error: 'New passwords do not match' 
      }, { status: 400 })
    }

    if (newPassword.length < 8) {
      return NextResponse.json({ 
        error: 'New password must be at least 8 characters long' 
      }, { status: 400 })
    }

    if (currentPassword === newPassword) {
      return NextResponse.json({ 
        error: 'New password must be different from current password' 
      }, { status: 400 })
    }

    console.log(`🔐 Password change request for: ${session.user.email}`)

    // Find user
    const user = await User.findOne({ email: session.user.email })
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Verify current password
    const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password)
    if (!isCurrentPasswordValid) {
      console.log(`❌ Invalid current password for: ${session.user.email}`)
      return NextResponse.json({ 
        error: 'Current password is incorrect' 
      }, { status: 400 })
    }

    // Hash new password
    const saltRounds = 12
    const hashedNewPassword = await bcrypt.hash(newPassword, saltRounds)

    // Update password
    user.password = hashedNewPassword
    user.lastPasswordReset = new Date()
    
    // Clear any existing reset tokens
    user.passwordResetToken = undefined
    user.passwordResetExpires = undefined
    user.passwordResetAttempts = 0
    
    await user.save()

    console.log(`✅ Password successfully changed for: ${session.user.email}`)

    return NextResponse.json({
      success: true,
      message: 'Password changed successfully'
    })

  } catch (error) {
    console.error('❌ Change password error:', error)
    return NextResponse.json({
      error: 'Internal server error. Please try again later.',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    }, { status: 500 })
  }
}

// GET endpoint to check password change requirements
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await dbConnect()

    const user = await User.findOne({ email: session.user.email })
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    return NextResponse.json({
      requirements: {
        minLength: 8,
        mustBeDifferent: true,
        requiresCurrentPassword: true
      },
      lastPasswordReset: user.lastPasswordReset,
      accountCreated: user.createdAt
    })

  } catch (error) {
    console.error('❌ Get password requirements error:', error)
    return NextResponse.json({
      error: 'Failed to get password requirements',
      details: error.message
    }, { status: 500 })
  }
}