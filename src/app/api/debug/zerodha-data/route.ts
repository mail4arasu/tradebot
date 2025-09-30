import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import dbConnect from '@/lib/mongoose'
import User from '@/models/User'
import { ZerodhaAPI } from '@/lib/zerodha'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await dbConnect()
    
    const user = await User.findOne({ email: session.user.email })
    
    if (!user?.zerodhaConfig?.apiKey || !user?.zerodhaConfig?.apiSecret || !user?.zerodhaConfig?.accessToken) {
      return NextResponse.json({ error: 'Zerodha credentials not found' }, { status: 400 })
    }

    try {
      const zerodhaAPI = new ZerodhaAPI(
        user.zerodhaConfig.apiKey,
        user.zerodhaConfig.apiSecret,
        user.zerodhaConfig.accessToken
      )

      console.log(`\n=== DEBUG: Testing Zerodha API for ${user.email} ===`)
      
      // Test 1: Get current trades
      console.log('Testing /trades endpoint...')
      const tradesResponse = await zerodhaAPI.getTrades()
      console.log('Trades response:', JSON.stringify(tradesResponse, null, 2))
      
      // Test 2: Get orders
      console.log('Testing /orders endpoint...')
      const ordersResponse = await zerodhaAPI.getOrders()
      console.log('Orders response structure:', {
        status: ordersResponse.status,
        dataLength: ordersResponse.data?.length || 0,
        firstOrder: ordersResponse.data?.[0] || null
      })
      
      // Test 3: Get historical trades
      const thirtyDaysAgo = new Date()
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
      const fromDate = thirtyDaysAgo.toISOString().split('T')[0]
      const toDate = new Date().toISOString().split('T')[0]
      
      console.log(`Testing historical trades from ${fromDate} to ${toDate}...`)
      const historicalResponse = await zerodhaAPI.getHistoricalTrades(fromDate, toDate)
      console.log('Historical trades response:', JSON.stringify(historicalResponse, null, 2))

      // Test 4: Filter completed orders manually
      const orders = ordersResponse.data || []
      const completedOrders = orders.filter((order: any) => 
        order.status === 'COMPLETE' && order.filled_quantity > 0
      )
      console.log(`Found ${completedOrders.length} completed orders out of ${orders.length} total orders`)
      
      if (completedOrders.length > 0) {
        console.log('Sample completed order:', JSON.stringify(completedOrders[0], null, 2))
      }

      return NextResponse.json({
        success: true,
        debug: {
          tradesEndpoint: {
            status: tradesResponse.status,
            dataCount: tradesResponse.data?.length || 0,
            sample: tradesResponse.data?.[0] || null
          },
          ordersEndpoint: {
            status: ordersResponse.status,
            totalOrders: orders.length,
            completedOrders: completedOrders.length,
            sampleCompleted: completedOrders[0] || null
          },
          historicalTrades: {
            status: historicalResponse.status,
            dataCount: historicalResponse.data?.length || 0,
            sample: historicalResponse.data?.[0] || null
          },
          dateRange: {
            from: fromDate,
            to: toDate
          }
        }
      })

    } catch (zerodhaError) {
      console.error('Zerodha API error:', zerodhaError)
      return NextResponse.json({ 
        error: 'Failed to fetch Zerodha data',
        details: zerodhaError.message 
      }, { status: 400 })
    }
  } catch (error) {
    console.error('Error in debug endpoint:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}