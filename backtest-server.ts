// Backtest Engine Server
// This will run on the dedicated Backtest VM

import express from 'express'
import cors from 'cors'
import mongoose from 'mongoose'
import dotenv from 'dotenv'
import { BacktestProcessor } from './src/services/backtestProcessor'
import { HistoricalDataSync } from './src/services/historicalDataSync'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 4000

// Middleware
app.use(cors())
app.use(express.json())

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/backtest')
  .then(() => console.log('✅ Connected to MongoDB'))
  .catch(err => console.error('❌ MongoDB connection error:', err))

// Initialize services
const backtestProcessor = new BacktestProcessor()
const historicalDataSync = new HistoricalDataSync()

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    services: {
      backtestProcessor: 'ready',
      historicalDataSync: 'ready'
    }
  })
})

// Backtest management endpoints
app.post('/api/backtest/start', async (req, res) => {
  try {
    const { params } = req.body
    const backtestId = await backtestProcessor.startBacktest(params)
    
    res.json({
      success: true,
      backtestId,
      message: 'Backtest started successfully'
    })
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message
    })
  }
})

app.get('/api/backtest/status/:id', async (req, res) => {
  try {
    const { id } = req.params
    const status = await backtestProcessor.getBacktestStatus(id)
    
    res.json({
      success: true,
      status
    })
  } catch (error: any) {
    res.status(404).json({
      success: false,
      error: error.message
    })
  }
})

app.get('/api/backtest/result/:id', async (req, res) => {
  try {
    const { id } = req.params
    const result = await backtestProcessor.getBacktestResult(id)
    
    res.json({
      success: true,
      result
    })
  } catch (error: any) {
    res.status(404).json({
      success: false,
      error: error.message
    })
  }
})

app.delete('/api/backtest/:id', async (req, res) => {
  try {
    const { id } = req.params
    await backtestProcessor.deleteBacktest(id)
    
    res.json({
      success: true,
      message: 'Backtest deleted successfully'
    })
  } catch (error: any) {
    res.status(404).json({
      success: false,
      error: error.message
    })
  }
})

// Historical data management endpoints
app.post('/api/data/sync', async (req, res) => {
  try {
    const { symbol, startDate, endDate, timeframe } = req.body
    const result = await historicalDataSync.syncHistoricalData(symbol, startDate, endDate, timeframe)
    
    res.json({
      success: true,
      result
    })
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message
    })
  }
})

app.get('/api/data/status', async (req, res) => {
  try {
    const status = await historicalDataSync.getSyncStatus()
    
    res.json({
      success: true,
      status
    })
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message
    })
  }
})

// Data availability endpoints
app.get('/api/data/available/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params
    const { timeframe } = req.query
    
    const availability = await historicalDataSync.getDataAvailability(symbol, timeframe as string)
    
    res.json({
      success: true,
      availability
    })
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message
    })
  }
})

// List all backtests
app.get('/api/backtest/list', async (req, res) => {
  try {
    const { status, botId } = req.query
    const backtests = await backtestProcessor.listBacktests(status as string, botId as string)
    
    res.json({
      success: true,
      backtests
    })
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message
    })
  }
})

// Error handling middleware
app.use((error: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Server error:', error)
  res.status(500).json({
    success: false,
    error: 'Internal server error'
  })
})

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Route not found'
  })
})

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('🔄 SIGTERM received. Shutting down gracefully...')
  await mongoose.connection.close()
  process.exit(0)
})

process.on('SIGINT', async () => {
  console.log('🔄 SIGINT received. Shutting down gracefully...')
  await mongoose.connection.close()
  process.exit(0)
})

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Backtest Engine Server running on port ${PORT}`)
  console.log(`📊 Health check: http://localhost:${PORT}/health`)
})

export default app