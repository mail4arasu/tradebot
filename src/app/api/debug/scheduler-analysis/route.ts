import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import dbConnect from '@/lib/mongoose'
import { intradayScheduler } from '@/services/intradayScheduler'
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
    
    console.log('🔍 Analyzing scheduler issues...')
    
    // Get scheduler status
    const schedulerStatus = intradayScheduler.getStatus()
    
    // Get current time info
    const now = new Date()
    const istTime = new Date(now.toLocaleString("en-US", {timeZone: "Asia/Kolkata"}))
    
    // Get open intraday positions from database
    const client = await clientPromise
    const db = client.db('tradebot')
    
    const openPositions = await db.collection('positions').find({
      status: { $in: ['OPEN', 'PARTIAL'] }
    }).toArray()
    
    // Analyze each position in detail
    const positionAnalysis = await Promise.all(
      openPositions.map(async (position) => {
        const user = await db.collection('users').findOne({ _id: new ObjectId(position.userId) })
        const bot = await db.collection('bots').findOne({ _id: new ObjectId(position.botId) })
        
        // Time analysis
        const timeAnalysis = analyzeExitTime(position.scheduledExitTime, istTime)
        
        // Check why position might not be scheduled
        const schedulingIssues = []
        if (!position.isIntraday) schedulingIssues.push('Not marked as intraday')
        if (!position.scheduledExitTime) schedulingIssues.push('No scheduled exit time')
        if (position.autoSquareOffScheduled) schedulingIssues.push('Already marked as scheduled')
        if (position.status !== 'OPEN' && position.status !== 'PARTIAL') schedulingIssues.push(`Status is ${position.status}`)
        
        return {
          positionId: position._id.toString(),
          symbol: position.symbol,
          userEmail: user?.email || 'Unknown',
          botName: bot?.name || 'Unknown',
          status: position.status,
          isIntraday: position.isIntraday,
          scheduledExitTime: position.scheduledExitTime,
          autoSquareOffScheduled: position.autoSquareOffScheduled,
          currentQuantity: position.currentQuantity,
          createdAt: position.createdAt,
          
          // Analysis
          timeAnalysis,
          schedulingIssues,
          isScheduledInSystem: schedulerStatus.scheduledPositions.includes(position._id.toString()),
          
          // Detailed checks
          checks: {
            hasIntradayFlag: !!position.isIntraday,
            hasExitTime: !!position.scheduledExitTime,
            isNotAlreadyScheduled: !position.autoSquareOffScheduled,
            isOpenOrPartial: ['OPEN', 'PARTIAL'].includes(position.status),
            passesAllChecks: !!position.isIntraday && 
                           !!position.scheduledExitTime && 
                           !position.autoSquareOffScheduled && 
                           ['OPEN', 'PARTIAL'].includes(position.status)
          }
        }
      })
    )
    
    // Summary analysis
    const summary = {
      totalPositions: openPositions.length,
      intradayPositions: openPositions.filter(p => p.isIntraday).length,
      withExitTime: openPositions.filter(p => p.scheduledExitTime).length,
      alreadyScheduled: openPositions.filter(p => p.autoSquareOffScheduled).length,
      eligibleForScheduling: positionAnalysis.filter(p => p.checks.passesAllChecks).length,
      actuallyScheduled: schedulerStatus.scheduledExits,
      
      // Issues found
      missingIntradayFlag: positionAnalysis.filter(p => !p.checks.hasIntradayFlag).length,
      missingExitTime: positionAnalysis.filter(p => !p.checks.hasExitTime).length,
      alreadyMarkedScheduled: positionAnalysis.filter(p => !p.checks.isNotAlreadyScheduled).length,
      wrongStatus: positionAnalysis.filter(p => !p.checks.isOpenOrPartial).length
    }
    
    return NextResponse.json({
      success: true,
      timestamp: {
        server: now.toISOString(),
        ist: istTime.toISOString(),
        istString: istTime.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
      },
      scheduler: {
        ...schedulerStatus,
        schedulingLogic: {
          query: "{ isIntraday: true, status: { $in: ['OPEN', 'PARTIAL'] }, scheduledExitTime: { $exists: true } }",
          additionalFilter: "!position.autoSquareOffScheduled"
        }
      },
      summary,
      positionAnalysis,
      recommendations: generateRecommendations(summary, positionAnalysis)
    })
    
  } catch (error) {
    console.error('❌ Error analyzing scheduler:', error)
    return NextResponse.json({ 
      error: 'Failed to analyze scheduler',
      details: error.message 
    }, { status: 500 })
  }
}

function analyzeExitTime(exitTimeString: string | null, currentTime: Date) {
  if (!exitTimeString) {
    return {
      hasExitTime: false,
      exitTimeString: null,
      exitTimePassed: false,
      timeUntilExit: null,
      shouldExecuteImmediately: false
    }
  }
  
  try {
    const [hours, minutes] = exitTimeString.split(':').map(Number)
    const exitTime = new Date(currentTime)
    exitTime.setHours(hours, minutes, 0, 0)
    
    const diffMs = exitTime.getTime() - currentTime.getTime()
    const exitTimePassed = diffMs <= 0
    
    let timeUntilExit = null
    if (!exitTimePassed) {
      const diffMins = Math.floor(diffMs / 60000)
      const diffHours = Math.floor(diffMins / 60)
      const remainingMins = diffMins % 60
      timeUntilExit = diffHours > 0 ? `${diffHours}h ${remainingMins}m` : `${remainingMins}m`
    }
    
    return {
      hasExitTime: true,
      exitTimeString,
      exitTimePassed,
      timeUntilExit,
      shouldExecuteImmediately: exitTimePassed,
      exitTimeCalculated: exitTime.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
      timeDiffMs: diffMs
    }
  } catch (error) {
    return {
      hasExitTime: true,
      exitTimeString,
      exitTimePassed: false,
      timeUntilExit: null,
      shouldExecuteImmediately: false,
      error: `Invalid time format: ${error.message}`
    }
  }
}

function generateRecommendations(summary: any, positionAnalysis: any[]) {
  const recommendations = []
  
  if (summary.missingIntradayFlag > 0) {
    recommendations.push({
      issue: `${summary.missingIntradayFlag} positions missing isIntraday flag`,
      solution: "Update positions to set isIntraday: true",
      severity: "high",
      positions: positionAnalysis.filter(p => !p.checks.hasIntradayFlag).map(p => p.positionId)
    })
  }
  
  if (summary.missingExitTime > 0) {
    recommendations.push({
      issue: `${summary.missingExitTime} positions missing scheduledExitTime`,
      solution: "Set scheduledExitTime (e.g., '15:15') for intraday positions",
      severity: "high",
      positions: positionAnalysis.filter(p => !p.checks.hasExitTime).map(p => p.positionId)
    })
  }
  
  if (summary.alreadyMarkedScheduled > 0) {
    recommendations.push({
      issue: `${summary.alreadyMarkedScheduled} positions already marked as scheduled`,
      solution: "These positions might have failed during execution. Check logs and reset autoSquareOffScheduled flag",
      severity: "medium",
      positions: positionAnalysis.filter(p => !p.checks.isNotAlreadyScheduled).map(p => p.positionId)
    })
  }
  
  if (summary.eligibleForScheduling > summary.actuallyScheduled) {
    recommendations.push({
      issue: `${summary.eligibleForScheduling} positions eligible but only ${summary.actuallyScheduled} actually scheduled`,
      solution: "Restart scheduler or check for initialization issues",
      severity: "high"
    })
  }
  
  // Check for positions that should have executed immediately
  const overduePositions = positionAnalysis.filter(p => 
    p.timeAnalysis.shouldExecuteImmediately && p.checks.passesAllChecks
  )
  
  if (overduePositions.length > 0) {
    recommendations.push({
      issue: `${overduePositions.length} positions should have executed immediately (exit time passed)`,
      solution: "Check executeAutoExit function and Zerodha API connectivity",
      severity: "critical",
      positions: overduePositions.map(p => p.positionId)
    })
  }
  
  return recommendations
}