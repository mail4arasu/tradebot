// Historical Data Sync Service
// Fetches and synchronizes historical data from Zerodha API

import axios from 'axios'
import HistoricalDataModel from '../models/HistoricalData'
import { HistoricalDataPoint } from '../lib/backtesting/types'

interface ZerodhaOHLCResponse {
  status: string
  data: {
    candles: [string, number, number, number, number, number][] // [timestamp, open, high, low, close, volume]
  }
}

export class HistoricalDataSync {
  private syncStatus: Map<string, { 
    symbol: string, 
    timeframe: string, 
    status: 'RUNNING' | 'COMPLETED' | 'FAILED', 
    progress: number,
    startTime: Date,
    endTime?: Date,
    error?: string
  }> = new Map()
  
  /**
   * Sync historical data for a symbol and timeframe
   */
  async syncHistoricalData(
    symbol: string,
    startDate: Date,
    endDate: Date,
    timeframe: '5min' | '1day'
  ): Promise<{ success: boolean, syncId: string, message: string }> {
    const syncId = `${symbol}_${timeframe}_${Date.now()}`
    
    // Initialize sync status
    this.syncStatus.set(syncId, {
      symbol,
      timeframe,
      status: 'RUNNING',
      progress: 0,
      startTime: new Date()
    })
    
    // Start sync in background
    this.performSync(syncId, symbol, startDate, endDate, timeframe)
      .catch(error => {
        console.error(`Data sync ${syncId} failed:`, error)
        this.updateSyncStatus(syncId, 'FAILED', 100, error.message)
      })
    
    return {
      success: true,
      syncId,
      message: 'Data sync started successfully'
    }
  }
  
  /**
   * Get sync status for all running syncs
   */
  async getSyncStatus() {
    return Array.from(this.syncStatus.values())
  }
  
  /**
   * Get data availability for a symbol
   */
  async getDataAvailability(symbol: string, timeframe?: '5min' | '1day') {
    return HistoricalDataModel.getDataAvailability(symbol, timeframe)
  }
  
  /**
   * Perform the actual data synchronization
   */
  private async performSync(
    syncId: string,
    symbol: string,
    startDate: Date,
    endDate: Date,
    timeframe: '5min' | '1day'
  ): Promise<void> {
    try {
      // Update progress: Checking missing data
      this.updateSyncStatus(syncId, 'RUNNING', 10, 'Analyzing missing data ranges...')
      
      // Get missing data ranges
      const missingRanges = await HistoricalDataModel.getMissingDataRanges(
        symbol,
        timeframe,
        startDate,
        endDate
      )
      
      if (missingRanges.length === 0) {
        this.updateSyncStatus(syncId, 'COMPLETED', 100, 'No missing data found')
        return
      }
      
      // Update progress: Starting data fetch
      this.updateSyncStatus(syncId, 'RUNNING', 20, `Found ${missingRanges.length} missing ranges`)
      
      let totalProgress = 20
      const progressPerRange = 70 / missingRanges.length
      
      // Fetch data for each missing range
      for (let i = 0; i < missingRanges.length; i++) {
        const range = missingRanges[i]
        
        this.updateSyncStatus(
          syncId, 
          'RUNNING', 
          totalProgress, 
          `Fetching data for range ${i + 1}/${missingRanges.length}`
        )
        
        await this.fetchAndStoreData(symbol, range.start, range.end, timeframe)
        
        totalProgress += progressPerRange
        this.updateSyncStatus(syncId, 'RUNNING', Math.floor(totalProgress))
      }
      
      // Update progress: Finalizing
      this.updateSyncStatus(syncId, 'RUNNING', 95, 'Finalizing data storage...')
      
      // Cleanup and optimize
      await this.optimizeData(symbol, timeframe)
      
      this.updateSyncStatus(syncId, 'COMPLETED', 100, 'Data sync completed successfully')
      
    } catch (error: any) {
      this.updateSyncStatus(syncId, 'FAILED', 100, error.message)
      throw error
    }
  }
  
  /**
   * Fetch data from Zerodha API and store in database
   */
  private async fetchAndStoreData(
    symbol: string,
    startDate: Date,
    endDate: Date,
    timeframe: '5min' | '1day'
  ): Promise<void> {
    // Note: This is a simplified implementation
    // In production, you would need proper Zerodha API credentials and authentication
    
    try {
      // Convert timeframe to Zerodha format
      const kiteTimeframe = timeframe === '5min' ? '5minute' : 'day'
      
      // Simulate API call (replace with actual Zerodha API call)
      const response = await this.simulateZerodhaAPICall(symbol, startDate, endDate, kiteTimeframe)
      
      if (!response.data || !response.data.candles) {
        throw new Error('Invalid response from Zerodha API')
      }
      
      // Convert data to our format
      const dataPoints: HistoricalDataPoint[] = response.data.candles.map(candle => ({
        symbol,
        exchange: 'NSE',
        timeframe,
        timestamp: new Date(candle[0]),
        open: candle[1],
        high: candle[2],
        low: candle[3],
        close: candle[4],
        volume: candle[5],
        createdAt: new Date()
      }))
      
      // Bulk insert data
      if (dataPoints.length > 0) {
        await HistoricalDataModel.bulkInsertData(dataPoints)
        console.log(`Stored ${dataPoints.length} data points for ${symbol} ${timeframe}`)
      }
      
    } catch (error: any) {
      console.error(`Error fetching data for ${symbol}:`, error)
      throw new Error(`Failed to fetch data from Zerodha API: ${error.message}`)
    }
  }
  
  /**
   * Simulate Zerodha API call for development
   * In production, replace with actual API integration
   */
  private async simulateZerodhaAPICall(
    symbol: string,
    startDate: Date,
    endDate: Date,
    timeframe: string
  ): Promise<ZerodhaOHLCResponse> {
    // This is a mock implementation for development
    // Replace with actual Zerodha KiteConnect API call
    
    console.log(`[MOCK] Fetching ${symbol} data from ${startDate.toISOString()} to ${endDate.toISOString()}`)
    
    // Generate mock data
    const candles: [string, number, number, number, number, number][] = []
    const currentDate = new Date(startDate)
    const basePrice = 17500 // Mock Nifty price
    
    while (currentDate <= endDate) {
      // Skip weekends for daily data
      if (timeframe === 'day' && (currentDate.getDay() === 0 || currentDate.getDay() === 6)) {
        currentDate.setDate(currentDate.getDate() + 1)
        continue
      }
      
      // Generate mock OHLCV data
      const open = basePrice + (Math.random() - 0.5) * 200
      const volatility = Math.random() * 0.02 // 2% max movement
      const high = open + Math.random() * open * volatility
      const low = open - Math.random() * open * volatility
      const close = low + Math.random() * (high - low)
      const volume = Math.floor(Math.random() * 1000000)
      
      candles.push([
        currentDate.toISOString(),
        Math.round(open * 100) / 100,
        Math.round(high * 100) / 100,
        Math.round(low * 100) / 100,
        Math.round(close * 100) / 100,
        volume
      ])
      
      // Increment time based on timeframe
      if (timeframe === '5minute') {
        currentDate.setMinutes(currentDate.getMinutes() + 5)
        // Skip outside trading hours (9:15 AM - 3:30 PM IST)
        const hour = currentDate.getHours()
        const minute = currentDate.getMinutes()
        if (hour < 9 || (hour === 9 && minute < 15) || hour > 15 || (hour === 15 && minute > 30)) {
          currentDate.setDate(currentDate.getDate() + 1)
          currentDate.setHours(9, 15, 0, 0)
        }
      } else {
        currentDate.setDate(currentDate.getDate() + 1)
      }
    }
    
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 100))
    
    return {
      status: 'success',
      data: { candles }
    }
  }
  
  /**
   * Optimize stored data (remove duplicates, sort, etc.)
   */
  private async optimizeData(symbol: string, timeframe: '5min' | '1day'): Promise<void> {
    // Remove any duplicate entries
    const pipeline = [
      { $match: { symbol, timeframe } },
      { $sort: { timestamp: 1 } },
      { $group: {
          _id: { symbol: '$symbol', timeframe: '$timeframe', timestamp: '$timestamp' },
          doc: { $first: '$$ROOT' }
        }
      },
      { $replaceRoot: { newRoot: '$doc' } }
    ]
    
    const uniqueData = await HistoricalDataModel.aggregate(pipeline)
    
    // Clear existing data and reinsert unique data
    await HistoricalDataModel.deleteMany({ symbol, timeframe })
    
    if (uniqueData.length > 0) {
      await HistoricalDataModel.insertMany(uniqueData)
    }
    
    console.log(`Optimized ${uniqueData.length} unique records for ${symbol} ${timeframe}`)
  }
  
  /**
   * Update sync status
   */
  private updateSyncStatus(
    syncId: string, 
    status: 'RUNNING' | 'COMPLETED' | 'FAILED', 
    progress: number, 
    error?: string
  ): void {
    const existing = this.syncStatus.get(syncId)
    if (existing) {
      existing.status = status
      existing.progress = progress
      if (status === 'COMPLETED' || status === 'FAILED') {
        existing.endTime = new Date()
      }
      if (error) {
        existing.error = error
      }
      this.syncStatus.set(syncId, existing)
    }
  }
  
  /**
   * Clean up old sync status records
   */
  private cleanupSyncStatus(): void {
    const cutoffTime = new Date(Date.now() - 24 * 60 * 60 * 1000) // 24 hours ago
    
    for (const [syncId, status] of this.syncStatus.entries()) {
      if (status.endTime && status.endTime < cutoffTime) {
        this.syncStatus.delete(syncId)
      }
    }
  }
  
  /**
   * Manual data validation
   */
  async validateData(symbol: string, timeframe: '5min' | '1day'): Promise<{
    valid: boolean,
    issues: string[],
    totalRecords: number,
    dateRange: { start: Date, end: Date } | null
  }> {
    const issues: string[] = []
    
    // Get data statistics
    const stats = await HistoricalDataModel.aggregate([
      { $match: { symbol, timeframe } },
      { $group: {
          _id: null,
          count: { $sum: 1 },
          minDate: { $min: '$timestamp' },
          maxDate: { $max: '$timestamp' },
          avgVolume: { $avg: '$volume' },
          priceIssues: { 
            $sum: { 
              $cond: [
                { $or: [
                  { $gte: ['$low', '$high'] },
                  { $lt: ['$open', '$low'] },
                  { $gt: ['$open', '$high'] },
                  { $lt: ['$close', '$low'] },
                  { $gt: ['$close', '$high'] }
                ]},
                1,
                0
              ]
            }
          }
        }
      }
    ])
    
    if (stats.length === 0) {
      return {
        valid: false,
        issues: ['No data found'],
        totalRecords: 0,
        dateRange: null
      }
    }
    
    const stat = stats[0]
    
    // Check for price inconsistencies
    if (stat.priceIssues > 0) {
      issues.push(`${stat.priceIssues} records with invalid OHLC relationships`)
    }
    
    // Check for reasonable volume
    if (stat.avgVolume <= 0) {
      issues.push('Zero or negative volume detected')
    }
    
    // Check for data gaps (simplified)
    const expectedRecords = timeframe === '5min' 
      ? Math.floor((stat.maxDate - stat.minDate) / (5 * 60 * 1000)) // rough estimate
      : Math.floor((stat.maxDate - stat.minDate) / (24 * 60 * 60 * 1000))
    
    if (stat.count < expectedRecords * 0.8) { // Allow 20% missing data
      issues.push(`Potential data gaps detected (${stat.count}/${expectedRecords} expected records)`)
    }
    
    return {
      valid: issues.length === 0,
      issues,
      totalRecords: stat.count,
      dateRange: stat.minDate && stat.maxDate ? {
        start: stat.minDate,
        end: stat.maxDate
      } : null
    }
  }
  
  /**
   * Get current sync statistics
   */
  getSyncStatistics() {
    const running = Array.from(this.syncStatus.values()).filter(s => s.status === 'RUNNING').length
    const completed = Array.from(this.syncStatus.values()).filter(s => s.status === 'COMPLETED').length
    const failed = Array.from(this.syncStatus.values()).filter(s => s.status === 'FAILED').length
    
    return {
      running,
      completed,
      failed,
      total: this.syncStatus.size
    }
  }
}

export default HistoricalDataSync