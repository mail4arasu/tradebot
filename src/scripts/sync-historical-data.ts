#!/usr/bin/env ts-node
/**
 * Historical Data Sync Script for Nifty50 Futures
 * Fetches maximum available data from Zerodha API and populates the database
 */

import mongoose from 'mongoose'
import dotenv from 'dotenv'
import { ZerodhaAPI } from '../lib/zerodha'

dotenv.config({ path: '.env.local' })

// Historical Data Schema
const HistoricalDataSchema = new mongoose.Schema({
  instrument_token: { type: Number, required: true, index: true },
  symbol: { type: String, required: true, index: true },
  exchange: { type: String, required: true },
  tradingsymbol: { type: String, required: true, index: true },
  expiry: { type: Date },
  strike: { type: Number },
  lot_size: { type: Number },
  tick_size: { type: Number },
  
  // OHLC Data
  date: { type: Date, required: true, index: true },
  timeframe: { type: String, required: true, index: true }, // '5minute', 'day'
  open: { type: Number, required: true },
  high: { type: Number, required: true },
  low: { type: Number, required: true },
  close: { type: Number, required: true },
  volume: { type: Number, required: true },
  oi: { type: Number, default: 0 }, // Open Interest
  
  // Metadata
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now }
}, {
  indexes: [
    { symbol: 1, timeframe: 1, date: 1 },
    { tradingsymbol: 1, timeframe: 1, date: 1 },
    { instrument_token: 1, timeframe: 1, date: 1 }
  ]
})

const HistoricalData = mongoose.model('HistoricalData', HistoricalDataSchema)

// Nifty50 Futures Instruments (Current and Recent Expiries)
const NIFTY_INSTRUMENTS = [
  // Current Month
  { symbol: 'NIFTY', expiry: '2025-10-31', tradingsymbol: 'NIFTY25OCTFUT' },
  
  // Next Months
  { symbol: 'NIFTY', expiry: '2025-11-28', tradingsymbol: 'NIFTY25NOVFUT' },
  { symbol: 'NIFTY', expiry: '2025-12-26', tradingsymbol: 'NIFTY25DECFUT' },
  
  // Previous Months (for historical testing)
  { symbol: 'NIFTY', expiry: '2025-09-26', tradingsymbol: 'NIFTY25SEPFUT' },
  { symbol: 'NIFTY', expiry: '2025-08-29', tradingsymbol: 'NIFTY25AUGFUT' },
  { symbol: 'NIFTY', expiry: '2025-07-31', tradingsymbol: 'NIFTY25JULFUT' },
  { symbol: 'NIFTY', expiry: '2025-06-26', tradingsymbol: 'NIFTY25JUNFUT' },
  { symbol: 'NIFTY', expiry: '2025-05-29', tradingsymbol: 'NIFTY25MAYFUT' },
  { symbol: 'NIFTY', expiry: '2025-04-24', tradingsymbol: 'NIFTY25APRFUT' },
  { symbol: 'NIFTY', expiry: '2025-03-27', tradingsymbol: 'NIFTY25MARFUT' },
  { symbol: 'NIFTY', expiry: '2025-02-27', tradingsymbol: 'NIFTY25FEBFUT' },
  { symbol: 'NIFTY', expiry: '2025-01-30', tradingsymbol: 'NIFTY25JANFUT' },
  
  // 2024 Data
  { symbol: 'NIFTY', expiry: '2024-12-26', tradingsymbol: 'NIFTY24DECFUT' },
  { symbol: 'NIFTY', expiry: '2024-11-28', tradingsymbol: 'NIFTY24NOVFUT' },
  { symbol: 'NIFTY', expiry: '2024-10-31', tradingsymbol: 'NIFTY24OCTFUT' }
]

class HistoricalDataSync {
  private zerodha: ZerodhaAPI
  private instruments: any[] = []

  constructor() {
    this.zerodha = new ZerodhaAPI()
  }

  async connect() {
    try {
      await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/tradebot')
      console.log('✅ Connected to MongoDB')
    } catch (error) {
      console.error('❌ MongoDB connection error:', error)
      throw error
    }
  }

  async initializeZerodha() {
    try {
      // Get user credentials from database
      const User = mongoose.model('User', new mongoose.Schema({
        email: String,
        zerodhaConfig: {
          apiKey: String,
          apiSecret: String,
          accessToken: String,
          isConnected: Boolean
        }
      }))
      
      const user = await User.findOne({ 'zerodhaConfig.isConnected': true })
      if (!user) {
        throw new Error('No connected Zerodha user found. Please connect Zerodha API first.')
      }

      console.log('✅ Found connected Zerodha user:', user.email)
      
      // Initialize Zerodha with user credentials
      this.zerodha.setCredentials(
        user.zerodhaConfig.apiKey,
        user.zerodhaConfig.apiSecret,
        user.zerodhaConfig.accessToken
      )
      
      console.log('✅ Zerodha API initialized')
    } catch (error) {
      console.error('❌ Zerodha initialization error:', error)
      throw error
    }
  }

  async fetchInstruments() {
    try {
      console.log('📊 Fetching instruments from Zerodha...')
      const instruments = await this.zerodha.getInstruments('NFO') // NSE Futures & Options
      
      // Filter for Nifty futures only
      this.instruments = instruments.filter((inst: any) => 
        inst.name === 'NIFTY' && 
        inst.instrument_type === 'FUT' &&
        NIFTY_INSTRUMENTS.some(ni => ni.tradingsymbol === inst.tradingsymbol)
      )
      
      console.log(`✅ Found ${this.instruments.length} Nifty futures instruments`)
      this.instruments.forEach(inst => {
        console.log(`  - ${inst.tradingsymbol} (Token: ${inst.instrument_token}, Expiry: ${inst.expiry})`)
      })
      
    } catch (error) {
      console.error('❌ Error fetching instruments:', error)
      throw error
    }
  }

  async syncHistoricalData(instrument: any, days: number = 365) {
    try {
      const endDate = new Date()
      const startDate = new Date()
      startDate.setDate(startDate.getDate() - days)
      
      console.log(`\n📈 Syncing ${instrument.tradingsymbol} from ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`)
      
      // Fetch 5-minute data
      const data5min = await this.zerodha.getHistoricalData(
        instrument.instrument_token,
        '5minute',
        startDate,
        endDate
      )
      
      if (data5min && data5min.length > 0) {
        console.log(`  📊 Processing ${data5min.length} 5-minute candles`)
        await this.saveCandles(instrument, data5min, '5minute')
      }
      
      // Fetch daily data
      const dataDaily = await this.zerodha.getHistoricalData(
        instrument.instrument_token,
        'day',
        startDate,
        endDate
      )
      
      if (dataDaily && dataDaily.length > 0) {
        console.log(`  📊 Processing ${dataDaily.length} daily candles`)
        await this.saveCandles(instrument, dataDaily, 'day')
      }
      
      // Add delay to respect rate limits
      await new Promise(resolve => setTimeout(resolve, 1000))
      
    } catch (error) {
      console.error(`❌ Error syncing ${instrument.tradingsymbol}:`, error)
    }
  }

  async saveCandles(instrument: any, candles: any[], timeframe: string) {
    try {
      const bulkOps = candles.map(candle => ({
        updateOne: {
          filter: {
            instrument_token: instrument.instrument_token,
            tradingsymbol: instrument.tradingsymbol,
            timeframe: timeframe,
            date: new Date(candle.date)
          },
          update: {
            $set: {
              instrument_token: instrument.instrument_token,
              symbol: instrument.name,
              exchange: instrument.exchange,
              tradingsymbol: instrument.tradingsymbol,
              expiry: instrument.expiry ? new Date(instrument.expiry) : null,
              strike: instrument.strike || 0,
              lot_size: instrument.lot_size || 25,
              tick_size: instrument.tick_size || 0.05,
              
              date: new Date(candle.date),
              timeframe: timeframe,
              open: candle.open,
              high: candle.high,
              low: candle.low,
              close: candle.close,
              volume: candle.volume || 0,
              oi: candle.oi || 0,
              
              updated_at: new Date()
            },
            $setOnInsert: {
              created_at: new Date()
            }
          },
          upsert: true
        }
      }))
      
      const result = await HistoricalData.bulkWrite(bulkOps)
      console.log(`    ✅ Saved ${result.upsertedCount + result.modifiedCount} ${timeframe} candles`)
      
    } catch (error) {
      console.error(`❌ Error saving candles:`, error)
    }
  }

  async getDataStats() {
    try {
      const stats = await HistoricalData.aggregate([
        {
          $group: {
            _id: {
              symbol: '$symbol',
              tradingsymbol: '$tradingsymbol',
              timeframe: '$timeframe'
            },
            count: { $sum: 1 },
            minDate: { $min: '$date' },
            maxDate: { $max: '$date' }
          }
        },
        { $sort: { '_id.tradingsymbol': 1, '_id.timeframe': 1 } }
      ])
      
      console.log('\n📊 Historical Data Statistics:')
      console.log('=====================================')
      
      for (const stat of stats) {
        console.log(`${stat._id.tradingsymbol} (${stat._id.timeframe}):`)
        console.log(`  Records: ${stat.count.toLocaleString()}`)
        console.log(`  Period: ${stat.minDate.toISOString().split('T')[0]} to ${stat.maxDate.toISOString().split('T')[0]}`)
        console.log('')
      }
      
    } catch (error) {
      console.error('❌ Error getting stats:', error)
    }
  }

  async run() {
    try {
      console.log('🚀 Starting Historical Data Sync for Nifty50 Futures')
      console.log('===================================================\n')
      
      await this.connect()
      await this.initializeZerodha()
      await this.fetchInstruments()
      
      if (this.instruments.length === 0) {
        console.log('❌ No Nifty futures instruments found')
        return
      }
      
      // Sync data for each instrument (last 2 years for comprehensive backtesting)
      for (const instrument of this.instruments) {
        await this.syncHistoricalData(instrument, 730) // 2 years
      }
      
      await this.getDataStats()
      
      console.log('\n✅ Historical data sync completed successfully!')
      
    } catch (error) {
      console.error('❌ Sync failed:', error)
    } finally {
      await mongoose.disconnect()
      console.log('👋 Disconnected from MongoDB')
    }
  }
}

// Run the sync
if (require.main === module) {
  const sync = new HistoricalDataSync()
  sync.run().catch(console.error)
}

export default HistoricalDataSync