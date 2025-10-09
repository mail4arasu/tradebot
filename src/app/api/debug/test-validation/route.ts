import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import dbConnect from '@/lib/mongoose'
import { validatePositionInZerodha } from '@/utils/positionValidation'
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
    
    const url = new URL(request.url)
    const positionId = url.searchParams.get('positionId')
    
    console.log('🧪 Testing position validation...')
    
    // Get open positions
    const client = await clientPromise
    const db = client.db('tradebot')
    
    let positionsToTest = []
    
    if (positionId) {
      // Test specific position
      const position = await db.collection('positions').findOne({ 
        _id: new ObjectId(positionId) 
      })
      if (position) positionsToTest = [position]
    } else {
      // Test all open positions
      positionsToTest = await db.collection('positions').find({
        status: { $in: ['OPEN', 'PARTIAL'] }
      }).limit(10).toArray()
    }
    
    console.log(`🧪 Testing validation for ${positionsToTest.length} positions`)
    
    const validationResults = await Promise.all(
      positionsToTest.map(async (position) => {
        const startTime = Date.now()
        
        try {
          console.log(`🔍 Testing validation for position ${position._id}`)
          
          // Test the validation function
          const validationResult = await validatePositionInZerodha(position)
          
          const endTime = Date.now()
          const duration = endTime - startTime
          
          // Get user info
          const user = await db.collection('users').findOne({ _id: position.userId })
          
          return {
            positionId: position._id.toString(),
            symbol: position.symbol,
            exchange: position.exchange,
            userEmail: user?.email || 'Unknown',
            status: position.status,
            scheduledExitTime: position.scheduledExitTime,
            autoSquareOffScheduled: position.autoSquareOffScheduled,
            
            // Validation results
            validation: {
              existsInZerodha: validationResult.existsInZerodha,
              zerodhaQuantity: validationResult.zerodhaQuantity,
              zerodhaPrice: validationResult.zerodhaPrice,
              zerodhaPnl: validationResult.zerodhaPnl,
              validationError: validationResult.validationError,
              duration: `${duration}ms`,
              rawZerodhaData: validationResult.rawZerodhaData
            },
            
            // Analysis
            analysis: {
              shouldAutoExit: validationResult.existsInZerodha,
              wouldBeReconciled: !validationResult.existsInZerodha,
              validationPassed: !validationResult.validationError,
              reasonForFailure: validationResult.validationError || 
                               (!validationResult.existsInZerodha ? 'Position not found in Zerodha' : null)
            }
          }
          
        } catch (error) {
          const endTime = Date.now()
          const duration = endTime - startTime
          
          return {
            positionId: position._id.toString(),
            symbol: position.symbol,
            exchange: position.exchange,
            status: position.status,
            
            validation: {
              existsInZerodha: false,
              validationError: error.message,
              duration: `${duration}ms`
            },
            
            analysis: {
              shouldAutoExit: false,
              wouldBeReconciled: true,
              validationPassed: false,
              reasonForFailure: `Validation function threw error: ${error.message}`
            }
          }
        }
      })
    )
    
    // Summary analysis
    const summary = {
      totalTested: validationResults.length,
      passedValidation: validationResults.filter(r => r.validation.existsInZerodha).length,
      failedValidation: validationResults.filter(r => !r.validation.existsInZerodha).length,
      hadErrors: validationResults.filter(r => r.validation.validationError).length,
      wouldAutoExit: validationResults.filter(r => r.analysis.shouldAutoExit).length,
      wouldBeReconciled: validationResults.filter(r => r.analysis.wouldBeReconciled).length
    }
    
    const commonErrors = validationResults
      .filter(r => r.validation.validationError)
      .map(r => r.validation.validationError)
      .reduce((acc, error) => {
        acc[error] = (acc[error] || 0) + 1
        return acc
      }, {})
    
    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      summary,
      commonErrors,
      validationResults,
      explanation: {
        purpose: "This test shows exactly why auto-exit validation is failing",
        interpretation: {
          "existsInZerodha: true": "Position would auto-exit successfully",
          "existsInZerodha: false": "Position would be reconciled as externally closed",
          "validationError present": "API call failed, position marked as externally closed"
        }
      }
    })
    
  } catch (error) {
    console.error('❌ Error testing validation:', error)
    return NextResponse.json({ 
      error: 'Failed to test validation',
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

    const { action, positionIds } = await request.json()
    
    if (action === 'reset_scheduled_flags') {
      const client = await clientPromise
      const db = client.db('tradebot')
      
      // Reset autoSquareOffScheduled flag for specified positions
      const query = positionIds?.length > 0 
        ? { _id: { $in: positionIds.map(id => new ObjectId(id)) } }
        : { 
            status: { $in: ['OPEN', 'PARTIAL'] },
            autoSquareOffScheduled: true 
          }
      
      const result = await db.collection('positions').updateMany(
        query,
        { $set: { autoSquareOffScheduled: false } }
      )
      
      return NextResponse.json({
        success: true,
        message: `Reset autoSquareOffScheduled flag for ${result.modifiedCount} positions`,
        modifiedCount: result.modifiedCount
      })
    }
    
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    
  } catch (error) {
    console.error('❌ Error in validation test POST:', error)
    return NextResponse.json({ 
      error: 'Failed to execute action',
      details: error.message 
    }, { status: 500 })
  }
}