import { NextRequest, NextResponse } from 'next/server'
import clientPromise from '@/lib/mongodb'

// GET - Fetch public announcements for signin page
export async function GET(request: NextRequest) {
  try {
    const client = await clientPromise
    const db = client.db('tradebot')
    
    // Fetch active announcements sorted by creation date (newest first)
    const announcements = await db.collection('announcements')
      .find({ 
        isActive: true 
      })
      .sort({ createdAt: -1 })
      .limit(10) // Limit to 10 most recent announcements
      .toArray()

    const formattedAnnouncements = announcements.map(announcement => ({
      _id: announcement._id.toString(),
      title: announcement.title,
      content: announcement.content,
      type: announcement.type,
      isActive: announcement.isActive,
      imageUrl: announcement.imageUrl,
      createdAt: announcement.createdAt
    }))

    return NextResponse.json({ 
      announcements: formattedAnnouncements 
    })

  } catch (error) {
    console.error('❌ Error fetching public announcements:', error)
    return NextResponse.json(
      { error: 'Failed to fetch announcements' },
      { status: 500 }
    )
  }
}