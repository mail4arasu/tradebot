// Simplified Backtest Engine Server
// This will run on the dedicated Backtest VM

import express from 'express'
import cors from 'cors'
import mongoose from 'mongoose'
import dotenv from 'dotenv'

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

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    version: '1.0.0'
  })
})

// Test endpoint for backtesting
app.post('/api/backtest/test', (req, res) => {
  res.json({
    success: true,
    message: 'Backtest engine is ready',
    timestamp: new Date().toISOString()
  })
})

// Backtest status endpoint (placeholder)
app.get('/api/backtest/status', (req, res) => {
  res.json({
    success: true,
    running: 0,
    completed: 0,
    failed: 0
  })
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
app.use((req, res) => {
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
  console.log(`🔗 Environment: ${process.env.NODE_ENV || 'development'}`)
})

export default app