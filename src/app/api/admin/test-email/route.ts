import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { isAdminUser } from '@/lib/admin'
import { sendEmail, createTestEmailTemplate, verifyEmailConfig } from '@/lib/email'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check if user is admin
    if (!(await isAdminUser())) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const { testEmail } = await request.json()
    
    if (!testEmail) {
      return NextResponse.json({ error: 'Test email address is required' }, { status: 400 })
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(testEmail)) {
      return NextResponse.json({ error: 'Invalid email format' }, { status: 400 })
    }

    console.log(`🧪 Testing email to: ${testEmail}`)

    // First verify email configuration
    const configValid = await verifyEmailConfig()
    if (!configValid) {
      return NextResponse.json({ 
        error: 'Email configuration failed. Check SMTP settings.',
        debug: {
          smtpHost: process.env.EMAIL_HOST || 'smtppro.zoho.in',
          smtpPort: process.env.EMAIL_PORT || '465',
          smtpEmail: process.env.EMAIL_USER || 'Not configured',
          smtpPassword: process.env.EMAIL_PASS ? 'Configured' : 'Not configured'
        }
      }, { status: 500 })
    }

    // Create and send test email
    const emailTemplate = createTestEmailTemplate(testEmail)
    const result = await sendEmail(emailTemplate)

    if (result.success) {
      return NextResponse.json({
        success: true,
        message: `Test email sent successfully to ${testEmail}`,
        messageId: result.messageId,
        timestamp: new Date().toISOString()
      })
    } else {
      return NextResponse.json({
        error: 'Failed to send test email',
        details: result.error
      }, { status: 500 })
    }

  } catch (error) {
    console.error('❌ Test email error:', error)
    return NextResponse.json({
      error: 'Failed to send test email',
      details: error.message
    }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check if user is admin
    if (!(await isAdminUser())) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    // Return email configuration status
    const configValid = await verifyEmailConfig()
    
    return NextResponse.json({
      emailConfigured: configValid,
      smtpSettings: {
        host: process.env.EMAIL_HOST || 'smtppro.zoho.in',
        port: process.env.EMAIL_PORT || '465',
        email: process.env.EMAIL_USER || 'Not configured',
        passwordConfigured: !!process.env.EMAIL_PASS
      },
      status: configValid ? 'Ready' : 'Configuration required'
    })

  } catch (error) {
    console.error('❌ Email config check error:', error)
    return NextResponse.json({
      error: 'Failed to check email configuration',
      details: error.message
    }, { status: 500 })
  }
}