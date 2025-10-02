// STRAT Signal Detection Library
// Converted from Pine Script StratCombo Library

export interface BarData {
  high: number
  low: number
  open: number
  close: number
  timestamp: Date
}

export class StratSignals {
  
  /**
   * Check if current bar is a 2U bar (upward breakout)
   * 2U: high > previous_high AND low >= previous_low
   */
  static is2UBar(previousBar: BarData, currentBar: BarData): boolean {
    return currentBar.high > previousBar.high && currentBar.low >= previousBar.low
  }
  
  /**
   * Check if current bar is a 2D bar (downward breakout)  
   * 2D: high <= previous_high AND low < previous_low
   */
  static is2DBar(previousBar: BarData, currentBar: BarData): boolean {
    return currentBar.high <= previousBar.high && currentBar.low < previousBar.low
  }
  
  /**
   * Check if current bar is an inside bar (consolidation)
   * Inside: high <= previous_high AND low >= previous_low
   */
  static isInsideBar(previousBar: BarData, currentBar: BarData): boolean {
    return currentBar.high <= previousBar.high && currentBar.low >= previousBar.low
  }
  
  /**
   * Check if current bar is an outside bar (volatility expansion)
   * Outside: high > previous_high AND low < previous_low
   */
  static isOutsideBar(previousBar: BarData, currentBar: BarData): boolean {
    return currentBar.high > previousBar.high && currentBar.low < previousBar.low
  }
  
  /**
   * Detect 2D-2U pattern (Bullish reversal)
   * Pattern: 2D bar followed by 2U bar
   */
  static is2D2U(bars: BarData[]): { signal: boolean, hos?: number, los?: number } {
    if (bars.length < 3) return { signal: false }
    
    const [bar2, bar1, bar0] = bars.slice(-3)
    
    const is2D = this.is2DBar(bar2, bar1)
    const is2U = this.is2UBar(bar1, bar0)
    
    if (is2D && is2U) {
      // Calculate High of Signal (HoS) and Low of Signal (LoS)
      // From the signal candles (last 2 bars)
      const hos = Math.max(bar1.open, bar1.close, bar0.open, bar0.close)
      const los = Math.min(bar1.open, bar1.close, bar0.open, bar0.close)
      
      return { signal: true, hos, los }
    }
    
    return { signal: false }
  }
  
  /**
   * Detect 2U-2D pattern (Bearish reversal)
   * Pattern: 2U bar followed by 2D bar
   */
  static is2U2D(bars: BarData[]): { signal: boolean, hos?: number, los?: number } {
    if (bars.length < 3) return { signal: false }
    
    const [bar2, bar1, bar0] = bars.slice(-3)
    
    const is2U = this.is2UBar(bar2, bar1)
    const is2D = this.is2DBar(bar1, bar0)
    
    if (is2U && is2D) {
      // Calculate High of Signal (HoS) and Low of Signal (LoS)
      // From the signal candles (last 2 bars)
      const hos = Math.max(bar1.open, bar1.close, bar0.open, bar0.close)
      const los = Math.min(bar1.open, bar1.close, bar0.open, bar0.close)
      
      return { signal: true, hos, los }
    }
    
    return { signal: false }
  }
  
  /**
   * Calculate Fibonacci 50% retracement level from STRAT signal
   */
  static calculateFibEntry(hos: number, los: number): number {
    return los + (hos - los) * 0.5
  }
  
  /**
   * Detect multiple STRAT patterns in sequence
   */
  static analyzeMultiplePatterns(bars: BarData[]) {
    const result = {
      is2D2U: this.is2D2U(bars),
      is2U2D: this.is2U2D(bars),
      timestamp: bars[bars.length - 1]?.timestamp || new Date()
    }
    
    return result
  }
  
  /**
   * Check if candle is bullish (close > open)
   */
  static isBullish(bar: BarData): boolean {
    return bar.close > bar.open
  }
  
  /**
   * Check if candle is bearish (close < open)
   */
  static isBearish(bar: BarData): boolean {
    return bar.close < bar.open
  }
}

export default StratSignals