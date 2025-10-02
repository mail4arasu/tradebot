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

// Nifty50 Futures Contracts - Current and Historical
const NIFTY_FUTURES = [
  // Current Active Contracts
  { symbol: 'NIFTY25OCTFUT', expiry: '2025-10-28', active: true },
  { symbol: 'NIFTY25NOVFUT', expiry: '2025-11-25', active: true },
  { symbol: 'NIFTY25DECFUT', expiry: '2025-12-30', active: true },
  
  // Historical Contracts for Continuous Data
  { symbol: 'NIFTY25SEPFUT', expiry: '2025-09-26', active: false },
  { symbol: 'NIFTY25AUGFUT', expiry: '2025-08-29', active: false },
  { symbol: 'NIFTY25JULFUT', expiry: '2025-07-25', active: false },
  { symbol: 'NIFTY25JUNFUT', expiry: '2025-06-26', active: false },
  { symbol: 'NIFTY25MAYFUT', expiry: '2025-05-29', active: false },
  { symbol: 'NIFTY24DECFUT', expiry: '2024-12-26', active: false },
  { symbol: 'NIFTY24NOVFUT', expiry: '2024-11-28', active: false },
  { symbol: 'NIFTY24OCTFUT', expiry: '2024-10-31', active: false }
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
    const { action = 'start', days = 365, instruments = NIFTY_FUTURES.map(f => f.symbol) } = body

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

    // Get instruments list from NFO
    const nfoInstruments = await zerodha.getInstruments('NFO')
    
    console.log('📊 Looking for Nifty futures contracts...')
    
    // Find matching Nifty futures from our target list
    const niftyInstruments = nfoInstruments.filter((inst: any) => 
      inst.name === '"NIFTY"' && 
      inst.instrument_type === 'FUT' &&
      instruments.includes(inst.tradingsymbol)
    )
    
    console.log(`📊 Found ${niftyInstruments.length} matching Nifty futures:`)
    niftyInstruments.forEach(inst => {
      console.log(`  - ${inst.tradingsymbol} (Token: ${inst.instrument_token}, Expiry: ${inst.expiry})`)
    })

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
    
    // Create continuous contract from individual monthly contracts
    await createContinuousContract()
    
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

/**
 * Create continuous contract by stitching monthly futures
 */
async function createContinuousContract() {
  try {
    console.log('🔗 Creating continuous Nifty futures contract...')
    
    // Get all Nifty futures data, sorted by date
    const allData = await HistoricalData.find({
      symbol: 'NIFTY',
      timeframe: '5minute'
    }).sort({ date: 1 })
    
    if (allData.length === 0) {
      console.log('❌ No Nifty futures data found')
      return
    }
    
    // Group by contract and create rollover map
    const contractData = new Map()
    allData.forEach(candle => {
      if (!contractData.has(candle.tradingsymbol)) {
        contractData.set(candle.tradingsymbol, [])
      }
      contractData.get(candle.tradingsymbol).push(candle)
    })
    
    console.log(`📊 Processing ${contractData.size} contracts for continuous series`)
    
    // Sort contracts by expiry date
    const sortedContracts = NIFTY_FUTURES
      .filter(f => contractData.has(f.symbol))
      .sort((a, b) => new Date(a.expiry).getTime() - new Date(b.expiry).getTime())
    
    const continuousData = []
    let rolloverAdjustment = 0
    
    for (let i = 0; i < sortedContracts.length; i++) {
      const contract = sortedContracts[i]
      const candles = contractData.get(contract.symbol)
      const nextContract = sortedContracts[i + 1]
      
      console.log(`📈 Processing ${contract.symbol} (${candles.length} candles)`)
      
      // Determine rollover date (5 days before expiry)
      const expiryDate = new Date(contract.expiry)
      const rolloverDate = new Date(expiryDate)
      rolloverDate.setDate(rolloverDate.getDate() - 5)
      
      // Use data until rollover date
      const contractCandles = candles.filter(c => new Date(c.date) <= rolloverDate)
      
      // Calculate price adjustment for next contract
      if (nextContract && contractCandles.length > 0) {
        const lastPrice = contractCandles[contractCandles.length - 1].close
        const nextCandles = contractData.get(nextContract.symbol)
        const nextFirstCandle = nextCandles?.find(c => new Date(c.date) >= rolloverDate)
        
        if (nextFirstCandle) {
          const priceGap = lastPrice - nextFirstCandle.close
          rolloverAdjustment += priceGap
          console.log(`🔄 Rollover from ${contract.symbol} to ${nextContract.symbol}: adjustment ${priceGap.toFixed(2)}`)
        }
      }
      
      // Add adjusted candles to continuous series
      contractCandles.forEach(candle => {
        continuousData.push({
          ...candle.toObject(),
          tradingsymbol: 'NIFTY_CONTINUOUS',
          open: candle.open + rolloverAdjustment,
          high: candle.high + rolloverAdjustment,
          low: candle.low + rolloverAdjustment,
          close: candle.close + rolloverAdjustment,
          continuous: true
        })
      })
    }
    
    console.log(`📊 Created ${continuousData.length} continuous candles`)
    
    // Save continuous contract data
    if (continuousData.length > 0) {
      const bulkOps = continuousData.map(candle => ({
        updateOne: {
          filter: {
            tradingsymbol: 'NIFTY_CONTINUOUS',
            timeframe: candle.timeframe,
            date: candle.date
          },
          update: { $set: candle },
          upsert: true
        }
      }))
      
      await HistoricalData.bulkWrite(bulkOps)
      console.log(`✅ Saved ${continuousData.length} continuous contract candles`)
    }
    
  } catch (error) {
    console.error('❌ Error creating continuous contract:', error)
  }
}