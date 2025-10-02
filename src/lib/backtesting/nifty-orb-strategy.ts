// Nifty Opening Range Breakout Strategy Engine
// Converted from Pine Script v3.0

import { OHLCV, BacktestParams, TradingSignal, OpeningRange, StratSignal } from './types'
import StratSignals, { BarData } from './strat-signals'
import GaussianFilter from './gaussian-filter'

export class NiftyORBStrategy {
  private params: BacktestParams
  
  constructor(params: BacktestParams) {
    this.params = params
  }
  
  /**
   * Calculate Opening Range (RDR) from 09:15-09:36 IST
   */
  calculateOpeningRange(data: OHLCV[], tradingDate: Date): OpeningRange | null {
    // Convert to Asia/Kolkata timezone
    const startTime = new Date(tradingDate)
    startTime.setHours(9, 15, 0, 0) // 09:15 IST
    
    const endTime = new Date(tradingDate)  
    endTime.setHours(9, 36, 0, 0) // 09:36 IST
    
    // Filter data within opening range time
    const orData = data.filter(bar => {
      const barTime = new Date(bar.timestamp)
      return barTime >= startTime && barTime <= endTime
    })
    
    if (orData.length === 0) return null
    
    const rdrhigh = Math.max(...orData.map(bar => bar.high))
    const rdrlow = Math.min(...orData.map(bar => bar.low))
    const open = orData[0].open
    const close = orData[orData.length - 1].close
    
    return {
      startTime,
      endTime,
      high: rdrhigh,
      low: rdrlow,
      open,
      close
    }
  }
  
  /**
   * Check if current time is within trading hours (09:36 - 15:10 IST)
   */
  private isWithinTradingHours(timestamp: Date): boolean {
    const hour = timestamp.getHours()
    const minute = timestamp.getMinutes()
    const timeInMinutes = hour * 60 + minute
    
    const startTime = 9 * 60 + 36 // 09:36
    const endTime = 15 * 60 + 10 // 15:10
    
    return timeInMinutes >= startTime && timeInMinutes <= endTime
  }
  
  /**
   * Check if we should avoid late entries
   */
  private isLateEntry(timestamp: Date): boolean {
    if (!this.params.useStratFilter) return false
    
    const hour = timestamp.getHours()
    const minute = timestamp.getMinutes()
    const timeInMinutes = hour * 60 + minute
    
    // Default late entry time is 15:00
    const lateEntryTime = 15 * 60 // 15:00
    
    return timeInMinutes >= lateEntryTime
  }
  
  /**
   * Detect STRAT signals if enabled
   */
  private detectStratSignals(bars: OHLCV[]): StratSignal {
    if (!this.params.useStratFilter || bars.length < 3) {
      return { is2D2U: false, is2U2D: false }
    }
    
    const stratBars: BarData[] = bars.slice(-3).map(bar => ({
      high: bar.high,
      low: bar.low,
      open: bar.open,
      close: bar.close,
      timestamp: bar.timestamp
    }))
    
    const signal2D2U = StratSignals.is2D2U(stratBars)
    const signal2U2D = StratSignals.is2U2D(stratBars)
    
    let fibLevel: number | undefined
    
    // Calculate Fibonacci entry level if we have a signal
    if (signal2D2U.signal && signal2D2U.hos && signal2D2U.los) {
      fibLevel = StratSignals.calculateFibEntry(signal2D2U.hos, signal2D2U.los)
    } else if (signal2U2D.signal && signal2U2D.hos && signal2U2D.los) {
      fibLevel = StratSignals.calculateFibEntry(signal2U2D.hos, signal2U2D.los)
    }
    
    return {
      is2D2U: signal2D2U.signal,
      is2U2D: signal2U2D.signal,
      fibLevel,
      hos: signal2D2U.hos || signal2U2D.hos,
      los: signal2D2U.los || signal2U2D.los
    }
  }
  
  /**
   * Check Gaussian filter signals using daily data
   */
  private checkGaussianFilter(dailyData: OHLCV[]): { bullish: boolean, bearish: boolean } {
    if (!this.params.useGaussianFilter || dailyData.length < 32) {
      return { bullish: true, bearish: true } // No filter applied
    }
    
    const dailyCloses = dailyData.map(bar => bar.close)
    
    return {
      bullish: GaussianFilter.isBullishSignal(dailyCloses),
      bearish: GaussianFilter.isBearishSignal(dailyCloses)
    }
  }
  
  /**
   * Calculate take profit target based on previous 2-day range
   */
  calculateTakeProfit(dailyData: OHLCV[], entryPrice: number, side: 'LONG' | 'SHORT'): number | null {
    if (!this.params.takeProfitPercent || dailyData.length < 2) return null
    
    // Get last 2 completed daily bars
    const recent2Days = dailyData.slice(-2)
    
    const hh = Math.max(...recent2Days.map(bar => bar.high))
    const ll = Math.min(...recent2Days.map(bar => bar.low))
    
    const range = hh - ll
    const targetDistance = range * (this.params.takeProfitPercent / 100)
    
    if (side === 'LONG') {
      return entryPrice + targetDistance
    } else {
      return entryPrice - targetDistance
    }
  }
  
  /**
   * Main signal generation function
   */
  generateSignal(
    currentBar: OHLCV,
    historicalBars: OHLCV[],
    dailyData: OHLCV[],
    openingRange: OpeningRange,
    dailyBulletCount: number
  ): TradingSignal {
    
    // Check basic conditions
    if (!this.isWithinTradingHours(currentBar.timestamp)) {
      return { type: null, entryPrice: 0, timestamp: currentBar.timestamp }
    }
    
    if (this.isLateEntry(currentBar.timestamp)) {
      return { type: null, entryPrice: 0, timestamp: currentBar.timestamp }
    }
    
    if (dailyBulletCount >= this.params.maxBulletsPerDay) {
      return { type: null, entryPrice: 0, timestamp: currentBar.timestamp }
    }
    
    // Check opening range breakout
    const longORB = currentBar.high > openingRange.high
    const shortORB = currentBar.low < openingRange.low
    
    if (!longORB && !shortORB) {
      return { type: null, entryPrice: 0, timestamp: currentBar.timestamp }
    }
    
    // Check STRAT filter
    const stratSignal = this.detectStratSignals(historicalBars)
    
    if (this.params.useStratFilter) {
      if (longORB && !stratSignal.is2D2U) {
        return { type: null, entryPrice: 0, timestamp: currentBar.timestamp }
      }
      if (shortORB && !stratSignal.is2U2D) {
        return { type: null, entryPrice: 0, timestamp: currentBar.timestamp }
      }
    }
    
    // Check Gaussian filter
    const gaussianFilter = this.checkGaussianFilter(dailyData)
    
    if (this.params.useGaussianFilter) {
      if (longORB && !gaussianFilter.bullish) {
        return { type: null, entryPrice: 0, timestamp: currentBar.timestamp }
      }
      if (shortORB && !gaussianFilter.bearish) {
        return { type: null, entryPrice: 0, timestamp: currentBar.timestamp }
      }
    }
    
    // Determine entry price
    let entryPrice = currentBar.close
    
    if (this.params.useFibEntry && stratSignal.fibLevel) {
      // Wait for pullback to fibonacci level
      if (longORB && currentBar.low <= stratSignal.fibLevel) {
        entryPrice = stratSignal.fibLevel
      } else if (shortORB && currentBar.high >= stratSignal.fibLevel) {
        entryPrice = stratSignal.fibLevel
      } else {
        // Price hasn't reached fib level yet
        return { type: null, entryPrice: 0, timestamp: currentBar.timestamp }
      }
    }
    
    // Generate signal
    if (longORB) {
      return {
        type: 'LONG',
        entryPrice,
        fibLevel: stratSignal.fibLevel,
        stratSignal,
        gaussianSignal: gaussianFilter.bullish,
        timestamp: currentBar.timestamp
      }
    } else if (shortORB) {
      return {
        type: 'SHORT',
        entryPrice,
        fibLevel: stratSignal.fibLevel,
        stratSignal,
        gaussianSignal: gaussianFilter.bearish,
        timestamp: currentBar.timestamp
      }
    }
    
    return { type: null, entryPrice: 0, timestamp: currentBar.timestamp }
  }
  
  /**
   * Check exit conditions for existing trades
   */
  shouldExit(
    currentBar: OHLCV,
    trade: { entryPrice: number, side: 'LONG' | 'SHORT', entryTime: Date },
    takeProfitLevel?: number
  ): { exit: boolean, reason: string } {
    
    // Time-based exit at 15:10
    const hour = currentBar.timestamp.getHours()
    const minute = currentBar.timestamp.getMinutes()
    if (hour >= 15 && minute >= 10) {
      return { exit: true, reason: 'TIME_EXIT' }
    }
    
    // Take profit exit
    if (takeProfitLevel) {
      if (trade.side === 'LONG' && currentBar.high >= takeProfitLevel) {
        return { exit: true, reason: 'TAKE_PROFIT' }
      }
      if (trade.side === 'SHORT' && currentBar.low <= takeProfitLevel) {
        return { exit: true, reason: 'TAKE_PROFIT' }
      }
    }
    
    // Add STRAT-based stops if enabled
    if (this.params.useStratStops) {
      // TODO: Implement STRAT-based stop logic
      // This would involve detecting opposite STRAT signals
    }
    
    return { exit: false, reason: '' }
  }
  
  /**
   * Calculate position size based on capital and risk parameters
   */
  calculatePositionSize(capital: number, entryPrice: number, stopLoss?: number): number {
    // Fixed lot size approach: 1 lot per 3 lakhs capital
    const lotsPerCapital = Math.floor(capital / 300000)
    return Math.max(1, lotsPerCapital) * this.params.lotSize
  }
}

export default NiftyORBStrategy