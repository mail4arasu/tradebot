// Admin API for Historical Data Sync
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '../../../../lib/auth'
import mongoose from 'mongoose'
import { ZerodhaAPI } from '../../../../lib/zerodha'
import { decrypt } from '../../../../lib/encryption'
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

// Nifty50 Futures Contracts - Maximum Historical Coverage (3+ years)
const NIFTY_FUTURES = [
  // Current Active Contracts (2025)
  { symbol: 'NIFTY25OCTFUT', expiry: '2025-10-28', active: true },
  { symbol: 'NIFTY25NOVFUT', expiry: '2025-11-25', active: true },
  { symbol: 'NIFTY25DECFUT', expiry: '2025-12-30', active: true },
  
  // 2025 Historical Contracts
  { symbol: 'NIFTY25SEPFUT', expiry: '2025-09-26', active: false },
  { symbol: 'NIFTY25AUGFUT', expiry: '2025-08-29', active: false },
  { symbol: 'NIFTY25JULFUT', expiry: '2025-07-25', active: false },
  { symbol: 'NIFTY25JUNFUT', expiry: '2025-06-26', active: false },
  { symbol: 'NIFTY25MAYFUT', expiry: '2025-05-29', active: false },
  { symbol: 'NIFTY25APRFUT', expiry: '2025-04-24', active: false },
  { symbol: 'NIFTY25MARFUT', expiry: '2025-03-27', active: false },
  { symbol: 'NIFTY25FEBFUT', expiry: '2025-02-27', active: false },
  { symbol: 'NIFTY25JANFUT', expiry: '2025-01-30', active: false },
  
  // 2024 Historical Contracts (Full Year)
  { symbol: 'NIFTY24DECFUT', expiry: '2024-12-26', active: false },
  { symbol: 'NIFTY24NOVFUT', expiry: '2024-11-28', active: false },
  { symbol: 'NIFTY24OCTFUT', expiry: '2024-10-31', active: false },
  { symbol: 'NIFTY24SEPFUT', expiry: '2024-09-26', active: false },
  { symbol: 'NIFTY24AUGFUT', expiry: '2024-08-29', active: false },
  { symbol: 'NIFTY24JULFUT', expiry: '2024-07-25', active: false },
  { symbol: 'NIFTY24JUNFUT', expiry: '2024-06-27', active: false },
  { symbol: 'NIFTY24MAYFUT', expiry: '2024-05-30', active: false },
  { symbol: 'NIFTY24APRFUT', expiry: '2024-04-25', active: false },
  { symbol: 'NIFTY24MARFUT', expiry: '2024-03-28', active: false },
  { symbol: 'NIFTY24FEBFUT', expiry: '2024-02-29', active: false },
  { symbol: 'NIFTY24JANFUT', expiry: '2024-01-25', active: false },
  
  // 2023 Historical Contracts (Full Year)
  { symbol: 'NIFTY23DECFUT', expiry: '2023-12-28', active: false },
  { symbol: 'NIFTY23NOVFUT', expiry: '2023-11-30', active: false },
  { symbol: 'NIFTY23OCTFUT', expiry: '2023-10-26', active: false },
  { symbol: 'NIFTY23SEPFUT', expiry: '2023-09-28', active: false },
  { symbol: 'NIFTY23AUGFUT', expiry: '2023-08-31', active: false },
  { symbol: 'NIFTY23JULFUT', expiry: '2023-07-27', active: false },
  { symbol: 'NIFTY23JUNFUT', expiry: '2023-06-29', active: false },
  { symbol: 'NIFTY23MAYFUT', expiry: '2023-05-25', active: false },
  { symbol: 'NIFTY23APRFUT', expiry: '2023-04-27', active: false },
  { symbol: 'NIFTY23MARFUT', expiry: '2023-03-30', active: false },
  { symbol: 'NIFTY23FEBFUT', expiry: '2023-02-23', active: false },
  { symbol: 'NIFTY23JANFUT', expiry: '2023-01-26', active: false },
  
  // 2022 Historical Contracts (Full Year)
  { symbol: 'NIFTY22DECFUT', expiry: '2022-12-29', active: false },
  { symbol: 'NIFTY22NOVFUT', expiry: '2022-11-24', active: false },
  { symbol: 'NIFTY22OCTFUT', expiry: '2022-10-27', active: false },
  { symbol: 'NIFTY22SEPFUT', expiry: '2022-09-29', active: false },
  { symbol: 'NIFTY22AUGFUT', expiry: '2022-08-25', active: false },
  { symbol: 'NIFTY22JULFUT', expiry: '2022-07-28', active: false },
  { symbol: 'NIFTY22JUNFUT', expiry: '2022-06-30', active: false },
  { symbol: 'NIFTY22MAYFUT', expiry: '2022-05-26', active: false },
  { symbol: 'NIFTY22APRFUT', expiry: '2022-04-28', active: false },
  { symbol: 'NIFTY22MARFUT', expiry: '2022-03-31', active: false },
  { symbol: 'NIFTY22FEBFUT', expiry: '2022-02-24', active: false },
  { symbol: 'NIFTY22JANFUT', expiry: '2022-01-27', active: false }
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

    // Connect to database
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/tradebot')
    }

    const body = await request.json()
    const { action = 'start', days = 1095, instruments = NIFTY_FUTURES.map(f => f.symbol) } = body // Default 3 years (1095 days)

    if (action === 'start') {
      // Start background sync process
      console.log('🚀 Starting historical data sync...')
      
      // Trigger sync in background (don't await to return quickly)
      syncHistoricalDataBackground(days, instruments).catch(console.error)
      
      // Calculate estimated time based on chunks
      const chunksPerInstrument = Math.ceil(days / 90) // 90-day chunks
      const requestsPerInstrument = chunksPerInstrument * 2 // 5min + daily data
      const totalRequests = instruments.length * requestsPerInstrument
      const estimatedMinutes = Math.ceil(totalRequests * 1.5 / 60) // 1.5 seconds per request including delays

      return NextResponse.json({
        success: true,
        message: 'Historical data sync started in background',
        syncId: 'sync_' + Date.now(),
        estimatedTime: `${estimatedMinutes} minutes`,
        contracts: instruments.length,
        chunks: chunksPerInstrument,
        totalRequests: totalRequests
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

    // Connect to database
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/tradebot')
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

function createDateChunks(startDate: Date, endDate: Date, chunkSizeDays: number) {
  const chunks = []
  let currentStart = new Date(startDate)
  
  while (currentStart < endDate) {
    const currentEnd = new Date(currentStart)
    currentEnd.setDate(currentEnd.getDate() + chunkSizeDays)
    
    // Don't exceed the overall end date
    if (currentEnd > endDate) {
      currentEnd.setTime(endDate.getTime())
    }
    
    chunks.push({
      start: new Date(currentStart),
      end: new Date(currentEnd)
    })
    
    // Move to next chunk
    currentStart = new Date(currentEnd)
    currentStart.setDate(currentStart.getDate() + 1)
  }
  
  return chunks
}

async function syncHistoricalDataBackground(days: number, instruments: string[]) {
  try {
    console.log(`📊 Background sync started for ${instruments.length} instruments, ${days} days`)
    console.log('🎯 Target instruments:', instruments)
    
    // Connect to database
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/tradebot')
    }
    
    // Get connected user
    const user = await User.findOne({ 'zerodhaConfig.isConnected': true })
    if (!user) {
      console.error('❌ No connected Zerodha user found')
      throw new Error('No connected Zerodha user found')
    }
    
    console.log('✅ Found connected user:', user.email)

    // Decrypt credentials before using them
    const apiKey = decrypt(user.zerodhaConfig.apiKey)
    const apiSecret = decrypt(user.zerodhaConfig.apiSecret)
    const accessToken = decrypt(user.zerodhaConfig.accessToken)

    console.log('🔐 Using decrypted credentials for:', user.email)

    const zerodha = new ZerodhaAPI()
    zerodha.setCredentials(apiKey, apiSecret, accessToken)

    // Get instruments list from NFO
    const nfoInstruments = await zerodha.getInstruments('NFO')
    
    console.log('📊 Looking for Nifty futures contracts...')
    
    // Find ALL available Nifty futures (not just our predefined list)
    const allNiftyInstruments = nfoInstruments.filter((inst: any) => 
      inst.name === '"NIFTY"' && 
      inst.instrument_type === 'FUT'
    )
    
    console.log(`📊 Found ${allNiftyInstruments.length} total Nifty futures in Zerodha`)
    
    // Filter by our target list if specified, otherwise use all available
    const niftyInstruments = instruments.length === NIFTY_FUTURES.length ? 
      allNiftyInstruments : // Use all available if no specific filter
      allNiftyInstruments.filter((inst: any) => instruments.includes(inst.tradingsymbol))
    
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
        
        // Fetch data in chunks due to Zerodha's 100-day limit
        const chunks = createDateChunks(startDate, endDate, 90) // Use 90 days to be safe
        let total5min = 0
        let totalDaily = 0
        
        for (const chunk of chunks) {
          console.log(`  📅 Fetching chunk: ${chunk.start.toISOString().split('T')[0]} to ${chunk.end.toISOString().split('T')[0]}`)
          
          try {
            // Fetch 5-minute data for this chunk
            const data5min = await zerodha.getHistoricalData(
              instrument.instrument_token,
              '5minute',
              chunk.start,
              chunk.end
            )
            
            if (data5min && data5min.length > 0) {
              await saveCandles(instrument, data5min, '5minute')
              total5min += data5min.length
              console.log(`    ✅ Saved ${data5min.length} 5-minute candles for this chunk`)
            }
            
            // Small delay between 5min and daily requests
            await new Promise(resolve => setTimeout(resolve, 500))
            
            // Fetch daily data for this chunk
            const dataDaily = await zerodha.getHistoricalData(
              instrument.instrument_token,
              'day',
              chunk.start,
              chunk.end
            )
            
            if (dataDaily && dataDaily.length > 0) {
              await saveCandles(instrument, dataDaily, 'day')
              totalDaily += dataDaily.length
              console.log(`    ✅ Saved ${dataDaily.length} daily candles for this chunk`)
            }
            
            // Rate limit delay between chunks
            await new Promise(resolve => setTimeout(resolve, 1000))
            
          } catch (chunkError) {
            console.error(`    ❌ Error fetching chunk ${chunk.start.toISOString().split('T')[0]} to ${chunk.end.toISOString().split('T')[0]}:`, chunkError)
          }
        }
        
        console.log(`  📊 Total saved for ${instrument.tradingsymbol}: ${total5min} 5-min candles, ${totalDaily} daily candles`)
        
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
  // Ensure database connection
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/tradebot')
  }
  
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