// Admin API for Historical Data Sync
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '../../../../lib/auth'
import mongoose from 'mongoose'
import { ZerodhaAPI } from '../../../../lib/zerodha'
import User from '../../../../models/User'

// Historical Data Schema
const HistoricalDataSchema = new mongoose.Schema({
  instrument_token: { type: Number, required: true, index: true },
  symbol: { type: String, required: true, index: true },
  exchange: { type: String, required: true },
  tradingsymbol: { type: String, required: true, index: true },
  expiry: { type: Date },
  lot_size: { type: Number },
  
  // OHLC Data
  date: { type: Date, required: true, index: true },
  timeframe: { type: String, required: true, index: true },
  open: { type: Number, required: true },
  high: { type: Number, required: true },
  low: { type: Number, required: true },
  close: { type: Number, required: true },
  volume: { type: Number, required: true },
  
  created_at: { type: Date, default: Date.now }
}, {
  indexes: [
    { symbol: 1, timeframe: 1, date: 1 },
    { tradingsymbol: 1, timeframe: 1, date: 1 }
  ]
})

const HistoricalData = mongoose.models.HistoricalData || mongoose.model('HistoricalData', HistoricalDataSchema)

// Nifty50 Continuous Futures Contract
const NIFTY_CONTRACTS = [
  'NIFTY', // Continuous contract symbol
  'NIFTY50' // Alternative continuous contract symbol
]

// Also include current month for live trading
const CURRENT_CONTRACTS = [
  'NIFTY25OCTFUT', // Current month for live trading
  'NIFTY25NOVFUT'  // Next month for live trading
]

/**
 * POST /api/admin/sync-data - Start historical data sync
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Admin check
    const adminEmails = ['mail4arasu@gmail.com', 'admin@niveshawealth.in']
    if (!adminEmails.includes(session.user.email)) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const body = await request.json()
    const { action = 'start', days = 365, instruments = [...NIFTY_CONTRACTS, ...CURRENT_CONTRACTS] } = body

    if (action === 'start') {
      // Start background sync process
      console.log('🚀 Starting historical data sync...')
      
      // Trigger sync in background (don't await to return quickly)
      syncHistoricalDataBackground(days, instruments).catch(console.error)
      
      return NextResponse.json({
        success: true,
        message: 'Historical data sync started in background',
        syncId: 'sync_' + Date.now(),
        estimatedTime: `${instruments.length * 2} minutes`,
        contracts: instruments.length
      })
    }

    if (action === 'status') {
      // Get current data statistics
      const stats = await getDataStats()
      
      return NextResponse.json({
        success: true,
        stats: stats
      })
    }

    return NextResponse.json({
      success: false,
      error: 'Invalid action. Use: start, status'
    }, { status: 400 })

  } catch (error: any) {
    console.error('Data sync API error:', error)
    return NextResponse.json({
      success: false,
      error: error.message || 'Internal server error'
    }, { status: 500 })
  }
}

/**
 * GET /api/admin/sync-data - Get sync status and statistics
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const stats = await getDataStats()
    
    return NextResponse.json({
      success: true,
      message: 'Historical data statistics',
      stats: stats,
      lastUpdate: new Date().toISOString()
    })

  } catch (error: any) {
    console.error('Data sync status error:', error)
    return NextResponse.json({
      success: false,
      error: error.message || 'Internal server error'
    }, { status: 500 })
  }
}

async function syncHistoricalDataBackground(days: number, instruments: string[]) {
  try {
    console.log(`📊 Background sync started for ${instruments.length} instruments, ${days} days`)
    console.log('🎯 Target instruments:', instruments)
    
    // Get connected user
    const user = await User.findOne({ 'zerodhaConfig.isConnected': true })
    if (!user) {
      console.error('❌ No connected Zerodha user found')
      throw new Error('No connected Zerodha user found')
    }
    
    console.log('✅ Found connected user:', user.email)

    const zerodha = new ZerodhaAPI()
    zerodha.setCredentials(
      user.zerodhaConfig.apiKey,
      user.zerodhaConfig.apiSecret,
      user.zerodhaConfig.accessToken
    )

    // Get instruments list - Check both NFO and NSE for continuous contracts
    const nfoInstruments = await zerodha.getInstruments('NFO')
    const nseInstruments = await zerodha.getInstruments('NSE')
    
    console.log('📊 Looking for continuous contracts...')
    
    // Look for continuous contracts in NSE first
    let niftyInstruments = nseInstruments.filter((inst: any) => 
      (inst.name === 'NIFTY 50' || inst.name === 'NIFTY' || inst.tradingsymbol === 'NIFTY 50') &&
      inst.instrument_type === 'EQ' // Continuous contracts are usually in EQ
    )
    
    console.log(`Found ${niftyInstruments.length} continuous contracts in NSE`)
    
    // If no continuous contracts found, fall back to current month futures
    if (niftyInstruments.length === 0) {
      console.log('📊 No continuous contracts found, using current month futures...')
      niftyInstruments = nfoInstruments.filter((inst: any) => 
        inst.name === 'NIFTY' && 
        inst.instrument_type === 'FUT' &&
        (inst.tradingsymbol.includes('25OCT') || inst.tradingsymbol.includes('25NOV'))
      )
    }
    
    // Also add current futures for live trading
    const currentFutures = nfoInstruments.filter((inst: any) => 
      inst.name === 'NIFTY' && 
      inst.instrument_type === 'FUT' &&
      (inst.tradingsymbol.includes('25OCT') || inst.tradingsymbol.includes('25NOV'))
    )
    
    // Combine continuous and current futures
    niftyInstruments = [...niftyInstruments, ...currentFutures]

    console.log(`✅ Found ${niftyInstruments.length} matching Nifty futures`)

    const endDate = new Date()
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - days)

    for (const instrument of niftyInstruments) {
      try {
        console.log(`📈 Syncing ${instrument.tradingsymbol}...`)
        
        // Fetch 5-minute data
        const data5min = await zerodha.getHistoricalData(
          instrument.instrument_token,
          '5minute',
          startDate,
          endDate
        )
        
        if (data5min && data5min.length > 0) {
          await saveCandles(instrument, data5min, '5minute')
          console.log(`  ✅ Saved ${data5min.length} 5-minute candles`)
        }
        
        // Fetch daily data
        const dataDaily = await zerodha.getHistoricalData(
          instrument.instrument_token,
          'day',
          startDate,
          endDate
        )
        
        if (dataDaily && dataDaily.length > 0) {
          await saveCandles(instrument, dataDaily, 'day')
          console.log(`  ✅ Saved ${dataDaily.length} daily candles`)
        }
        
        // Rate limit delay
        await new Promise(resolve => setTimeout(resolve, 1000))
        
      } catch (error) {
        console.error(`❌ Error syncing ${instrument.tradingsymbol}:`, error)
      }
    }
    
    console.log('✅ Background historical data sync completed')
    
  } catch (error) {
    console.error('❌ Background sync error:', error)
  }
}

async function saveCandles(instrument: any, candles: any[], timeframe: string) {
  const bulkOps = candles.map((candle: any) => ({
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
          lot_size: instrument.lot_size || 25,
          
          date: new Date(candle.date),
          timeframe: timeframe,
          open: candle.open,
          high: candle.high,
          low: candle.low,
          close: candle.close,
          volume: candle.volume || 0,
          
          created_at: new Date()
        }
      },
      upsert: true
    }
  }))
  
  await HistoricalData.bulkWrite(bulkOps)
}

async function getDataStats() {
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
  
  return stats
}