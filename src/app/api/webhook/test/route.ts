import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json()
    
    console.log('🧪 Webhook test payload received:', payload)
    
    // Simulate processing time
    await new Promise(resolve => setTimeout(resolve, 500))
    
    return NextResponse.json({
      success: true,
      message: 'Test webhook received successfully',
      receivedPayload: payload,
      timestamp: new Date().toISOString(),
      processingTime: '500ms'
    })
    
  } catch (error) {
    console.error('❌ Test webhook error:', error)
    return NextResponse.json(
      { error: 'Failed to process test webhook' },
      { status: 500 }
    )
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'Webhook Test Endpoint',
    usage: 'Send POST request with JSON payload to test webhook functionality',
    samplePayload: {
      symbol: 'NIFTY50',
      action: 'BUY',
      price: 19500,
      quantity: 25,
      strategy: 'opening_breakout',
      timestamp: new Date().toISOString(),
      passphrase: 'your_secret_passphrase'
    }
  })
}