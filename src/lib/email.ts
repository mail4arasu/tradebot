import nodemailer from 'nodemailer'

// Email configuration for Zoho
const transporter = nodemailer.createTransporter({
  host: process.env.EMAIL_HOST || 'smtppro.zoho.in',
  port: parseInt(process.env.EMAIL_PORT || '465'),
  secure: process.env.EMAIL_SECURE === 'true', // true for 465, false for other ports
  auth: {
    user: process.env.EMAIL_USER, // niveshawealth@niveshawealth.in
    pass: process.env.EMAIL_PASS, // Password from Zoho
  },
  tls: {
    rejectUnauthorized: false
  }
})

export interface EmailTemplate {
  to: string
  subject: string
  html: string
  text?: string
}

export async function sendEmail({ to, subject, html, text }: EmailTemplate) {
  try {
    console.log(`📧 Sending email to: ${to}`)
    console.log(`📧 Subject: ${subject}`)

    const mailOptions = {
      from: {
        name: 'TradeBot Portal',
        address: process.env.EMAIL_USER || 'niveshawealth@niveshawealth.in'
      },
      to,
      subject,
      html,
      text: text || html.replace(/<[^>]*>/g, '') // Strip HTML for text version
    }

    const result = await transporter.sendMail(mailOptions)
    
    console.log(`✅ Email sent successfully:`, result.messageId)
    return {
      success: true,
      messageId: result.messageId
    }

  } catch (error) {
    console.error('❌ Email sending failed:', error)
    return {
      success: false,
      error: error.message
    }
  }
}

// Test email template
export function createTestEmailTemplate(recipientEmail: string): EmailTemplate {
  return {
    to: recipientEmail,
    subject: 'TradeBot Portal - Email Configuration Test',
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <title>Email Test</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; padding: 20px; }
            .container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; padding: 40px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
            .header { text-align: center; margin-bottom: 30px; }
            .logo { font-size: 24px; font-weight: bold; color: #2563eb; margin-bottom: 10px; }
            .content { color: #374151; line-height: 1.6; }
            .success { background: #f0fdf4; border: 1px solid #22c55e; border-radius: 6px; padding: 16px; margin: 20px 0; }
            .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; text-align: center; color: #6b7280; font-size: 14px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <div class="logo">📈 TradeBot Portal</div>
              <h2 style="color: #1f2937; margin: 0;">Email Configuration Test</h2>
            </div>
            
            <div class="content">
              <div class="success">
                <h3 style="margin: 0 0 10px 0; color: #22c55e;">✅ Success!</h3>
                <p style="margin: 0; color: #16a34a;">Email system is working correctly.</p>
              </div>
              
              <p>Hello,</p>
              
              <p>This is a test email to verify that the TradeBot Portal email system is configured correctly with Zoho SMTP.</p>
              
              <p><strong>Email Details:</strong></p>
              <ul>
                <li>From: niveshawealth@niveshawealth.in</li>
                <li>To: ${recipientEmail}</li>
                <li>SMTP Provider: Zoho</li>
                <li>Timestamp: ${new Date().toLocaleString()}</li>
              </ul>
              
              <p>If you received this email, the system is ready for:</p>
              <ul>
                <li>Password reset requests</li>
                <li>Account notifications</li>
                <li>Trading alerts</li>
                <li>System announcements</li>
              </ul>
              
              <p>Next steps: Implementing password recovery and user profile features.</p>
            </div>
            
            <div class="footer">
              <p>TradeBot Portal - Automated Trading Platform</p>
              <p><a href="https://niveshawealth.in" style="color: #2563eb;">https://niveshawealth.in</a></p>
            </div>
          </div>
        </body>
      </html>
    `,
    text: `
TradeBot Portal - Email Configuration Test

✅ Success! Email system is working correctly.

Hello,

This is a test email to verify that the TradeBot Portal email system is configured correctly with Zoho SMTP.

Email Details:
- From: niveshawealth@niveshawealth.in  
- To: ${recipientEmail}
- SMTP Provider: Zoho
- Timestamp: ${new Date().toLocaleString()}

If you received this email, the system is ready for:
- Password reset requests
- Account notifications  
- Trading alerts
- System announcements

Next steps: Implementing password recovery and user profile features.

TradeBot Portal - Automated Trading Platform
https://niveshawealth.in
    `
  }
}

// Password reset email template
export function createPasswordResetEmailTemplate(email: string, resetToken: string, resetUrl: string): EmailTemplate {
  return {
    to: email,
    subject: 'TradeBot Portal - Password Reset Request',
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <title>Password Reset</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; padding: 20px; }
            .container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; padding: 40px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
            .header { text-align: center; margin-bottom: 30px; }
            .logo { font-size: 24px; font-weight: bold; color: #2563eb; margin-bottom: 10px; }
            .content { color: #374151; line-height: 1.6; }
            .button { display: inline-block; background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 500; margin: 20px 0; }
            .warning { background: #fef3c7; border: 1px solid #f59e0b; border-radius: 6px; padding: 16px; margin: 20px 0; color: #92400e; }
            .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; text-align: center; color: #6b7280; font-size: 14px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <div class="logo">🔐 TradeBot Portal</div>
              <h2 style="color: #1f2937; margin: 0;">Password Reset Request</h2>
            </div>
            
            <div class="content">
              <p>Hello,</p>
              
              <p>We received a request to reset your password for your TradeBot Portal account.</p>
              
              <p>Click the button below to reset your password:</p>
              
              <div style="text-align: center;">
                <a href="${resetUrl}" class="button">Reset Password</a>
              </div>
              
              <p>Or copy and paste this link into your browser:</p>
              <p style="word-break: break-all; background: #f3f4f6; padding: 10px; border-radius: 4px; font-family: monospace;">${resetUrl}</p>
              
              <div class="warning">
                <p style="margin: 0;"><strong>⚠️ Security Notice:</strong></p>
                <ul style="margin: 10px 0 0 0;">
                  <li>This link expires in 1 hour</li>
                  <li>Can only be used once</li>
                  <li>If you didn't request this, please ignore this email</li>
                </ul>
              </div>
              
              <p>For security, we recommend:</p>
              <ul>
                <li>Use a strong, unique password</li>
                <li>Don't share your login credentials</li>
                <li>Log out from shared devices</li>
              </ul>
            </div>
            
            <div class="footer">
              <p>TradeBot Portal - Automated Trading Platform</p>
              <p><a href="https://niveshawealth.in" style="color: #2563eb;">https://niveshawealth.in</a></p>
              <p>If you need help, contact us at niveshawealth@niveshawealth.in</p>
            </div>
          </div>
        </body>
      </html>
    `,
    text: `
TradeBot Portal - Password Reset Request

Hello,

We received a request to reset your password for your TradeBot Portal account.

Reset your password by visiting: ${resetUrl}

⚠️ Security Notice:
- This link expires in 1 hour
- Can only be used once  
- If you didn't request this, please ignore this email

For security, we recommend:
- Use a strong, unique password
- Don't share your login credentials
- Log out from shared devices

TradeBot Portal - Automated Trading Platform
https://niveshawealth.in

If you need help, contact us at niveshawealth@niveshawealth.in
    `
  }
}

// Verify transporter configuration
export async function verifyEmailConfig() {
  try {
    await transporter.verify()
    console.log('✅ Email configuration verified successfully')
    return true
  } catch (error) {
    console.error('❌ Email configuration failed:', error)
    return false
  }
}