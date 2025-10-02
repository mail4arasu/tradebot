import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import clientPromise from '@/lib/mongodb'
import { ObjectId } from 'mongodb'

// GET - Fetch all announcements for admin
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const client = await clientPromise
    const db = client.db('tradebot')
    
    // Check if user is admin
    const user = await db.collection('users').findOne({ email: session.user.email })
    if (!user || user.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    // Fetch all announcements sorted by creation date (newest first)
    const announcements = await db.collection('announcements')
      .find({})
      .sort({ createdAt: -1 })
      .toArray()

    const formattedAnnouncements = announcements.map(announcement => ({
      _id: announcement._id.toString(),
      title: announcement.title,
      content: announcement.content,
      type: announcement.type,
      isActive: announcement.isActive,
      imageUrl: announcement.imageUrl,
      createdAt: announcement.createdAt,
      updatedAt: announcement.updatedAt
    }))

    return NextResponse.json({ 
      announcements: formattedAnnouncements 
    })

  } catch (error) {
    console.error('❌ Error fetching announcements:', error)
    return NextResponse.json(
      { error: 'Failed to fetch announcements' },
      { status: 500 }
    )
  }
}

// POST - Create new announcement
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const client = await clientPromise
    const db = client.db('tradebot')
    
    // Check if user is admin
    const user = await db.collection('users').findOne({ email: session.user.email })
    if (!user || user.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const { title, content, type, imageUrl } = await request.json()

    if (!title || !content || !type) {
      return NextResponse.json(
        { error: 'Missing required fields: title, content, type' },
        { status: 400 }
      )
    }

    if (!['announcement', 'advertisement'].includes(type)) {
      return NextResponse.json(
        { error: 'Type must be either "announcement" or "advertisement"' },
        { status: 400 }
      )
    }

    const announcement = {
      title,
      content,
      type,
      imageUrl: imageUrl || null,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: user._id
    }

    const result = await db.collection('announcements').insertOne(announcement)

    return NextResponse.json({
      success: true,
      message: 'Announcement created successfully',
      announcementId: result.insertedId.toString()
    })

  } catch (error) {
    console.error('❌ Error creating announcement:', error)
    return NextResponse.json(
      { error: 'Failed to create announcement' },
      { status: 500 }
    )
  }
}

// PUT - Update announcement
export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const client = await clientPromise
    const db = client.db('tradebot')
    
    // Check if user is admin
    const user = await db.collection('users').findOne({ email: session.user.email })
    if (!user || user.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const { announcementId, title, content, type, isActive, imageUrl } = await request.json()

    if (!announcementId) {
      return NextResponse.json(
        { error: 'Missing announcementId' },
        { status: 400 }
      )
    }

    const updateData: any = { updatedAt: new Date() }
    
    if (title !== undefined) updateData.title = title
    if (content !== undefined) updateData.content = content
    if (type !== undefined) {
      if (!['announcement', 'advertisement'].includes(type)) {
        return NextResponse.json(
          { error: 'Type must be either "announcement" or "advertisement"' },
          { status: 400 }
        )
      }
      updateData.type = type
    }
    if (isActive !== undefined) updateData.isActive = isActive
    if (imageUrl !== undefined) updateData.imageUrl = imageUrl

    const result = await db.collection('announcements').findOneAndUpdate(
      { _id: new ObjectId(announcementId) },
      { $set: updateData },
      { returnDocument: 'after' }
    )

    if (!result) {
      return NextResponse.json(
        { error: 'Announcement not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Announcement updated successfully'
    })

  } catch (error) {
    console.error('❌ Error updating announcement:', error)
    return NextResponse.json(
      { error: 'Failed to update announcement' },
      { status: 500 }
    )
  }
}

// DELETE - Delete announcement
export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const client = await clientPromise
    const db = client.db('tradebot')
    
    // Check if user is admin
    const user = await db.collection('users').findOne({ email: session.user.email })
    if (!user || user.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const announcementId = searchParams.get('announcementId')

    if (!announcementId) {
      return NextResponse.json(
        { error: 'Missing announcementId' },
        { status: 400 }
      )
    }

    const result = await db.collection('announcements').findOneAndDelete({ 
      _id: new ObjectId(announcementId) 
    })

    if (!result) {
      return NextResponse.json(
        { error: 'Announcement not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Announcement deleted successfully'
    })

  } catch (error) {
    console.error('❌ Error deleting announcement:', error)
    return NextResponse.json(
      { error: 'Failed to delete announcement' },
      { status: 500 }
    )
  }
}