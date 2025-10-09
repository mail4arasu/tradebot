import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import DailyPnLSnapshot from '@/models/DailyPnLSnapshot'
import dbConnect from '@/lib/mongoose'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.email || session.user.email !== 'mail4arasu@gmail.com') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 401 })
    }

    await dbConnect()

    const { action } = await request.json()

    switch (action) {
      case 'remove_duplicates':
        console.log(`🧹 Cleaning up duplicate P&L snapshots requested by ${session.user.email}`)
        
        // Get all snapshots and group manually to handle any data type issues
        const allSnapshots = await DailyPnLSnapshot.find({})
          .populate('userId', 'name email')
          .sort({ date: -1, snapshotTime: -1 })
          .lean()

        console.log(`📊 Found ${allSnapshots.length} total snapshots`)

        // Group by userId and date manually
        const groupedSnapshots = new Map()
        
        for (const snapshot of allSnapshots) {
          const userId = snapshot.userId?._id?.toString() || snapshot.userId?.toString()
          const key = `${userId}-${snapshot.date}`
          
          if (!groupedSnapshots.has(key)) {
            groupedSnapshots.set(key, [])
          }
          
          groupedSnapshots.get(key).push(snapshot)
        }

        let removedCount = 0
        const removalLog = []
        let duplicateGroups = 0

        for (const [key, snapshots] of groupedSnapshots.entries()) {
          if (snapshots.length > 1) {
            duplicateGroups++
            console.log(`🔍 Found ${snapshots.length} snapshots for key: ${key}`)
            
            // Sort by snapshotTime descending (keep the latest)
            snapshots.sort((a, b) => new Date(b.snapshotTime).getTime() - new Date(a.snapshotTime).getTime())
            
            // Keep the first (latest) snapshot, remove the rest
            const toKeep = snapshots[0]
            const toRemove = snapshots.slice(1)
            
            console.log(`✅ Keeping snapshot from ${toKeep.snapshotTime}, removing ${toRemove.length} older ones`)
            
            for (const snapshot of toRemove) {
              await DailyPnLSnapshot.deleteOne({ _id: snapshot._id })
              removedCount++
              removalLog.push({
                date: snapshot.date,
                userId: snapshot.userId?._id || snapshot.userId,
                userName: snapshot.userId?.name || 'Unknown',
                snapshotTime: snapshot.snapshotTime,
                totalDayPnL: snapshot.totalDayPnL,
                totalPortfolioValue: snapshot.totalPortfolioValue,
                dataSource: snapshot.dataSource
              })
              console.log(`🗑️ Removed snapshot: ${snapshot.date} at ${snapshot.snapshotTime}`)
            }
          }
        }

        console.log(`🎯 Cleanup complete: ${duplicateGroups} duplicate groups, ${removedCount} snapshots removed`)

        return NextResponse.json({
          success: true,
          message: `Removed ${removedCount} duplicate snapshots from ${duplicateGroups} duplicate groups`,
          details: {
            totalSnapshots: allSnapshots.length,
            duplicateGroups,
            removedSnapshots: removedCount,
            removalLog
          }
        })

      case 'get_duplicates':
        // Just return duplicate info without removing
        const duplicateInfo = await DailyPnLSnapshot.aggregate([
          {
            $group: {
              _id: { userId: '$userId', date: '$date' },
              count: { $sum: 1 },
              snapshots: { 
                $push: {
                  id: '$_id',
                  snapshotTime: '$snapshotTime',
                  totalDayPnL: '$totalDayPnL',
                  dataSource: '$dataSource'
                }
              }
            }
          },
          {
            $match: { count: { $gt: 1 } }
          },
          {
            $lookup: {
              from: 'users',
              localField: '_id.userId',
              foreignField: '_id',
              as: 'user'
            }
          }
        ])

        return NextResponse.json({
          success: true,
          duplicates: duplicateInfo
        })

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }

  } catch (error) {
    console.error('Error in P&L snapshot cleanup:', error)
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error.message 
    }, { status: 500 })
  }
}