import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import DailyPnLSnapshot from '@/models/DailyPnLSnapshot'
import dbConnect from '@/lib/mongoose'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.email || session.user.email !== 'mail4arasu@gmail.com') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 401 })
    }

    await dbConnect()

    // Get all snapshots for analysis
    const allSnapshots = await DailyPnLSnapshot.find({})
      .populate('userId', 'name email')
      .sort({ date: -1, snapshotTime: -1 })
      .lean()

    // Group by user and date to find duplicates
    const groupedSnapshots = {}
    const duplicateAnalysis = []

    for (const snapshot of allSnapshots) {
      const key = `${snapshot.userId?._id || snapshot.userId}-${snapshot.date}`
      
      if (!groupedSnapshots[key]) {
        groupedSnapshots[key] = []
      }
      
      groupedSnapshots[key].push({
        _id: snapshot._id,
        date: snapshot.date,
        snapshotTime: snapshot.snapshotTime,
        totalDayPnL: snapshot.totalDayPnL,
        totalPortfolioValue: snapshot.totalPortfolioValue,
        dataSource: snapshot.dataSource,
        userName: snapshot.userId?.name || 'Unknown',
        userEmail: snapshot.userId?.email || 'Unknown'
      })
    }

    // Find actual duplicates
    for (const [key, snapshots] of Object.entries(groupedSnapshots)) {
      if (snapshots.length > 1) {
        duplicateAnalysis.push({
          key,
          count: snapshots.length,
          snapshots: snapshots.sort((a, b) => new Date(b.snapshotTime).getTime() - new Date(a.snapshotTime).getTime())
        })
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        totalSnapshots: allSnapshots.length,
        duplicateGroups: duplicateAnalysis.length,
        duplicateAnalysis,
        recentSnapshots: allSnapshots.slice(0, 10)
      }
    })

  } catch (error) {
    console.error('Error debugging P&L snapshots:', error)
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error.message 
    }, { status: 500 })
  }
}