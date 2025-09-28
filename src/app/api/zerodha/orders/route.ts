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
    
    if (!user?.zerodhaConfig?.apiKey || !user?.zerodhaConfig?.apiSecret) {
      return NextResponse.json({ error: 'Zerodha credentials not found' }, { status: 400 })
    }

    if (!user?.zerodhaConfig?.accessToken) {
      return NextResponse.json({ 
        error: 'Access token not found. Please complete OAuth authorization first.',
        needsAuth: true 
      }, { status: 400 })
    }

    // Get query parameters for filtering (only status - no date filtering due to API limitation)
    const { searchParams } = new URL(request.url)
    const orderStatus = searchParams.get('status') // 'all', 'complete', 'open', 'cancelled'

    try {
      const zerodhaAPI = new ZerodhaAPI(
        user.zerodhaConfig.apiKey,
        user.zerodhaConfig.apiSecret,
        user.zerodhaConfig.accessToken
      )

      // Fetch orders from Zerodha (this gets all orders for the current day by default)
      // Note: Zerodha API only provides orders for the current trading day
      const ordersResponse = await zerodhaAPI.getOrders()
      console.log('Orders API response (current day only):', {
        total: ordersResponse.data?.length || 0,
        filters: { orderStatus }
      })

      let orders = ordersResponse.data || []

      // Filter by order status if specified (no date filtering - API limitation)
      if (orderStatus && orderStatus !== 'all') {
        switch (orderStatus) {
          case 'complete':
            orders = orders.filter((order: any) => order.status === 'COMPLETE')
            break
          case 'open':
            orders = orders.filter((order: any) => 
              ['OPEN', 'TRIGGER PENDING'].includes(order.status)
            )
            break
          case 'cancelled':
            orders = orders.filter((order: any) => 
              ['CANCELLED', 'REJECTED'].includes(order.status)
            )
            break
        }
      }

      // Sort orders by timestamp (newest first)
      orders.sort((a: any, b: any) => {
        const dateA = new Date(a.order_timestamp || a.exchange_timestamp)
        const dateB = new Date(b.order_timestamp || b.exchange_timestamp)
        return dateB.getTime() - dateA.getTime()
      })

      // Calculate summary statistics
      const summary = {
        total: orders.length,
        complete: orders.filter((o: any) => o.status === 'COMPLETE').length,
        open: orders.filter((o: any) => ['OPEN', 'TRIGGER PENDING'].includes(o.status)).length,
        cancelled: orders.filter((o: any) => ['CANCELLED', 'REJECTED'].includes(o.status)).length,
        totalValue: orders
          .filter((o: any) => o.status === 'COMPLETE')
          .reduce((sum: number, o: any) => sum + (o.filled_quantity * o.average_price || 0), 0)
      }

      return NextResponse.json({
        success: true,
        orders: orders,
        summary: summary,
        filters: {
          orderStatus
        }
      })

    } catch (zerodhaError) {
      console.error('Zerodha API error:', zerodhaError)
      
      return NextResponse.json({ 
        error: 'Failed to fetch orders from Zerodha. Please check your connection.' 
      }, { status: 400 })
    }
  } catch (error) {
    console.error('Error fetching orders:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}