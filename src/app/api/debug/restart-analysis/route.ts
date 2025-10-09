import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import dbConnect from '@/lib/mongoose'
import clientPromise from '@/lib/mongodb'
import { ObjectId } from 'mongodb'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    // Only allow admin access
    if (!session?.user?.email || session.user.email !== 'mail4arasu@gmail.com') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 401 })
    }

    await dbConnect()
    
    console.log('🕵️ Analyzing restart timing vs position creation...')
    
    // Get server uptime and process start time
    const processStartTime = new Date(Date.now() - process.uptime() * 1000)
    const currentTime = new Date()
    
    // Get open positions
    const client = await clientPromise
    const db = client.db('tradebot')
    
    const openPositions = await db.collection('positions').find({
      status: { $in: ['OPEN', 'PARTIAL'] }
    }).sort({ createdAt: -1 }).toArray()
    
    // Analyze each position
    const positionAnalysis = await Promise.all(
      openPositions.map(async (position) => {
        const user = await db.collection('users').findOne({ _id: position.userId })
        const bot = await db.collection('bots').findOne({ _id: position.botId })
        
        const createdAt = new Date(position.createdAt)
        const updatedAt = new Date(position.updatedAt)
        
        // Calculate time differences
        const createdBeforeRestart = createdAt < processStartTime
        const timeDiffFromRestart = createdAt.getTime() - processStartTime.getTime()
        const hoursFromRestart = timeDiffFromRestart / (1000 * 60 * 60)
        
        // Analyze scheduled exit time
        let exitTimeAnalysis = null
        if (position.scheduledExitTime) {
          const [exitHours, exitMinutes] = position.scheduledExitTime.split(':').map(Number)
          const todayExitTime = new Date()
          todayExitTime.setHours(exitHours, exitMinutes, 0, 0)
          
          const exitTimePassedSinceRestart = todayExitTime < processStartTime
          const exitTimePassedSinceCreation = todayExitTime < createdAt
          
          exitTimeAnalysis = {
            scheduledExitTime: position.scheduledExitTime,
            todayExitTime: todayExitTime.toISOString(),
            exitTimePassedSinceRestart,
            exitTimePassedSinceCreation,
            wouldHaveBeenLost: createdBeforeRestart && !exitTimePassedSinceRestart
          }
        }
        
        return {
          positionId: position._id.toString(),
          symbol: position.symbol,
          userEmail: user?.email || 'Unknown',
          botName: bot?.name || 'Unknown',
          
          // Timing analysis
          createdAt: createdAt.toISOString(),
          updatedAt: updatedAt.toISOString(),
          createdBeforeRestart,
          hoursFromRestart: parseFloat(hoursFromRestart.toFixed(2)),
          
          // Scheduler state
          autoSquareOffScheduled: position.autoSquareOffScheduled,
          scheduledExitTime: position.scheduledExitTime,
          exitTimeAnalysis,
          
          // Theory validation
          isStuckDueToRestart: createdBeforeRestart && 
                              position.autoSquareOffScheduled && 
                              position.status !== 'CLOSED',
          
          // Evidence score (0-10 scale)
          restartTheoryScore: calculateRestartTheoryScore({
            createdBeforeRestart,
            autoSquareOffScheduled: position.autoSquareOffScheduled,
            isOpen: ['OPEN', 'PARTIAL'].includes(position.status),
            exitTimeAnalysis
          })
        }
      })
    )
    
    // Get some additional system info
    const systemInfo = {
      processStartTime: processStartTime.toISOString(),
      currentTime: currentTime.toISOString(),
      uptimeHours: parseFloat((process.uptime() / 3600).toFixed(2)),
      nodeVersion: process.version,
      platform: process.platform
    }
    
    // Calculate summary statistics
    const summary = {
      totalOpenPositions: openPositions.length,
      createdBeforeRestart: positionAnalysis.filter(p => p.createdBeforeRestart).length,
      createdAfterRestart: positionAnalysis.filter(p => !p.createdBeforeRestart).length,
      autoSquareOffScheduled: positionAnalysis.filter(p => p.autoSquareOffScheduled).length,
      likelyStuckDueToRestart: positionAnalysis.filter(p => p.isStuckDueToRestart).length,
      
      // High confidence indicators
      highConfidenceStuck: positionAnalysis.filter(p => p.restartTheoryScore >= 8).length,
      mediumConfidenceStuck: positionAnalysis.filter(p => p.restartTheoryScore >= 5 && p.restartTheoryScore < 8).length
    }
    
    // Theory validation
    const theoryValidation = {
      restartTheoryLikely: summary.likelyStuckDueToRestart > 0,
      confidence: summary.likelyStuckDueToRestart > 0 ? 
        (summary.highConfidenceStuck > 0 ? 'HIGH' : 
         summary.mediumConfidenceStuck > 0 ? 'MEDIUM' : 'LOW') : 'NONE',
      
      evidence: {
        positionsCreatedBeforeRestart: summary.createdBeforeRestart > 0,
        someMarkedAsScheduled: summary.autoSquareOffScheduled > 0,
        stuckPositionsFound: summary.likelyStuckDueToRestart > 0
      }
    }
    
    // Recommendations
    const recommendations = generateRecommendations(summary, positionAnalysis)
    
    return NextResponse.json({
      success: true,
      timestamp: currentTime.toISOString(),
      systemInfo,
      summary,
      theoryValidation,
      positionAnalysis: positionAnalysis.sort((a, b) => b.restartTheoryScore - a.restartTheoryScore),
      recommendations
    })
    
  } catch (error) {
    console.error('❌ Error analyzing restart timing:', error)
    return NextResponse.json({ 
      error: 'Failed to analyze restart timing',
      details: error.message 
    }, { status: 500 })
  }
}

function calculateRestartTheoryScore(data: {
  createdBeforeRestart: boolean,
  autoSquareOffScheduled: boolean,
  isOpen: boolean,
  exitTimeAnalysis: any
}): number {
  let score = 0
  
  // Strong indicators
  if (data.createdBeforeRestart) score += 3
  if (data.autoSquareOffScheduled) score += 3
  if (data.isOpen) score += 2
  
  // Exit time analysis
  if (data.exitTimeAnalysis) {
    if (data.exitTimeAnalysis.wouldHaveBeenLost) score += 2
    if (data.exitTimeAnalysis.exitTimePassedSinceRestart) score += 1
  }
  
  return Math.min(score, 10)
}

function generateRecommendations(summary: any, positions: any[]) {
  const recommendations = []
  
  if (summary.likelyStuckDueToRestart > 0) {
    recommendations.push({
      issue: `${summary.likelyStuckDueToRestart} positions likely stuck due to restart`,
      solution: "Reset autoSquareOffScheduled flag to allow rescheduling",
      severity: "HIGH",
      action: "POST /api/debug/test-validation with action: reset_scheduled_flags",
      affectedPositions: positions.filter(p => p.isStuckDueToRestart).map(p => p.positionId)
    })
  }
  
  if (summary.createdBeforeRestart > 0) {
    recommendations.push({
      issue: "Application restart detected during trading session",
      solution: "Implement persistent scheduler state or restart-resistant scheduling",
      severity: "MEDIUM",
      improvement: "Add database-backed timeout storage or restart detection logic"
    })
  }
  
  if (summary.highConfidenceStuck > 0) {
    recommendations.push({
      issue: "High-confidence stuck positions detected",
      solution: "Immediate manual intervention required",
      severity: "CRITICAL",
      action: "Check these positions manually and execute exits if needed"
    })
  }
  
  return recommendations
}