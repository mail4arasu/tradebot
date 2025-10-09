import { NextRequest, NextResponse } from 'next/server'
import { sendEmail, createTestEmailTemplate, verifyEmailConfig } from '@/lib/email'

// Direct email test endpoint (temporary for testing)
export async function POST(request: NextRequest) {
  try {
    console.log('🧪 Direct email test initiated')

    const { testEmail, secret } = await request.json()
    
    // Simple secret protection
    if (secret !== 'test-email-niveshawealth-2025') {
      return NextResponse.json({ error: 'Invalid secret' }, { status: 401 })
    }

    if (!testEmail) {
      return NextResponse.json({ error: 'Test email address is required' }, { status: 400 })
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(testEmail)) {
      return NextResponse.json({ error: 'Invalid email format' }, { status: 400 })
    }

    console.log(`📧 Testing email to: ${testEmail}`)

    // Check environment variables
    console.log('📋 Email configuration:')
    console.log(`  EMAIL_HOST: ${process.env.EMAIL_HOST || 'Not set'}`)
    console.log(`  EMAIL_PORT: ${process.env.EMAIL_PORT || 'Not set'}`)
    console.log(`  EMAIL_USER: ${process.env.EMAIL_USER || 'Not set'}`)
    console.log(`  EMAIL_PASS: ${process.env.EMAIL_PASS ? 'Set' : 'Not set'}`)
    console.log(`  EMAIL_SECURE: ${process.env.EMAIL_SECURE || 'Not set'}`)

    // First verify email configuration
    console.log('🔍 Verifying email configuration...')
    const configValid = await verifyEmailConfig()
    if (!configValid) {
      return NextResponse.json({ 
        error: 'Email configuration failed. Check SMTP settings.',
        debug: {
          smtpHost: process.env.EMAIL_HOST || 'smtppro.zoho.in',
          smtpPort: process.env.EMAIL_PORT || '465',
          smtpEmail: process.env.EMAIL_USER || 'Not configured',
          smtpPassword: process.env.EMAIL_PASS ? 'Configured' : 'Not configured',
          smtpSecure: process.env.EMAIL_SECURE || 'Not configured'
        }
      }, { status: 500 })
    }

    console.log('✅ Email configuration verified')

    // Create and send test email
    console.log('📧 Creating test email template...')
    const emailTemplate = createTestEmailTemplate(testEmail)
    
    console.log('📤 Sending test email...')
    const result = await sendEmail(emailTemplate)

    if (result.success) {
      console.log(`✅ Test email sent successfully to ${testEmail}`)
      return NextResponse.json({
        success: true,
        message: `Test email sent successfully to ${testEmail}`,
        messageId: result.messageId,
        timestamp: new Date().toISOString(),
        emailConfig: {
          host: process.env.EMAIL_HOST,
          port: process.env.EMAIL_PORT,
          user: process.env.EMAIL_USER,
          secure: process.env.EMAIL_SECURE
        }
      })
    } else {
      console.error(`❌ Failed to send test email:`, result.error)
      return NextResponse.json({
        error: 'Failed to send test email',
        details: result.error
      }, { status: 500 })
    }

  } catch (error) {
    console.error('❌ Direct email test error:', error)
    return NextResponse.json({
      error: 'Failed to test email',
      details: error.message,
      stack: error.stack
    }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'Direct email test endpoint',
    usage: 'POST with { "testEmail": "user@example.com", "secret": "test-email-niveshawealth-2025" }',
    purpose: 'Testing email functionality without authentication'
  })
}