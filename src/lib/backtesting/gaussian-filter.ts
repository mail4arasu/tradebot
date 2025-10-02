// Gaussian Filter Implementation
// Converted from Pine Script Gaussian Filter logic

export interface GaussianParams {
  length: number
  distance: number
  mode: 'AVG' | 'MEDIAN' | 'MODE'
}

export interface GaussianResult {
  value: number
  upper: number
  lower: number
  buySignal: boolean
  sellSignal: boolean
}

export class GaussianFilter {
  
  /**
   * Calculate Gaussian weights for smoothing
   */
  private static calculateGaussianWeights(length: number, sigma: number): number[] {
    const weights: number[] = []
    let total = 0
    const pi = Math.PI
    
    // Calculate weights for Gaussian filter
    for (let i = 0; i < length; i++) {
      const weight = Math.exp(-0.5 * Math.pow((i - length / 2) / sigma, 2)) / Math.sqrt(sigma * 2 * pi)
      weights[i] = weight
      total += weight
    }
    
    // Normalize weights
    return weights.map(w => w / total)
  }
  
  /**
   * Apply Gaussian filter to price series
   */
  private static applyGaussianFilter(prices: number[], length: number): number {
    if (prices.length < length) return prices[prices.length - 1] || 0
    
    const sigma = length / 4 // Standard deviation
    const weights = this.calculateGaussianWeights(length, sigma)
    
    let sum = 0
    const recentPrices = prices.slice(-length)
    
    for (let i = 0; i < length; i++) {
      sum += recentPrices[i] * weights[i]
    }
    
    return sum
  }
  
  /**
   * Calculate volatility bands around Gaussian filter
   */
  private static calculateVolatilityBands(prices: number[], filteredValue: number, distance: number): { upper: number, lower: number } {
    // Calculate True Range for volatility
    const trueRanges: number[] = []
    
    for (let i = 1; i < prices.length; i++) {
      const tr = Math.max(
        Math.abs(prices[i] - prices[i - 1])
      )
      trueRanges.push(tr)
    }
    
    // Average True Range
    const atr = trueRanges.length > 0 ? 
      trueRanges.reduce((sum, tr) => sum + tr, 0) / trueRanges.length : 0
    
    const bandWidth = atr * distance
    
    return {
      upper: filteredValue + bandWidth,
      lower: filteredValue - bandWidth
    }
  }
  
  /**
   * Calculate mode (most frequent value) - simplified implementation
   */
  private static calculateMode(values: number[]): number {
    const frequency: { [key: string]: number } = {}
    const rounded = values.map(v => Math.round(v * 1000) / 1000) // Round to 3 decimals
    
    rounded.forEach(val => {
      const key = val.toString()
      frequency[key] = (frequency[key] || 0) + 1
    })
    
    let maxFreq = 0
    let mode = values[values.length - 1] // Default to last value
    
    Object.entries(frequency).forEach(([value, freq]) => {
      if (freq > maxFreq) {
        maxFreq = freq
        mode = parseFloat(value)
      }
    })
    
    return mode
  }
  
  /**
   * Calculate median of values
   */
  private static calculateMedian(values: number[]): number {
    const sorted = [...values].sort((a, b) => a - b)
    const mid = Math.floor(sorted.length / 2)
    
    return sorted.length % 2 === 0 
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid]
  }
  
  /**
   * Aggregate values based on mode (AVG, MEDIAN, MODE)
   */
  private static aggregateValues(values: number[], mode: 'AVG' | 'MEDIAN' | 'MODE'): number {
    switch (mode) {
      case 'AVG':
        return values.reduce((sum, val) => sum + val, 0) / values.length
      case 'MEDIAN':
        return this.calculateMedian(values)
      case 'MODE':
        return this.calculateMode(values)
      default:
        return values[values.length - 1]
    }
  }
  
  /**
   * Main Gaussian filter calculation for daily data
   */
  static calculateGaussianSignal(
    dailyCloses: number[], 
    params: GaussianParams = { length: 32, distance: 1.5, mode: 'AVG' }
  ): GaussianResult {
    if (dailyCloses.length < params.length) {
      return {
        value: dailyCloses[dailyCloses.length - 1] || 0,
        upper: 0,
        lower: 0,
        buySignal: false,
        sellSignal: false
      }
    }
    
    // Apply Gaussian filter
    const filteredValue = this.applyGaussianFilter(dailyCloses, params.length)
    
    // Calculate volatility bands
    const { upper, lower } = this.calculateVolatilityBands(dailyCloses, filteredValue, params.distance)
    
    // Current price
    const currentPrice = dailyCloses[dailyCloses.length - 1]
    
    // Generate signals
    const buySignal = currentPrice > upper
    const sellSignal = currentPrice < lower
    
    return {
      value: filteredValue,
      upper,
      lower,
      buySignal,
      sellSignal
    }
  }
  
  /**
   * Check if current conditions favor long entries
   */
  static isBullishSignal(dailyCloses: number[], params?: GaussianParams): boolean {
    const result = this.calculateGaussianSignal(dailyCloses, params)
    return result.buySignal
  }
  
  /**
   * Check if current conditions favor short entries  
   */
  static isBearishSignal(dailyCloses: number[], params?: GaussianParams): boolean {
    const result = this.calculateGaussianSignal(dailyCloses, params)
    return result.sellSignal
  }
  
  /**
   * Get full Gaussian analysis for current market conditions
   */
  static analyze(dailyCloses: number[], params?: GaussianParams): GaussianResult {
    return this.calculateGaussianSignal(dailyCloses, params)
  }
}

export default GaussianFilter