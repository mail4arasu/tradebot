import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import dbConnect from '@/lib/mongoose'
import mongoose from 'mongoose'

export async function GET(request: NextRequest) {
  try {
    console.log('🔧 SIMPLE TEST ENDPOINT CALLED')
    
    // Test 1: Check session
    const session = await getServerSession(authOptions)
    console.log('Session check:')
    console.log('- Has session:', !!session)
    console.log('- User email:', session?.user?.email)
    console.log('- User name from session:', session?.user?.name)
    
    if (!session?.user?.email) {
      return NextResponse.json({ 
        error: 'No session found',
        step: 'session_check'
      }, { status: 401 })
    }

    // Test 2: Database connection
    await dbConnect()
    console.log('✅ Database connected')

    // Test 3: Raw database query
    console.log('🔍 Searching for user with email:', session.user.email)
    
    const userDoc = await mongoose.connection.db?.collection('users').findOne({ 
      email: session.user.email 
    })
    
    console.log('Database search result:')
    console.log('- Found user:', !!userDoc)
    if (userDoc) {
      console.log('- User _id:', userDoc._id)
      console.log('- User name:', userDoc.name)
      console.log('- User email:', userDoc.email)
      console.log('- Has zerodhaConfig:', !!userDoc.zerodhaConfig)
      console.log('- Full user object keys:', Object.keys(userDoc))
    }

    // Test 4: Search for any users with similar emails
    const allUsersWithSimilarEmail = await mongoose.connection.db?.collection('users').find({
      email: { $regex: session.user.email.split('@')[0], $options: 'i' }
    }).toArray()
    
    console.log('🔍 Users with similar email patterns:')
    allUsersWithSimilarEmail?.forEach((user, index) => {
      console.log(`User ${index + 1}:`, {
        id: user._id,
        name: user.name,
        email: user.email
      })
    })

    return NextResponse.json({
      success: true,
      session: {
        email: session.user.email,
        name: session.user.name
      },
      userFound: !!userDoc,
      userData: userDoc ? {
        id: userDoc._id,
        name: userDoc.name,
        email: userDoc.email,
        hasZerodhaConfig: !!userDoc.zerodhaConfig
      } : null,
      similarUsers: allUsersWithSimilarEmail?.map(u => ({
        id: u._id,
        name: u.name,
        email: u.email
      })),
      timestamp: new Date().toISOString()
    })

  } catch (error: any) {
    console.error('❌ Error in simple test:', error)
    return NextResponse.json({
      error: 'Test failed',
      details: error.message,
      stack: error.stack
    }, { status: 500 })
  }
}