import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import dbConnect from '@/lib/mongoose'
import User from '@/models/User'

export async function POST(request: NextRequest) {
  try {
    const { name, email, password } = await request.json()

    // Validation
    if (!name || !email || !password) {
      return NextResponse.json(
        { error: 'Name, email, and password are required' },
        { status: 400 }
      )
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: 'Password must be at least 6 characters long' },
        { status: 400 }
      )
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: 'Please enter a valid email address' },
        { status: 400 }
      )
    }

    await dbConnect()

    // Check if user already exists
    const existingUser = await User.findOne({ email: email.toLowerCase() })
    if (existingUser) {
      return NextResponse.json(
        { error: 'User with this email already exists' },
        { status: 400 }
      )
    }

    // Hash password
    const saltRounds = 12
    const hashedPassword = await bcrypt.hash(password, saltRounds)

    // Create new user
    const newUser = new User({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      password: hashedPassword,
      authProvider: 'credentials',
      zerodhaConfig: {
        isConnected: false
      }
    })

    await newUser.save()

    // Return success (don't include sensitive data)
    return NextResponse.json(
      { 
        message: 'Account created successfully',
        user: {
          id: newUser._id,
          name: newUser.name,
          email: newUser.email
        }
      },
      { status: 201 }
    )

  } catch (error) {
    console.error('❌ Signup error:', error)
    console.error('📋 Error details:', {
      message: error.message,
      code: error.code,
      name: error.name,
      stack: error.stack
    })
    
    // Handle MongoDB validation errors
    if (error.name === 'ValidationError') {
      const validationErrors = Object.values(error.errors).map(err => err.message)
      console.error('📝 Validation errors:', validationErrors)
      return NextResponse.json(
        { error: `Validation error: ${validationErrors.join(', ')}` },
        { status: 400 }
      )
    }
    
    // Handle duplicate key error (in case the unique index catches it)
    if (error.code === 11000) {
      console.error('🔄 Duplicate email attempted:', email)
      return NextResponse.json(
        { error: 'User with this email already exists' },
        { status: 400 }
      )
    }

    // Log the full error for debugging
    console.error('🚨 Unhandled signup error:', {
      errorType: typeof error,
      errorConstructor: error.constructor.name,
      errorMessage: error.message,
      errorCode: error.code,
      fullError: error
    })

    return NextResponse.json(
      { error: 'Internal server error. Please try again.' },
      { status: 500 }
    )
  }
}