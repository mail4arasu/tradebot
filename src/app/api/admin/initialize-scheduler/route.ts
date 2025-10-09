import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import dbConnect from '@/lib/mongoose'
import ScheduledExit from '@/models/ScheduledExit'
import { restartResistantScheduler } from '@/utils/restartResistantScheduler'
import { intradayScheduler } from '@/services/intradayScheduler'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    // Only allow admin access
    if (!session?.user?.email || session.user.email !== 'mail4arasu@gmail.com') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 401 })
    }

    console.log('🔧 Manual scheduler initialization requested by admin')
    
    // Step 1: Ensure database connection
    await dbConnect()
    console.log('✅ Database connection established')
    
    // Step 2: Ensure ScheduledExit collection exists
    const collectionExists = await checkCollectionExists()
    if (!collectionExists) {
      console.log('📦 Creating ScheduledExit collection...')
      await createScheduledExitCollection()
    }
    
    // Step 3: Initialize restart-resistant scheduler
    console.log('🚀 Initializing restart-resistant scheduler...')
    await restartResistantScheduler.initialize()
    
    // Step 4: Initialize legacy scheduler
    console.log('🚀 Initializing legacy scheduler...')
    await intradayScheduler.initialize()
    
    console.log('✅ Manual scheduler initialization completed successfully')
    
    return NextResponse.json({
      success: true,
      message: 'Scheduler initialized successfully',
      timestamp: new Date().toISOString(),
      details: {
        databaseConnected: true,
        collectionExists: true,
        schedulerInitialized: true
      }
    })
    
  } catch (error) {
    console.error('❌ Error in manual scheduler initialization:', error)
    return NextResponse.json({ 
      error: 'Failed to initialize scheduler',
      details: error.message,
      timestamp: new Date().toISOString()
    }, { status: 500 })
  }
}

async function checkCollectionExists(): Promise<boolean> {
  try {
    // Try to find any document in the collection
    const count = await ScheduledExit.countDocuments()
    console.log(`📊 ScheduledExit collection exists with ${count} documents`)
    return true
  } catch (error) {
    console.log('⚠️ ScheduledExit collection does not exist or is not accessible')
    return false
  }
}

async function createScheduledExitCollection(): Promise<void> {
  try {
    // Create an empty document and immediately delete it to ensure collection creation
    const tempDoc = new ScheduledExit({
      positionId: '507f1f77bcf86cd799439011', // Dummy ObjectId
      userId: '507f1f77bcf86cd799439011',
      symbol: 'TEMP',
      scheduledExitTime: '15:15',
      status: 'CANCELLED'
    })
    
    await tempDoc.save()
    await ScheduledExit.deleteOne({ _id: tempDoc._id })
    
    console.log('✅ ScheduledExit collection created successfully')
  } catch (error) {
    console.error('❌ Failed to create ScheduledExit collection:', error)
    throw error
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.email || session.user.email !== 'mail4arasu@gmail.com') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 401 })
    }

    // Get current status
    const legacyStatus = intradayScheduler.getStatus()
    const restartResistantStatus = restartResistantScheduler.getStatus()
    
    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      status: {
        legacy: legacyStatus,
        restartResistant: restartResistantStatus
      }
    })
    
  } catch (error) {
    return NextResponse.json({ 
      error: 'Failed to get scheduler status',
      details: error.message 
    }, { status: 500 })
  }
}