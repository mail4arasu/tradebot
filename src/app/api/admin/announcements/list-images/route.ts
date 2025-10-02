import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import clientPromise from '@/lib/mongodb'
import { readdir, stat } from 'fs/promises'
import { join } from 'path'

// Configure the API route
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET - List available images in uploads directory
export async function GET(request: NextRequest) {
  try {
    console.log('🔍 List images API called')
    
    const session = await getServerSession(authOptions)
    console.log('📝 Session check:', session?.user?.email || 'No session')
    
    if (!session?.user?.email) {
      console.log('❌ No session found')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const client = await clientPromise
    const db = client.db('tradebot')
    
    // Check if user is admin
    const user = await db.collection('users').findOne({ email: session.user.email })
    console.log('👤 User check:', user?.email, 'Role:', user?.role)
    
    if (!user || user.role !== 'admin') {
      console.log('❌ User not admin or not found')
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    // Read the uploads directory
    const uploadsDir = join(process.cwd(), 'public', 'uploads', 'announcements')
    console.log('📁 Checking directory:', uploadsDir)
    
    try {
      const files = await readdir(uploadsDir)
      console.log('📄 Found files:', files)
      
      // Filter for image files and get file stats
      const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp']
      const imageFiles = []
      
      for (const file of files) {
        const fileExtension = file.toLowerCase().substring(file.lastIndexOf('.'))
        if (imageExtensions.includes(fileExtension)) {
          try {
            const filePath = join(uploadsDir, file)
            const stats = await stat(filePath)
            
            imageFiles.push({
              filename: file,
              url: `/uploads/announcements/${file}`,
              size: stats.size,
              modified: stats.mtime,
              extension: fileExtension
            })
          } catch (statError) {
            console.log(`⚠️ Could not get stats for ${file}:`, statError.message)
          }
        }
      }
      
      // Sort by modification date (newest first)
      imageFiles.sort((a, b) => new Date(b.modified).getTime() - new Date(a.modified).getTime())
      
      console.log('🖼️ Image files found:', imageFiles.length)

      return NextResponse.json({
        success: true,
        images: imageFiles,
        message: `Found ${imageFiles.length} image(s)`
      })

    } catch (dirError) {
      console.log('📁 Directory read error:', dirError.message)
      return NextResponse.json({
        success: true,
        images: [],
        message: 'No images directory found or no images available'
      })
    }

  } catch (error) {
    console.error('❌ Error listing images:', error)
    return NextResponse.json(
      { error: `Failed to list images: ${error.message}` },
      { status: 500 }
    )
  }
}