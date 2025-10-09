import dbConnect from '@/lib/mongoose'
import User from '@/models/User'
import Position from '@/models/Position'
import DailyPnLSnapshot from '@/models/DailyPnLSnapshot'
import { ZerodhaAPI } from '@/lib/zerodha'
import { decrypt } from '@/lib/encryption'

/**
 * Daily P&L Snapshot Collector Service
 * 
 * This service automatically collects and stores daily P&L snapshots
 * from Zerodha for all connected users. Should be run daily after
 * market close (e.g., 4:00 PM IST).
 */
export class DailyPnLCollector {
  private isRunning = false

  /**
   * Collect P&L snapshots for all users
   */
  async collectAllUserSnapshots(): Promise<{
    success: number
    failed: number
    errors: string[]
  }> {
    if (this.isRunning) {
      throw new Error('Daily P&L collection already in progress')
    }

    this.isRunning = true
    console.log('🔄 Starting daily P&L snapshot collection...')

    const results = {
      success: 0,
      failed: 0,
      errors: [] as string[]
    }

    try {
      await dbConnect()

      // Get all users with Zerodha credentials
      const users = await User.find({
        'zerodhaConfig.apiKey': { $exists: true, $ne: null },
        'zerodhaConfig.apiSecret': { $exists: true, $ne: null },
        'zerodhaConfig.accessToken': { $exists: true, $ne: null },
        'zerodhaConfig.isConnected': true
      }).select('email zerodhaConfig').lean()

      console.log(`📊 Found ${users.length} users with Zerodha connections`)

      const today = new Date().toISOString().split('T')[0]

      for (const user of users) {
        try {
          await this.collectUserSnapshot(user, today)
          results.success++
          console.log(`✅ Collected snapshot for ${user.email}`)
        } catch (error) {
          results.failed++
          const errorMsg = `Failed for ${user.email}: ${error.message}`
          results.errors.push(errorMsg)
          console.error(`❌ ${errorMsg}`)
        }

        // Add delay between users to avoid API rate limits
        await new Promise(resolve => setTimeout(resolve, 1000))
      }

      console.log(`📈 Daily P&L collection completed: ${results.success} success, ${results.failed} failed`)
      return results

    } finally {
      this.isRunning = false
    }
  }

  /**
   * Collect P&L snapshot for a specific user
   */
  async collectUserSnapshot(user: any, date?: string): Promise<void> {
    const targetDate = date || new Date().toISOString().split('T')[0]

    // Check if snapshot already exists
    const existingSnapshot = await DailyPnLSnapshot.findOne({
      userId: user._id,
      date: targetDate
    })

    if (existingSnapshot) {
      console.log(`📋 Snapshot already exists for ${user.email} on ${targetDate}`)
      return
    }

    // Decrypt credentials before using
    const apiKey = decrypt(user.zerodhaConfig.apiKey)
    const apiSecret = decrypt(user.zerodhaConfig.apiSecret)
    const accessToken = decrypt(user.zerodhaConfig.accessToken)

    const zerodhaAPI = new ZerodhaAPI(apiKey, apiSecret, accessToken)

    // Fetch comprehensive data from Zerodha
    const [portfolioData, botPositions] = await Promise.all([
      zerodhaAPI.getPortfolioData(),
      this.getBotPositionsForDate(user._id, targetDate)
    ])

    const portfolio = portfolioData.data

    // Calculate bot-specific performance
    const botPerformance = await this.calculateBotPerformance(user._id, targetDate, botPositions)

    // Create snapshot
    const snapshot = new DailyPnLSnapshot({
      userId: user._id,
      date: targetDate,
      totalDayPnL: portfolio?.totalDayPnL || 0,
      totalPortfolioPnL: portfolio?.totalPnL || 0,
      totalPortfolioValue: portfolio?.totalCurrentValue || 0,
      totalInvestmentValue: portfolio?.totalInvestmentValue || 0,
      availableMargin: portfolio?.availableMargin || 0,
      usedMargin: portfolio?.usedMargin || 0,
      totalMargin: portfolio?.totalMargin || 0,
      botPerformance,
      positions: this.formatPositions(portfolio?.positions?.data?.net || []),
      holdings: this.formatHoldings(portfolio?.holdings?.data || []),
      zerodhaSnapshot: portfolioData,
      snapshotTime: new Date(),
      dataSource: 'AUTO'
    })

    await snapshot.save()
    console.log(`💾 Saved P&L snapshot for ${user.email} on ${targetDate}`)
  }

  /**
   * Get bot positions for a specific date
   */
  private async getBotPositionsForDate(userId: string, date: string) {
    const startOfDay = new Date(date + 'T00:00:00.000Z')
    const endOfDay = new Date(date + 'T23:59:59.999Z')

    return await Position.find({
      userId,
      $or: [
        // Positions created on this date
        {
          createdAt: { $gte: startOfDay, $lte: endOfDay }
        },
        // Positions still open that were created before this date
        {
          status: { $in: ['OPEN', 'PARTIAL'] },
          createdAt: { $lt: endOfDay }
        }
      ]
    }).populate('botId', 'name').lean()
  }

  /**
   * Calculate bot-specific performance metrics
   */
  private async calculateBotPerformance(userId: string, date: string, botPositions: any[]) {
    const botMap = new Map()

    for (const position of botPositions) {
      const botId = position.botId?._id?.toString() || 'manual'
      const botName = position.botId?.name || 'Manual Trading'

      if (!botMap.has(botId)) {
        botMap.set(botId, {
          botId: position.botId?._id || null,
          botName,
          dayPnL: 0,
          totalPnL: 0,
          openPositions: 0,
          closedPositions: 0,
          totalTrades: 0,
          winRate: 0,
          allocatedAmount: 0
        })
      }

      const botStats = botMap.get(botId)
      
      // Calculate daily P&L (positions that had activity today)
      if (position.updatedAt && position.updatedAt.toISOString().split('T')[0] === date) {
        botStats.dayPnL += position.unrealizedPnl || 0
        if (position.status === 'CLOSED') {
          botStats.dayPnL += position.realizedPnl || 0
        }
      }

      botStats.totalPnL += position.totalPnl || 0
      botStats.totalTrades += 1

      if (position.status === 'OPEN' || position.status === 'PARTIAL') {
        botStats.openPositions += 1
      } else {
        botStats.closedPositions += 1
      }

      // Calculate win rate
      if (position.status === 'CLOSED' && position.totalPnl > 0) {
        botStats.winRate = (botStats.winRate * (botStats.totalTrades - 1) + 1) / botStats.totalTrades
      }
    }

    return Array.from(botMap.values())
  }

  /**
   * Format positions data from Zerodha
   */
  private formatPositions(positions: any[]) {
    return positions.map(pos => ({
      symbol: pos.tradingsymbol,
      exchange: pos.exchange,
      quantity: pos.quantity,
      averagePrice: pos.average_price,
      lastPrice: pos.last_price,
      dayPnL: pos.pnl,
      unrealizedPnL: pos.unrealised,
      realizedPnL: pos.realised
    }))
  }

  /**
   * Format holdings data from Zerodha
   */
  private formatHoldings(holdings: any[]) {
    return holdings.map(holding => ({
      symbol: holding.tradingsymbol,
      exchange: holding.exchange,
      quantity: holding.quantity,
      averagePrice: holding.average_price,
      lastPrice: holding.last_price,
      dayChange: holding.day_change,
      totalPnL: holding.pnl
    }))
  }

  /**
   * Schedule daily collection (for production use)
   */
  scheduleDailyCollection(): void {
    const now = new Date()
    const targetTime = new Date()
    targetTime.setHours(16, 30, 0, 0) // 4:30 PM IST (after market close)

    // If it's already past 4:30 PM today, schedule for tomorrow
    if (now > targetTime) {
      targetTime.setDate(targetTime.getDate() + 1)
    }

    const delayMs = targetTime.getTime() - now.getTime()

    console.log(`⏰ Scheduling daily P&L collection for ${targetTime.toISOString()}`)

    setTimeout(async () => {
      try {
        await this.collectAllUserSnapshots()
      } catch (error) {
        console.error('❌ Scheduled P&L collection failed:', error)
      }

      // Schedule next day
      this.scheduleDailyCollection()
    }, delayMs)
  }

  /**
   * Get collection status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      lastRun: null, // TODO: Store in database
      nextScheduled: null // TODO: Calculate from schedule
    }
  }
}

// Export singleton instance
export const dailyPnLCollector = new DailyPnLCollector()