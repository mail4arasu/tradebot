// Historical Data Database Model for Backtest VM
import mongoose, { Schema, Document } from 'mongoose'
import { HistoricalDataPoint } from '../lib/backtesting/types'

export interface IHistoricalData extends Document {
  symbol: string
  exchange: string
  timeframe: '5min' | '1day'
  timestamp: Date
  open: number
  high: number
  low: number
  close: number
  volume: number
  createdAt: Date
  updatedAt: Date
}

const HistoricalDataSchema = new Schema<IHistoricalData>({
  symbol: {
    type: String,
    required: true,
    index: true
  },
  exchange: {
    type: String,
    required: true,
    default: 'NSE'
  },
  timeframe: {
    type: String,
    enum: ['5min', '1day'],
    required: true,
    index: true
  },
  timestamp: {
    type: Date,
    required: true,
    index: true
  },
  open: {
    type: Number,
    required: true
  },
  high: {
    type: Number,
    required: true
  },
  low: {
    type: Number,
    required: true
  },
  close: {
    type: Number,
    required: true
  },
  volume: {
    type: Number,
    required: true,
    default: 0
  }
}, {
  timestamps: true,
  collection: 'historical_data'
})

// Compound indexes for efficient queries
HistoricalDataSchema.index({ symbol: 1, timeframe: 1, timestamp: 1 }, { unique: true })
HistoricalDataSchema.index({ symbol: 1, timeframe: 1, timestamp: -1 })
HistoricalDataSchema.index({ timestamp: -1 })

// Define interface for static methods
interface IHistoricalDataModel extends mongoose.Model<IHistoricalData> {
  getDataRange(symbol: string, timeframe: '5min' | '1day', startDate: Date, endDate: Date): Promise<any[]>
  getLatestData(symbol: string, timeframe: '5min' | '1day', limit?: number): Promise<any[]>
  getDataAvailability(symbol: string, timeframe?: '5min' | '1day'): Promise<any[]>
  bulkInsertData(dataPoints: HistoricalDataPoint[]): Promise<any>
  getMissingDataRanges(symbol: string, timeframe: '5min' | '1day', startDate: Date, endDate: Date): Promise<{ start: Date, end: Date }[]>
  cleanupOldData(daysToKeep?: number): Promise<any>
}

// Static methods for data operations
HistoricalDataSchema.statics.getDataRange = async function(
  symbol: string, 
  timeframe: '5min' | '1day', 
  startDate: Date, 
  endDate: Date
) {
  return this.find({
    symbol,
    timeframe,
    timestamp: {
      $gte: startDate,
      $lte: endDate
    }
  }).sort({ timestamp: 1 }).lean()
}

HistoricalDataSchema.statics.getLatestData = async function(
  symbol: string, 
  timeframe: '5min' | '1day', 
  limit: number = 100
) {
  return this.find({
    symbol,
    timeframe
  })
  .sort({ timestamp: -1 })
  .limit(limit)
  .lean()
}

HistoricalDataSchema.statics.getDataAvailability = async function(
  symbol: string, 
  timeframe?: '5min' | '1day'
) {
  const query: any = { symbol }
  if (timeframe) query.timeframe = timeframe
  
  const pipeline = [
    { $match: query },
    {
      $group: {
        _id: { symbol: '$symbol', timeframe: '$timeframe' },
        startDate: { $min: '$timestamp' },
        endDate: { $max: '$timestamp' },
        count: { $sum: 1 }
      }
    }
  ]
  
  return this.aggregate(pipeline)
}

HistoricalDataSchema.statics.bulkInsertData = async function(
  dataPoints: HistoricalDataPoint[]
) {
  const operations = dataPoints.map(point => ({
    updateOne: {
      filter: {
        symbol: point.symbol,
        timeframe: point.timeframe,
        timestamp: point.timestamp
      },
      update: {
        $set: {
          open: point.open,
          high: point.high,
          low: point.low,
          close: point.close,
          volume: point.volume,
          exchange: point.exchange
        }
      },
      upsert: true
    }
  }))
  
  return this.bulkWrite(operations)
}

HistoricalDataSchema.statics.getMissingDataRanges = async function(
  symbol: string,
  timeframe: '5min' | '1day',
  startDate: Date,
  endDate: Date
) {
  // Get all existing data points in the range
  const existingData = await this.find({
    symbol,
    timeframe,
    timestamp: {
      $gte: startDate,
      $lte: endDate
    }
  }, { timestamp: 1 }).sort({ timestamp: 1 }).lean()
  
  const missing: { start: Date, end: Date }[] = []
  
  if (existingData.length === 0) {
    return [{ start: startDate, end: endDate }]
  }
  
  // Check gap from start to first data point
  const firstDataPoint = existingData[0].timestamp
  if (firstDataPoint > startDate) {
    missing.push({ start: startDate, end: new Date(firstDataPoint.getTime() - 1) })
  }
  
  // Check gaps between data points
  for (let i = 0; i < existingData.length - 1; i++) {
    const current = existingData[i].timestamp
    const next = existingData[i + 1].timestamp
    
    // Calculate expected next timestamp based on timeframe
    const expectedNext = new Date(current)
    if (timeframe === '5min') {
      expectedNext.setMinutes(expectedNext.getMinutes() + 5)
    } else {
      expectedNext.setDate(expectedNext.getDate() + 1)
    }
    
    // If there's a gap larger than the timeframe interval
    if (next.getTime() - current.getTime() > (timeframe === '5min' ? 5 * 60 * 1000 : 24 * 60 * 60 * 1000)) {
      missing.push({ 
        start: expectedNext, 
        end: new Date(next.getTime() - 1)
      })
    }
  }
  
  // Check gap from last data point to end
  const lastDataPoint = existingData[existingData.length - 1].timestamp
  if (lastDataPoint < endDate) {
    missing.push({ start: new Date(lastDataPoint.getTime() + 1), end: endDate })
  }
  
  return missing
}

HistoricalDataSchema.statics.cleanupOldData = async function(
  daysToKeep: number = 365
) {
  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - daysToKeep)
  
  return this.deleteMany({
    timestamp: { $lt: cutoffDate }
  })
}

export const HistoricalDataModel = mongoose.model<IHistoricalData, IHistoricalDataModel>('HistoricalData', HistoricalDataSchema)
export default HistoricalDataModel