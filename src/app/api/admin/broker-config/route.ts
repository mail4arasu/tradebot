import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import dbConnect from '@/lib/mongoose'
import BrokerConfig from '@/models/BrokerConfig'

// GET - Fetch current broker configuration
export async function GET() {
  try {
    await dbConnect()
    
    // Get the active broker configuration
    let config = await BrokerConfig.findOne({ isActive: true })
    
    // If no config exists, create a default one
    if (!config) {
      config = new BrokerConfig({
        isActive: true,
        version: 1,
        updatedBy: 'System'
      })
      await config.save()
      console.log('📄 Created default broker configuration')
    }
    
    return NextResponse.json({
      success: true,
      config
    })
    
  } catch (error) {
    console.error('Error fetching broker config:', error)
    return NextResponse.json(
      { error: 'Failed to fetch broker configuration' },
      { status: 500 }
    )
  }
}

// PUT - Update broker configuration (Admin only)
export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    // Check if user is admin (you can implement proper admin check)
    const isAdmin = session.user.email === 'mail4arasu@gmail.com' // Replace with proper admin check
    if (!isAdmin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }
    
    await dbConnect()
    
    const updates = await request.json()
    console.log('🔧 Updating broker configuration:', Object.keys(updates))
    
    // Find the active configuration and update it
    const config = await BrokerConfig.findOneAndUpdate(
      { isActive: true },
      {
        ...updates,
        lastUpdated: new Date(),
        updatedBy: session.user.email,
        version: { $inc: 1 } // Increment version
      },
      { 
        new: true, 
        upsert: true, // Create if doesn't exist
        setDefaultsOnInsert: true 
      }
    )
    
    console.log('✅ Broker configuration updated successfully')
    
    return NextResponse.json({
      success: true,
      message: 'Broker configuration updated successfully',
      config
    })
    
  } catch (error) {
    console.error('Error updating broker config:', error)
    return NextResponse.json(
      { error: 'Failed to update broker configuration' },
      { status: 500 }
    )
  }
}

// POST - Reset to default configuration (Admin only)
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    const isAdmin = session.user.email === 'mail4arasu@gmail.com'
    if (!isAdmin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }
    
    await dbConnect()
    
    const body = await request.json()
    const { action } = body
    
    if (action === 'reset') {
      // Delete current config and create new default
      await BrokerConfig.deleteMany({ isActive: true })
      
      const defaultConfig = new BrokerConfig({
        isActive: true,
        version: 1,
        updatedBy: session.user.email
      })
      await defaultConfig.save()
      
      console.log('🔄 Broker configuration reset to defaults')
      
      return NextResponse.json({
        success: true,
        message: 'Broker configuration reset to defaults',
        config: defaultConfig
      })
    }
    
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    
  } catch (error) {
    console.error('Error resetting broker config:', error)
    return NextResponse.json(
      { error: 'Failed to reset broker configuration' },
      { status: 500 }
    )
  }
}