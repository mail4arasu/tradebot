import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import dbConnect from '@/lib/mongoose'
import User from '@/models/User'
import { sendEmail, createPasswordResetEmailTemplate } from '@/lib/email'

export async function POST(request: NextRequest) {
  try {
    await dbConnect()
    
    const { email } = await request.json()

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 })
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return NextResponse.json({ error: 'Invalid email format' }, { status: 400 })
    }

    console.log(`🔑 Password reset requested for: ${email}`)

    // Find user by email
    const user = await User.findOne({ email: email.toLowerCase() })
    
    if (!user) {
      // Don't reveal if user exists or not for security
      console.log(`❌ Password reset requested for non-existent user: ${email}`)
      return NextResponse.json({
        success: true,
        message: 'If an account with this email exists, you will receive a password reset link.'
      })
    }

    // Check if user is active
    if (user.status !== 'active') {
      console.log(`❌ Password reset requested for inactive user: ${email}`)
      return NextResponse.json({
        error: 'Account is suspended or restricted. Please contact support.',
      }, { status: 403 })
    }

    // Rate limiting: Check recent reset attempts
    const now = new Date()
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000)
    
    if (user.passwordResetAttempts >= 3 && user.lastPasswordReset && user.lastPasswordReset > oneHourAgo) {
      console.log(`❌ Rate limit exceeded for password reset: ${email}`)
      return NextResponse.json({
        error: 'Too many password reset attempts. Please try again in 1 hour.',
      }, { status: 429 })
    }

    // Generate secure reset token
    const resetToken = crypto.randomBytes(32).toString('hex')
    const resetTokenHash = crypto.createHash('sha256').update(resetToken).digest('hex')
    
    // Set token expiration (1 hour)
    const resetExpires = new Date(now.getTime() + 60 * 60 * 1000)

    // Update user with reset token
    user.passwordResetToken = resetTokenHash
    user.passwordResetExpires = resetExpires
    user.passwordResetAttempts = (user.passwordResetAttempts || 0) + 1
    user.lastPasswordReset = now
    
    await user.save()

    console.log(`🔑 Password reset token generated for: ${email}`)
    console.log(`🕒 Token expires at: ${resetExpires.toISOString()}`)

    // Create reset URL
    const resetUrl = `${process.env.NEXTAUTH_URL}/auth/reset-password?token=${resetToken}&email=${encodeURIComponent(email)}`

    // Send password reset email
    const emailTemplate = createPasswordResetEmailTemplate(email, resetToken, resetUrl)
    const emailResult = await sendEmail(emailTemplate)

    if (emailResult.success) {
      console.log(`✅ Password reset email sent to: ${email}`)
      console.log(`📧 Message ID: ${emailResult.messageId}`)
      
      return NextResponse.json({
        success: true,
        message: 'Password reset link has been sent to your email address.',
        debug: process.env.NODE_ENV === 'development' ? {
          resetUrl,
          token: resetToken,
          expires: resetExpires
        } : undefined
      })
    } else {
      console.error(`❌ Failed to send password reset email to: ${email}`, emailResult.error)
      
      // Clean up the reset token if email failed
      user.passwordResetToken = undefined
      user.passwordResetExpires = undefined
      await user.save()
      
      return NextResponse.json({
        error: 'Failed to send password reset email. Please try again later.',
        details: emailResult.error
      }, { status: 500 })
    }

  } catch (error) {
    console.error('❌ Forgot password error:', error)
    return NextResponse.json({
      error: 'Internal server error. Please try again later.',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    }, { status: 500 })
  }
}

// GET endpoint for testing/debugging
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const email = searchParams.get('email')
  
  if (!email) {
    return NextResponse.json({
      message: 'Forgot Password API',
      usage: 'POST with { "email": "user@example.com" }',
      description: 'Initiates password reset process via email'
    })
  }

  try {
    await dbConnect()
    
    // Find user and return reset status (for debugging only)
    const user = await User.findOne({ email: email.toLowerCase() })
    
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const hasActiveReset = user.passwordResetToken && user.passwordResetExpires && user.passwordResetExpires > new Date()

    return NextResponse.json({
      email: user.email,
      hasActiveReset,
      resetExpires: user.passwordResetExpires,
      resetAttempts: user.passwordResetAttempts || 0,
      lastReset: user.lastPasswordReset
    })

  } catch (error) {
    console.error('❌ Get reset status error:', error)
    return NextResponse.json({
      error: 'Failed to get reset status',
      details: error.message
    }, { status: 500 })
  }
}