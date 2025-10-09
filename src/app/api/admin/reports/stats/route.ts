import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import dbConnect from '@/lib/mongoose'
import User from '@/models/User'
import Trade from '@/models/Trade'

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    // Check if user is admin
    const isAdmin = session.user.email === 'mail4arasu@gmail.com'
    if (!isAdmin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }
    
    await dbConnect()
    
    // Get basic statistics for the reports dashboard
    const [userCount, tradeStats] = await Promise.all([
      User.countDocuments(),
      Trade.aggregate([
        {
          $group: {
            _id: null,
            totalTrades: { $sum: 1 },
            totalTurnover: { $sum: '$turnover' },
            totalCharges: { $sum: '$charges.totalCharges' }
          }
        }
      ])
    ])
    
    const stats = tradeStats[0] || {
      totalTrades: 0,
      totalTurnover: 0,
      totalCharges: 0
    }
    
    return NextResponse.json({
      success: true,
      stats: {
        totalUsers: userCount,
        totalTrades: stats.totalTrades,
        totalTurnover: stats.totalTurnover || 0,
        totalCharges: stats.totalCharges || 0,
        lastReportGenerated: new Date().toISOString() // Placeholder
      }
    })
    
  } catch (error) {
    console.error('Error fetching report stats:', error)
    return NextResponse.json(
      { error: 'Failed to fetch report statistics' },
      { status: 500 }
    )
  }
}