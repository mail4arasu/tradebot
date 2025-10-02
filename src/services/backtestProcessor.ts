// Backtest Processor Service
// Core backtesting engine that runs strategy simulations

import { v4 as uuidv4 } from 'uuid'
import BacktestResultModel from '../models/BacktestResult'
import HistoricalDataModel from '../models/HistoricalData'
import { NiftyORBStrategy } from '../lib/backtesting/nifty-orb-strategy'
import { 
  BacktestParams, 
  BacktestResult, 
  OHLCV, 
  TradeDetail, 
  EquityPoint, 
  DailyPnL,
  TradingSignal,
  OpeningRange
} from '../lib/backtesting/types'

export class BacktestProcessor {
  private runningBacktests: Map<string, boolean> = new Map()
  
  /**
   * Start a new backtest
   */
  async startBacktest(params: BacktestParams): Promise<string> {
    const backtestId = uuidv4()
    
    // Create backtest record
    const backtestResult = new BacktestResultModel({
      id: backtestId,
      params,
      status: 'RUNNING',
      progress: 0,
      startTime: new Date(),
      trades: [],
      equityCurve: [],
      dailyPnL: []
    })
    
    await backtestResult.save()
    
    // Start processing in background
    this.processBacktest(backtestId).catch(async (error) => {
      console.error(`Backtest ${backtestId} failed:`, error)
      await this.markBacktestFailed(backtestId, error.message)
    })
    
    return backtestId
  }
  
  /**
   * Get backtest status
   */
  async getBacktestStatus(backtestId: string) {
    const backtest = await BacktestResultModel.findOne({ id: backtestId }).lean()
    if (!backtest) {
      throw new Error(`Backtest ${backtestId} not found`)
    }
    
    return {
      id: backtest.id,
      status: backtest.status,
      progress: backtest.progress,
      startTime: backtest.startTime,
      endTime: backtest.endTime,
      duration: backtest.duration,
      error: backtest.error
    }
  }
  
  /**
   * Get complete backtest result
   */
  async getBacktestResult(backtestId: string): Promise<BacktestResult> {
    const backtest = await BacktestResultModel.findOne({ id: backtestId }).lean()
    if (!backtest) {
      throw new Error(`Backtest ${backtestId} not found`)
    }
    
    return backtest as BacktestResult
  }
  
  /**
   * Delete a backtest
   */
  async deleteBacktest(backtestId: string): Promise<void> {
    const result = await BacktestResultModel.deleteOne({ id: backtestId })
    if (result.deletedCount === 0) {
      throw new Error(`Backtest ${backtestId} not found`)
    }
  }
  
  /**
   * List backtests with filters
   */
  async listBacktests(status?: string, botId?: string) {
    const query: any = {}
    if (status) query.status = status
    if (botId) query['params.botId'] = botId
    
    return BacktestResultModel.find(query)
      .select('id params.botId status progress startTime endTime totalReturn winRate totalTrades')
      .sort({ startTime: -1 })
      .lean()
  }
  
  /**
   * Main backtest processing logic
   */
  private async processBacktest(backtestId: string): Promise<void> {
    const backtest = await BacktestResultModel.findOne({ id: backtestId })
    if (!backtest) throw new Error(`Backtest ${backtestId} not found`)
    
    this.runningBacktests.set(backtestId, true)
    
    try {
      const { params } = backtest
      
      // Update progress: Data loading
      await this.updateProgress(backtestId, 10, 'Loading historical data...')
      
      // Load 5-minute data
      const fiveMinData = await this.loadHistoricalData(
        'NIFTY50-FUT',
        '5min',
        params.startDate,
        params.endDate
      )
      
      // Load daily data for Gaussian filter
      const dailyData = await this.loadHistoricalData(
        'NIFTY50-FUT',
        '1day',
        new Date(params.startDate.getTime() - 60 * 24 * 60 * 60 * 1000), // 60 days before
        params.endDate
      )
      
      if (fiveMinData.length === 0) {
        throw new Error('No historical data found for the specified period')
      }
      
      // Update progress: Strategy initialization
      await this.updateProgress(backtestId, 20, 'Initializing strategy...')
      
      // Initialize strategy
      const strategy = new NiftyORBStrategy(params)
      
      // Track simulation state
      let equity = params.initialCapital
      let openTrades: Map<string, {
        trade: TradeDetail
        takeProfitLevel?: number
      }> = new Map()
      
      const equityCurve: EquityPoint[] = []
      const dailyPnL: DailyPnL[] = []
      const allTrades: TradeDetail[] = []
      
      // Group data by trading days
      const tradingDays = this.groupDataByTradingDays(fiveMinData)
      const totalDays = tradingDays.length
      
      // Process each trading day
      for (let dayIndex = 0; dayIndex < totalDays; dayIndex++) {
        const dayData = tradingDays[dayIndex]
        const tradingDate = new Date(dayData[0].timestamp)
        
        // Update progress
        const progress = 20 + Math.floor((dayIndex / totalDays) * 70)
        await this.updateProgress(backtestId, progress, `Processing ${tradingDate.toDateString()}...`)
        
        // Calculate opening range for the day
        const openingRange = strategy.calculateOpeningRange(dayData, tradingDate)
        if (!openingRange) continue
        
        // Track daily bullets (max trades per day)
        let dailyBulletCount = 0
        const dayTrades: TradeDetail[] = []
        let dayStartEquity = equity
        
        // Process each 5-minute bar
        for (let barIndex = 0; barIndex < dayData.length; barIndex++) {
          const currentBar = dayData[barIndex]
          const historicalBars = dayData.slice(0, barIndex + 1)
          
          // Check for exits on open trades
          const completedTrades = await this.processExits(
            openTrades,
            currentBar,
            strategy,
            equity
          )
          
          completedTrades.forEach(trade => {
            equity += (trade.pnl || 0)
            dayTrades.push(trade)
            allTrades.push(trade)
          })
          
          // Check for new entries (if we haven't hit daily limit)
          if (dailyBulletCount < params.maxBulletsPerDay) {
            const signal = strategy.generateSignal(
              currentBar,
              historicalBars,
              dailyData,
              openingRange,
              dailyBulletCount
            )
            
            if (signal.type) {
              const trade = await this.openTrade(
                signal,
                currentBar,
                params,
                equity
              )
              
              if (trade) {
                const takeProfitLevel = strategy.calculateTakeProfit(
                  dailyData,
                  trade.entryPrice,
                  trade.side
                )
                
                openTrades.set(trade.id, { trade, takeProfitLevel })
                dailyBulletCount++
              }
            }
          }
          
          // Add equity point for this bar
          equityCurve.push({
            timestamp: currentBar.timestamp,
            equity,
            drawdown: 0 // Will be calculated later
          })
        }
        
        // Close any remaining intraday positions at 15:10
        const eodTrades = await this.closeIntradayPositions(openTrades, equity)
        eodTrades.forEach(trade => {
          equity += (trade.pnl || 0)
          dayTrades.push(trade)
          allTrades.push(trade)
        })
        
        // Calculate daily P&L
        const dayPnL = equity - dayStartEquity
        const dayWins = dayTrades.filter(t => (t.pnl || 0) > 0).length
        const dayLosses = dayTrades.filter(t => (t.pnl || 0) < 0).length
        
        dailyPnL.push({
          date: tradingDate,
          pnl: dayPnL,
          trades: dayTrades.length,
          wins: dayWins,
          losses: dayLosses,
          equity
        })
        
        // Check if we should stop (bankruptcy check)
        if (equity <= 0) {
          throw new Error('Strategy depleted all capital')
        }
      }
      
      // Update progress: Finalizing results
      await this.updateProgress(backtestId, 90, 'Calculating final metrics...')
      
      // Update backtest with results
      backtest.trades = allTrades
      backtest.equityCurve = equityCurve
      backtest.dailyPnL = dailyPnL
      
      // Mark as completed and calculate metrics
      backtest.markCompleted()
      await backtest.save()
      
      await this.updateProgress(backtestId, 100, 'Backtest completed successfully')
      
    } catch (error: any) {
      console.error(`Backtest ${backtestId} processing error:`, error)
      await this.markBacktestFailed(backtestId, error.message)
    } finally {
      this.runningBacktests.delete(backtestId)
    }
  }
  
  /**
   * Load historical data for backtesting
   */
  private async loadHistoricalData(
    symbol: string,
    timeframe: '5min' | '1day',
    startDate: Date,
    endDate: Date
  ): Promise<OHLCV[]> {
    const data = await HistoricalDataModel.getDataRange(symbol, timeframe, startDate, endDate)
    
    return data.map(bar => ({
      timestamp: bar.timestamp,
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
      volume: bar.volume
    }))
  }
  
  /**
   * Group 5-minute data by trading days
   */
  private groupDataByTradingDays(data: OHLCV[]): OHLCV[][] {
    const days: OHLCV[][] = []
    let currentDay: OHLCV[] = []
    let currentDate = ''
    
    data.forEach(bar => {
      const barDate = bar.timestamp.toDateString()
      
      if (barDate !== currentDate) {
        if (currentDay.length > 0) {
          days.push(currentDay)
        }
        currentDay = []
        currentDate = barDate
      }
      
      currentDay.push(bar)
    })
    
    if (currentDay.length > 0) {
      days.push(currentDay)
    }
    
    return days
  }
  
  /**
   * Process exits for open trades
   */
  private async processExits(
    openTrades: Map<string, { trade: TradeDetail, takeProfitLevel?: number }>,
    currentBar: OHLCV,
    strategy: NiftyORBStrategy,
    currentEquity: number
  ): Promise<TradeDetail[]> {
    const completedTrades: TradeDetail[] = []
    
    for (const [tradeId, { trade, takeProfitLevel }] of openTrades.entries()) {
      const exitResult = strategy.shouldExit(
        currentBar,
        {
          entryPrice: trade.entryPrice,
          side: trade.side,
          entryTime: trade.entryTime
        },
        takeProfitLevel
      )
      
      if (exitResult.exit) {
        // Calculate exit details
        const exitPrice = trade.side === 'LONG' ? currentBar.close : currentBar.close
        const pnl = this.calculatePnL(trade, exitPrice)
        
        const completedTrade: TradeDetail = {
          ...trade,
          exitTime: currentBar.timestamp,
          exitPrice,
          pnl,
          exitReason: exitResult.reason as any
        }
        
        completedTrades.push(completedTrade)
        openTrades.delete(tradeId)
      }
    }
    
    return completedTrades
  }
  
  /**
   * Open a new trade based on signal
   */
  private async openTrade(
    signal: TradingSignal,
    currentBar: OHLCV,
    params: BacktestParams,
    currentEquity: number
  ): Promise<TradeDetail | null> {
    if (!signal.type) return null
    
    const quantity = this.calculatePositionSize(currentEquity, params.lotSize)
    
    const trade: TradeDetail = {
      id: uuidv4(),
      entryTime: currentBar.timestamp,
      symbol: 'NIFTY50-FUT',
      side: signal.type,
      entryPrice: signal.entryPrice,
      quantity,
      fees: this.calculateFees(signal.entryPrice, quantity),
      stratSignal: signal.stratSignal,
      fibEntry: signal.fibLevel !== undefined
    }
    
    return trade
  }
  
  /**
   * Close all intraday positions at end of day
   */
  private async closeIntradayPositions(
    openTrades: Map<string, { trade: TradeDetail, takeProfitLevel?: number }>,
    currentEquity: number
  ): Promise<TradeDetail[]> {
    const closedTrades: TradeDetail[] = []
    
    for (const [tradeId, { trade }] of openTrades.entries()) {
      // Simulate end-of-day closing at market price
      const exitPrice = trade.entryPrice // Simplified - would use actual EOD price
      const pnl = this.calculatePnL(trade, exitPrice)
      
      const completedTrade: TradeDetail = {
        ...trade,
        exitTime: new Date(trade.entryTime.getTime() + 6 * 60 * 60 * 1000), // 6 hours later
        exitPrice,
        pnl,
        exitReason: 'TIME_EXIT'
      }
      
      closedTrades.push(completedTrade)
    }
    
    openTrades.clear()
    return closedTrades
  }
  
  /**
   * Calculate P&L for a trade
   */
  private calculatePnL(trade: TradeDetail, exitPrice: number): number {
    const priceDiff = trade.side === 'LONG' 
      ? exitPrice - trade.entryPrice
      : trade.entryPrice - exitPrice
    
    const grossPnL = priceDiff * trade.quantity
    const totalFees = trade.fees + this.calculateFees(exitPrice, trade.quantity)
    
    return grossPnL - totalFees
  }
  
  /**
   * Calculate position size based on capital
   */
  private calculatePositionSize(equity: number, lotSize: number): number {
    // 1 lot per 3 lakhs capital
    const lots = Math.floor(equity / 300000)
    return Math.max(1, lots) * lotSize
  }
  
  /**
   * Calculate trading fees
   */
  private calculateFees(price: number, quantity: number): number {
    const value = price * quantity
    // Simplified fee calculation: 0.05% of trade value
    return value * 0.0005
  }
  
  /**
   * Update backtest progress
   */
  private async updateProgress(backtestId: string, progress: number, message?: string): Promise<void> {
    await BacktestResultModel.updateOne(
      { id: backtestId },
      { 
        $set: { 
          progress: Math.min(100, Math.max(0, progress))
        }
      }
    )
    
    if (message) {
      console.log(`Backtest ${backtestId}: ${progress}% - ${message}`)
    }
  }
  
  /**
   * Mark backtest as failed
   */
  private async markBacktestFailed(backtestId: string, error: string): Promise<void> {
    const backtest = await BacktestResultModel.findOne({ id: backtestId })
    if (backtest) {
      backtest.markFailed(error)
      await backtest.save()
    }
  }
  
  /**
   * Check if backtest is running
   */
  isBacktestRunning(backtestId: string): boolean {
    return this.runningBacktests.has(backtestId)
  }
  
  /**
   * Get running backtests count
   */
  getRunningBacktestsCount(): number {
    return this.runningBacktests.size
  }
}

export default BacktestProcessor