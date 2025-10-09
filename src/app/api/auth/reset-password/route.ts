import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import dbConnect from '@/lib/mongoose'
import User from '@/models/User'

export async function POST(request: NextRequest) {
  try {
    await dbConnect()
    
    const { token, email, newPassword } = await request.json()

    if (!token || !email || !newPassword) {
      return NextResponse.json({ 
        error: 'Token, email, and new password are required' 
      }, { status: 400 })
    }

    // Validate password strength
    if (newPassword.length < 8) {
      return NextResponse.json({ 
        error: 'Password must be at least 8 characters long' 
      }, { status: 400 })
    }

    console.log(`🔑 Password reset attempt for: ${email}`)

    // Hash the token to compare with stored hash
    const resetTokenHash = crypto.createHash('sha256').update(token).digest('hex')

    // Find user with valid reset token
    const user = await User.findOne({
      email: email.toLowerCase(),
      passwordResetToken: resetTokenHash,
      passwordResetExpires: { $gt: new Date() }
    })

    if (!user) {
      console.log(`❌ Invalid or expired reset token for: ${email}`)
      return NextResponse.json({
        error: 'Invalid or expired reset token. Please request a new password reset.'
      }, { status: 400 })
    }

    console.log(`✅ Valid reset token found for: ${email}`)

    // Hash the new password
    const saltRounds = 12
    const hashedPassword = await bcrypt.hash(newPassword, saltRounds)

    // Update user password and clear reset token
    user.password = hashedPassword
    user.passwordResetToken = undefined
    user.passwordResetExpires = undefined
    user.passwordResetAttempts = 0
    user.lastPasswordReset = new Date()
    
    await user.save()

    console.log(`✅ Password successfully reset for: ${email}`)

    return NextResponse.json({
      success: true,
      message: 'Password has been successfully reset. You can now sign in with your new password.'
    })

  } catch (error) {
    console.error('❌ Reset password error:', error)
    return NextResponse.json({
      error: 'Internal server error. Please try again later.',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    }, { status: 500 })
  }
}

// GET endpoint to validate reset token
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const token = searchParams.get('token')
    const email = searchParams.get('email')

    if (!token || !email) {
      return NextResponse.json({ 
        error: 'Token and email are required' 
      }, { status: 400 })
    }

    await dbConnect()

    // Hash the token to compare with stored hash
    const resetTokenHash = crypto.createHash('sha256').update(token).digest('hex')

    // Find user with valid reset token
    const user = await User.findOne({
      email: email.toLowerCase(),
      passwordResetToken: resetTokenHash,
      passwordResetExpires: { $gt: new Date() }
    })

    if (!user) {
      return NextResponse.json({
        valid: false,
        error: 'Invalid or expired reset token'
      }, { status: 400 })
    }

    const timeLeft = Math.max(0, Math.floor((user.passwordResetExpires.getTime() - new Date().getTime()) / 1000 / 60))

    return NextResponse.json({
      valid: true,
      email: user.email,
      timeLeft: `${timeLeft} minutes`,
      expires: user.passwordResetExpires
    })

  } catch (error) {
    console.error('❌ Validate reset token error:', error)
    return NextResponse.json({
      error: 'Failed to validate reset token',
      details: error.message
    }, { status: 500 })
  }
}