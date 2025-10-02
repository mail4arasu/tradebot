import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import clientPromise from '@/lib/mongodb'
import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { randomUUID } from 'crypto'

// Configure the API route to handle larger files
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30 // 30 seconds timeout

// POST - Upload image for announcements
export async function POST(request: NextRequest) {
  try {
    console.log('🔍 Upload API called')
    console.log('🔍 Request headers:', Object.fromEntries(request.headers.entries()))
    console.log('🔍 Request cookies:', request.cookies.getAll())
    
    // Check content length first
    const contentLength = request.headers.get('content-length')
    console.log('📏 Content length:', contentLength)
    
    // Set a reasonable limit - 10MB
    const maxSize = 10 * 1024 * 1024 // 10MB
    if (contentLength && parseInt(contentLength) > maxSize) {
      console.log('❌ File too large before processing')
      return NextResponse.json({ 
        error: 'File too large. Maximum size is 10MB.' 
      }, { status: 413 })
    }
    
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

    console.log('📄 Parsing form data...')
    const formData = await request.formData()
    const file = formData.get('image') as File
    
    console.log('📎 File received:', file ? `${file.name} (${file.size} bytes, ${file.type})` : 'No file')

    if (!file) {
      console.log('❌ No file in form data')
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })
    }

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp']
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ 
        error: 'Invalid file type. Only JPEG, PNG, GIF, and WebP files are allowed.' 
      }, { status: 400 })
    }

    // Validate file size (max 2MB for better compatibility)
    const maxFileSize = 2 * 1024 * 1024 // 2MB
    if (file.size > maxFileSize) {
      console.log('❌ File size exceeds limit:', file.size, 'bytes')
      return NextResponse.json({ 
        error: 'File too large. Maximum size is 2MB.' 
      }, { status: 400 })
    }

    // Generate unique filename
    const fileExtension = file.name.split('.').pop()
    const uniqueFilename = `announcement-${randomUUID()}.${fileExtension}`
    
    // Create uploads directory if it doesn't exist
    const uploadsDir = join(process.cwd(), 'public', 'uploads', 'announcements')
    await mkdir(uploadsDir, { recursive: true })

    // Save file
    console.log('💾 Saving file...')
    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)
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
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    })
    return NextResponse.json(
      { error: `Failed to upload image: ${error.message}` },
      { status: 500 }
    )
  }
}