import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import dbConnect from '@/lib/mongoose'
import OrderState from '@/models/OrderState'
import { orderMonitoringService } from '@/services/orderMonitoringService'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    // Only allow admin access
    if (!session?.user?.email || session.user.email !== 'mail4arasu@gmail.com') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 401 })
    }

    await dbConnect()
    
    const url = new URL(request.url)
    const action = url.searchParams.get('action')
    
    if (action === 'status') {
      // Get monitoring service status
      const serviceStatus = orderMonitoringService.getStatus()
      
      // Get order statistics
      const [
        totalOrders,
        pendingOrders,
        confirmedOrders,
        failedOrders,
        needsReview
      ] = await Promise.all([
        OrderState.countDocuments(),
        OrderState.countDocuments({ confirmationStatus: { $in: ['PENDING', 'CONFIRMING'] } }),
        OrderState.countDocuments({ confirmationStatus: 'CONFIRMED' }),
        OrderState.countDocuments({ confirmationStatus: 'FAILED' }),
        OrderState.countDocuments({ needsManualReview: true })
      ])
      
      return NextResponse.json({
        success: true,
        timestamp: new Date().toISOString(),
        service: serviceStatus,
        statistics: {
          total: totalOrders,
          pending: pendingOrders,
          confirmed: confirmedOrders,
          failed: failedOrders,
          needsReview: needsReview
        }
      })
    }
    
    if (action === 'orders') {
      const status = url.searchParams.get('status') || 'all'
      const limit = parseInt(url.searchParams.get('limit') || '50')
      const page = parseInt(url.searchParams.get('page') || '1')
      
      // Build query
      let query: any = {}
      if (status !== 'all') {
        if (status === 'needs_review') {
          query.needsManualReview = true
        } else {
          query.confirmationStatus = status
        }
      }
      
      // Get orders with pagination
      const orders = await OrderState.find(query)
        .populate('userId', 'name email')
        .sort({ createdAt: -1 })
        .limit(limit)
        .skip((page - 1) * limit)
      
      const total = await OrderState.countDocuments(query)
      
      return NextResponse.json({
        success: true,
        orders: orders.map(order => ({
          _id: order._id,
          orderId: order.orderId,
          symbol: order.symbol,
          orderType: order.orderType,
          transactionType: order.transactionType,
          quantity: order.quantity,
          executedQuantity: order.executedQuantity,
          executedPrice: order.executedPrice,
          confirmationStatus: order.confirmationStatus,
          executionStatus: order.executionStatus,
          error: order.error,
          needsManualReview: order.needsManualReview,
          manualReviewReason: order.manualReviewReason,
          confirmationAttempts: order.confirmationAttempts,
          totalConfirmationTime: order.totalConfirmationTime,
          user: order.userId,
          createdAt: order.createdAt,
          updatedAt: order.updatedAt
        })),
        pagination: {
          total,
          page,
          limit,
          pages: Math.ceil(total / limit)
        }
      })
    }
    
    if (action === 'order_details') {
      const orderId = url.searchParams.get('orderId')
      if (!orderId) {
        return NextResponse.json({ error: 'Order ID required' }, { status: 400 })
      }
      
      const orderState = await OrderState.findOne({ orderId })
        .populate('userId', 'name email')
        .populate('tradeExecutionId')
      
      if (!orderState) {
        return NextResponse.json({ error: 'Order not found' }, { status: 404 })
      }
      
      return NextResponse.json({
        success: true,
        order: orderState
      })
    }
    
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    
  } catch (error) {
    console.error('❌ Error in order monitoring API:', error)
    return NextResponse.json({ 
      error: 'Failed to process request',
      details: error.message 
    }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.email || session.user.email !== 'mail4arasu@gmail.com') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 401 })
    }

    await dbConnect()
    
    const { action, orderId, orderIds } = await request.json()
    
    if (action === 'start_monitoring') {
      await orderMonitoringService.start()
      return NextResponse.json({
        success: true,
        message: 'Order monitoring service started'
      })
    }
    
    if (action === 'stop_monitoring') {
      orderMonitoringService.stop()
      return NextResponse.json({
        success: true,
        message: 'Order monitoring service stopped'
      })
    }
    
    if (action === 'resolve_review') {
      if (!orderId) {
        return NextResponse.json({ error: 'Order ID required' }, { status: 400 })
      }
      
      await OrderState.findOneAndUpdate(
        { orderId },
        {
          $set: {
            needsManualReview: false,
            manualReviewReason: null
          },
          $push: {
            statusHistory: {
              status: 'MANUAL_REVIEW_RESOLVED',
              timestamp: new Date(),
              details: `Resolved by admin: ${session.user.email}`
            }
          }
        }
      )
      
      return NextResponse.json({
        success: true,
        message: `Manual review resolved for order ${orderId}`
      })
    }
    
    if (action === 'cleanup_old_orders') {
      const cutoffDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // 7 days ago
      
      const result = await OrderState.deleteMany({
        confirmationStatus: { $in: ['CONFIRMED', 'FAILED'] },
        needsManualReview: false,
        createdAt: { $lt: cutoffDate }
      })
      
      return NextResponse.json({
        success: true,
        message: `Cleaned up ${result.deletedCount} old order records`
      })
    }
    
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    
  } catch (error) {
    console.error('❌ Error in order monitoring POST:', error)
    return NextResponse.json({ 
      error: 'Failed to execute action',
      details: error.message 
    }, { status: 500 })
  }
}