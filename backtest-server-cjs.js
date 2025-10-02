// Simple Backtest Engine Server (CommonJS)
// This will run on the dedicated Backtest VM

const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 4000;

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/backtest')
  .then(() => console.log('✅ Connected to MongoDB'))
  .catch(err => console.error('❌ MongoDB connection error:', err));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development'
  });
});

// Test endpoint for backtesting
app.post('/api/backtest/test', (req, res) => {
  res.json({
    success: true,
    message: 'Backtest engine is ready',
    timestamp: new Date().toISOString()
  });
});

// Backtest start endpoint (simplified)
app.post('/api/backtest/start', (req, res) => {
  const { params } = req.body;
  
  if (!params) {
    return res.status(400).json({
      success: false,
      error: 'Backtest parameters are required'
    });
  }
  
  // Generate a mock backtest ID
  const backtestId = 'bt_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  
  console.log('Received backtest request:', params);
  
  // For now, return a success response
  // TODO: Implement actual backtest processing
  res.json({
    success: true,
    backtestId: backtestId,
    message: 'Backtest simulation started (mock implementation)',
    params: params
  });
});

// Backtest status endpoint (placeholder)
app.get('/api/backtest/status', (req, res) => {
  res.json({
    success: true,
    running: 0,
    completed: 0,
    failed: 0,
    message: 'Backtest engine operational'
  });
});

// Get specific backtest status
app.get('/api/backtest/status/:id', (req, res) => {
  const { id } = req.params;
  
  res.json({
    success: true,
    status: {
      id: id,
      status: 'COMPLETED',
      progress: 100,
      message: 'Mock backtest completed'
    }
  });
});

// Get backtest result
app.get('/api/backtest/result/:id', (req, res) => {
  const { id } = req.params;
  
  // Mock result for testing
  res.json({
    success: true,
    result: {
      id: id,
      status: 'COMPLETED',
      totalReturn: 15000,
      totalReturnPercent: 15.0,
      winRate: 65.5,
      totalTrades: 25,
      winningTrades: 16,
      losingTrades: 9,
      maxDrawdown: 8500,
      maxDrawdownPercent: 8.5,
      sharpeRatio: 1.85,
      message: 'This is a mock result for testing'
    }
  });
});

// Delete backtest
app.delete('/api/backtest/:id', (req, res) => {
  const { id } = req.params;
  
  res.json({
    success: true,
    message: `Backtest ${id} deleted successfully (mock)`
  });
});

// List backtests
app.get('/api/backtest/list', (req, res) => {
  res.json({
    success: true,
    backtests: []
  });
});

// Data sync endpoint
app.post('/api/data/sync', (req, res) => {
  const { symbol, startDate, endDate, timeframe } = req.body;
  
  console.log(`Mock data sync request: ${symbol} ${timeframe} from ${startDate} to ${endDate}`);
  
  res.json({
    success: true,
    result: {
      syncId: 'sync_' + Date.now(),
      message: 'Data sync started (mock implementation)'
    }
  });
});

// Data sync status
app.get('/api/data/status', (req, res) => {
  res.json({
    success: true,
    status: []
  });
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Server error:', error);
  res.status(500).json({
    success: false,
    error: 'Internal server error'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Route not found'
  });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('🔄 SIGTERM received. Shutting down gracefully...');
  await mongoose.connection.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('🔄 SIGINT received. Shutting down gracefully...');
  await mongoose.connection.close();
  process.exit(0);
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Backtest Engine Server running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`🔗 Environment: ${process.env.NODE_ENV || 'development'}`);
});

module.exports = app;