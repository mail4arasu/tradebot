import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import clientPromise from '@/lib/mongodb'
import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { randomUUID } from 'crypto'

// Configure the API route to handle base64 uploads
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30 // 30 seconds timeout

// POST - Upload image as base64 for announcements
export async function POST(request: NextRequest) {
  try {
    console.log('🔍 Base64 Upload API called')
    
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

    const { imageData, fileName, fileType } = await request.json()
    
    if (!imageData || !fileName || !fileType) {
      return NextResponse.json({ error: 'Missing required fields: imageData, fileName, fileType' }, { status: 400 })
    }

    console.log('📎 File received:', fileName, 'Type:', fileType)

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp']
    if (!allowedTypes.includes(fileType)) {
      return NextResponse.json({ 
        error: 'Invalid file type. Only JPEG, PNG, GIF, and WebP files are allowed.' 
      }, { status: 400 })
    }

    // Convert base64 to buffer
    const base64Data = imageData.replace(/^data:image\/\w+;base64,/, '')
    const buffer = Buffer.from(base64Data, 'base64')
    
    console.log('📏 Buffer size:', buffer.length, 'bytes')

    // Validate file size (max 1MB)
    const maxFileSize = 1 * 1024 * 1024 // 1MB
    if (buffer.length > maxFileSize) {
      console.log('❌ File size exceeds limit:', buffer.length, 'bytes')
      return NextResponse.json({ 
        error: 'File too large. Maximum size is 1MB.' 
      }, { status: 400 })
    }

    // Generate unique filename
    const fileExtension = fileName.split('.').pop() || 'png'
    const uniqueFilename = `announcement-${randomUUID()}.${fileExtension}`
    
    // Create uploads directory if it doesn't exist
    const uploadsDir = join(process.cwd(), 'public', 'uploads', 'announcements')
    await mkdir(uploadsDir, { recursive: true })

    // Save file
    console.log('💾 Saving file...')
    const filePath = join(uploadsDir, uniqueFilename)
    console.log('📁 File path:', filePath)
    
    await writeFile(filePath, buffer)
    console.log('✅ File saved successfully')

    // Return the public URL
    const imageUrl = `/uploads/announcements/${uniqueFilename}`
    console.log('🔗 Generated URL:', imageUrl)

    return NextResponse.json({
      success: true,
      imageUrl,
      message: 'Image uploaded successfully'
    })

  } catch (error) {
    console.error('❌ Error uploading image:', error)
    return NextResponse.json(
      { error: `Failed to upload image: ${error.message}` },
      { status: 500 }
    )
  }
}