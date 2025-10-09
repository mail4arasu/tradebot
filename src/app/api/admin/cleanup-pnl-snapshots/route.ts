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
        
        // Find all snapshots grouped by userId and date
        const duplicates = await DailyPnLSnapshot.aggregate([
          {
            $group: {
              _id: { userId: '$userId', date: '$date' },
              count: { $sum: 1 },
              docs: { $push: '$_id' },
              snapshots: { $push: '$$ROOT' }
            }
          },
          {
            $match: { count: { $gt: 1 } }
          }
        ])

        let removedCount = 0
        const removalLog = []

        for (const duplicate of duplicates) {
          // Sort by snapshotTime descending (keep the latest)
          const sortedSnapshots = duplicate.snapshots.sort((a: any, b: any) => 
            new Date(b.snapshotTime).getTime() - new Date(a.snapshotTime).getTime()
          )
          
          // Keep the first (latest) snapshot, remove the rest
          const toKeep = sortedSnapshots[0]
          const toRemove = sortedSnapshots.slice(1)
          
          for (const snapshot of toRemove) {
            await DailyPnLSnapshot.deleteOne({ _id: snapshot._id })
            removedCount++
            removalLog.push({
              date: snapshot.date,
              userId: snapshot.userId,
              snapshotTime: snapshot.snapshotTime,
              totalDayPnL: snapshot.totalDayPnL
            })
          }
          
          console.log(`🗑️ Kept latest snapshot for ${duplicate._id.date}, removed ${toRemove.length} duplicates`)
        }

        return NextResponse.json({
          success: true,
          message: `Removed ${removedCount} duplicate snapshots`,
          details: {
            duplicateGroups: duplicates.length,
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