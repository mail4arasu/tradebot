import { ObjectId } from 'mongodb'
import clientPromise from '@/lib/mongodb'
import { intradayScheduler } from '@/services/intradayScheduler'

export interface CreatePositionData {
  userId: ObjectId
  botId: ObjectId
  allocationId: ObjectId
  symbol: string
  exchange: string
  instrumentType: string
  entryExecutionId: ObjectId
  entrySignalId: ObjectId
  entryPrice: number
  entryQuantity: number
  entryTime: Date
  entryOrderId: string
  side: 'LONG' | 'SHORT'
  isIntraday: boolean
  scheduledExitTime?: string
  stopLoss?: number
  target?: number
}

export interface ExitExecutionData {
  executionId: ObjectId
  signalId: ObjectId
  quantity: number
  price: number
  orderId: string
  reason: 'SIGNAL' | 'AUTO_SQUARE_OFF' | 'EMERGENCY' | 'MANUAL'
}

/**
 * Creates a new position record
 */
export async function createPosition(data: CreatePositionData): Promise<ObjectId> {
  try {
    const client = await clientPromise
    const db = client.db('tradebot')
    
    const position = {
      ...data,
      positionId: generatePositionId(),
      status: 'OPEN',
      currentQuantity: data.entryQuantity,
      averagePrice: data.entryPrice,
      exitExecutions: [],
      unrealizedPnl: 0,
      realizedPnl: 0,
      totalFees: 0,
      autoSquareOffScheduled: false,
      createdAt: new Date(),
      updatedAt: new Date()
    }
    
    const result = await db.collection('positions').insertOne(position)
    console.log(`📊 Position created: ${result.insertedId}`)
    
    return result.insertedId
  } catch (error) {
    console.error('❌ Error creating position:', error)
    throw error
  }
}

/**
 * Updates position with exit execution
 */
export async function updatePositionWithExit(
  positionId: ObjectId, 
  exitData: ExitExecutionData
): Promise<void> {
  try {
    const client = await clientPromise
    const db = client.db('tradebot')
    
    // Get current position
    const position = await db.collection('positions').findOne({ _id: positionId })
    if (!position) {
      throw new Error(`Position not found: ${positionId}`)
    }
    
    // Create exit execution record
    const exitExecution = {
      executionId: exitData.executionId,
      signalId: exitData.signalId,
      quantity: exitData.quantity,
      price: exitData.price,
      time: new Date(),
      orderId: exitData.orderId,
      reason: exitData.reason
    }
    
    // Calculate new quantities and status
    const totalExitQuantity = position.exitExecutions.reduce(
      (sum: number, exit: any) => sum + exit.quantity, 
      0
    ) + exitData.quantity
    
    const newStatus = totalExitQuantity >= position.entryQuantity ? 'CLOSED' : 'PARTIAL'
    const remainingQuantity = position.entryQuantity - totalExitQuantity
    
    // Calculate realized P&L for this exit
    const pnlMultiplier = position.side === 'LONG' ? 1 : -1
    const realizedPnl = exitData.quantity * (exitData.price - position.averagePrice) * pnlMultiplier
    
    // Update position
    await db.collection('positions').updateOne(
      { _id: positionId },
      {
        $push: { exitExecutions: exitExecution },
        $set: {
          status: newStatus,
          currentQuantity: Math.max(0, remainingQuantity),
          realizedPnl: position.realizedPnl + realizedPnl,
          updatedAt: new Date()
        }
      }
    )
    
    // Cancel scheduled auto-exit if position is fully closed
    if (newStatus === 'CLOSED' && position.isIntraday) {
      try {
        intradayScheduler.cancelPositionExit(position.positionId)
        console.log(`🚫 Cancelled scheduled auto-exit for closed position: ${position.positionId}`)
      } catch (schedulerError) {
        console.error('⚠️ Error cancelling scheduled exit:', schedulerError)
        // Don't throw - position update was successful, scheduler error is secondary
      }
    }
    
    console.log(`📊 Position updated: ${positionId} - Status: ${newStatus}, Remaining: ${remainingQuantity}`)
  } catch (error) {
    console.error('❌ Error updating position:', error)
    throw error
  }
}

/**
 * Gets open positions for a user and bot
 */
export async function getOpenPositions(
  userId: ObjectId, 
  botId?: ObjectId
): Promise<any[]> {
  try {
    const client = await clientPromise
    const db = client.db('tradebot')
    
    const query: any = {
      userId,
      status: { $in: ['OPEN', 'PARTIAL'] }
    }
    
    if (botId) {
      query.botId = botId
    }
    
    const positions = await db.collection('positions').find(query).toArray()
    return positions
  } catch (error) {
    console.error('❌ Error fetching open positions:', error)
    throw error
  }
}

/**
 * Gets position by ID
 */
export async function getPositionById(positionId: ObjectId): Promise<any | null> {
  try {
    const client = await clientPromise
    const db = client.db('tradebot')
    
    const position = await db.collection('positions').findOne({ _id: positionId })
    return position
  } catch (error) {
    console.error('❌ Error fetching position:', error)
    throw error
  }
}

/**
 * Gets all open intraday positions that need auto square-off
 */
export async function getIntradayPositionsForAutoExit(): Promise<any[]> {
  try {
    const client = await clientPromise
    const db = client.db('tradebot')
    
    const positions = await db.collection('positions').find({
      isIntraday: true,
      status: { $in: ['OPEN', 'PARTIAL'] },
      scheduledExitTime: { $exists: true }
    }).toArray()
    
    return positions
  } catch (error) {
    console.error('❌ Error fetching intraday positions:', error)
    throw error
  }
}

/**
 * Marks position as scheduled for auto square-off
 */
export async function markPositionForAutoExit(positionId: ObjectId): Promise<void> {
  try {
    const client = await clientPromise
    const db = client.db('tradebot')
    
    await db.collection('positions').updateOne(
      { _id: positionId },
      {
        $set: {
          autoSquareOffScheduled: true,
          updatedAt: new Date()
        }
      }
    )
    
    console.log(`📅 Position marked for auto exit: ${positionId}`)
  } catch (error) {
    console.error('❌ Error marking position for auto exit:', error)
    throw error
  }
}

/**
 * Updates unrealized P&L for open positions
 */
export async function updateUnrealizedPnL(
  positionId: ObjectId, 
  currentPrice: number
): Promise<void> {
  try {
    const client = await clientPromise
    const db = client.db('tradebot')
    
    const position = await db.collection('positions').findOne({ _id: positionId })
    if (!position || position.status === 'CLOSED') {
      return
    }
    
    // Calculate unrealized P&L
    const pnlMultiplier = position.side === 'LONG' ? 1 : -1
    const unrealizedPnl = position.currentQuantity * (currentPrice - position.averagePrice) * pnlMultiplier
    
    await db.collection('positions').updateOne(
      { _id: positionId },
      {
        $set: {
          unrealizedPnl,
          updatedAt: new Date()
        }
      }
    )
  } catch (error) {
    console.error('❌ Error updating unrealized P&L:', error)
    throw error
  }
}

/**
 * Generates unique position ID
 */
function generatePositionId(): string {
  const timestamp = Date.now()
  const random = Math.random().toString(36).substr(2, 9)
  return `POS_${timestamp}_${random}`
}

/**
 * Determines signal type from webhook payload
 */
export function determineSignalType(payload: any): 'ENTRY' | 'EXIT' | 'UNKNOWN' {
  if (!payload.action) return 'UNKNOWN'
  
  const action = payload.action.toUpperCase()
  
  if (action === 'ENTRY' || action === 'BUY') {
    return 'ENTRY'
  }
  
  if (action === 'EXIT' || action === 'SELL') {
    return 'EXIT'
  }
  
  return 'UNKNOWN'
}

/**
 * Determines position side from signal
 */
export function determinePositionSide(payload: any): 'LONG' | 'SHORT' {
  if (!payload.action) return 'LONG'
  
  const action = payload.action.toUpperCase()
  
  // For now, assume all entries are LONG positions
  // This can be enhanced later based on signal data
  if (action === 'BUY' || action === 'ENTRY') {
    return 'LONG'
  }
  
  if (action === 'SELL_SHORT' || action === 'SHORT') {
    return 'SHORT'
  }
  
  return 'LONG'
}

/**
 * Cleanup old positions (utility function)
 */
export async function cleanupOldPositions(daysOld: number = 30): Promise<number> {
  try {
    const client = await clientPromise
    const db = client.db('tradebot')
    
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - daysOld)
    
    const result = await db.collection('positions').deleteMany({
      status: 'CLOSED',
      updatedAt: { $lt: cutoffDate }
    })
    
    console.log(`🧹 Cleaned up ${result.deletedCount} old positions`)
    return result.deletedCount
  } catch (error) {
    console.error('❌ Error cleaning up positions:', error)
    throw error
  }
}