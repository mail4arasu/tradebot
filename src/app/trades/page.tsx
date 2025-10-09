'use client'

import { useSession } from 'next-auth/react'
import { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ArrowLeft, TrendingUp, TrendingDown, RefreshCw, BarChart3, Activity, FileText, Filter, RotateCcw, Download, Clock, Target, Shield, PieChart, Search, Zap, AlertTriangle, Eye } from 'lucide-react'
import Link from 'next/link'
import { ZerodhaTable, PositionRow, OrderRow, TradeRow, BotPositionRow } from './zerodha-style'

interface Trade {
  trade_id: string
  tradingsymbol: string
  exchange: string
  transaction_type: 'BUY' | 'SELL'
  quantity: number
  price: number
  trade_date: string
  order_id: string
  product: string
  bot_id?: string
  bot_name?: string
  trade_source?: string
}

interface Position {
  tradingsymbol: string
  exchange: string
  instrument_token: string
  product: string
  quantity: number
  overnight_quantity: number
  multiplier: number
  average_price: number
  close_price: number
  last_price: number
  value: number
  pnl: number
  m2m: number
  unrealised: number
  realised: number
}

interface Order {
  order_id: string
  parent_order_id: string
  tradingsymbol: string
  exchange: string
  transaction_type: 'BUY' | 'SELL'
  order_type: string
  product: string
  quantity: number
  filled_quantity: number
  pending_quantity: number
  price: number
  trigger_price: number
  average_price: number
  status: string
  status_message: string
  order_timestamp: string
  exchange_timestamp: string
  variety: string
  validity: string
}

interface BotPosition {
  _id: string
  positionId: string
  symbol: string
  exchange: string
  instrumentType: string
  side: 'LONG' | 'SHORT'
  status: 'OPEN' | 'PARTIAL' | 'CLOSED'
  entryPrice: number
  entryQuantity: number
  currentQuantity: number
  averagePrice: number
  entryTime: string
  entryOrderId: string
  exitExecutions: Array<{
    executionId: string
    quantity: number
    price: number
    time: string
    reason: string
  }>
  totalExitQuantity: number
  unrealizedPnl: number
  realizedPnl: number
  totalPnl: number
  totalFees: number
  isIntraday: boolean
  scheduledExitTime?: string
  autoSquareOffScheduled: boolean
  stopLoss?: number
  target?: number
  notes?: string
  tags: string[]
  createdAt: string
  updatedAt: string
  botId: string
  botName: string
  botStrategy: string
  botTradingType: string
  botRiskLevel: string
  allocatedAmount: number
  riskPercentage: number
  durationInPosition: number
  pnlPercentage: number
}

interface WebhookSignal {
  _id: string
  signal: string
  symbol: string
  exchange: string
  price: number
  processed: boolean
  processedAt: string
  emergencyStop: boolean
  totalUsersTargeted: number
  successfulExecutions: number
  failedExecutions: number
  createdAt: string
  bot: {
    name: string
    strategy: string
  }
  executions: Array<{
    _id: string
    userId: string
    quantity: number
    status: string
    executedPrice: number
    error: string
    createdAt: string
    user: {
      email: string
      name: string
    }
  }>
  userStats: {
    totalExecutions: number
    successfulExecutions: number
    failedExecutions: number
    successRate: number
  }
}

interface Holding {
  tradingsymbol: string
  exchange: string
  instrument_token: string
  isin: string
  product: string
  quantity: number
  t1_quantity: number
  realised_quantity: number
  authorised_quantity: number
  authorised_date: string
  opening_quantity: number
  collateral_quantity: number
  collateral_type: string
  discrepancy: boolean
  average_price: number
  last_price: number
  close_price: number
  pnl: number
  day_change: number
  day_change_percentage: number
}

// Component to handle search params with Suspense
function TradesContent() {
  const { data: session, status } = useSession()
  const searchParams = useSearchParams()
  const [trades, setTrades] = useState<Trade[]>([])
  const [positions, setPositions] = useState<{net: Position[], day: Position[]}>({net: [], day: []})
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [positionsLoading, setPositionsLoading] = useState(true)
  const [ordersLoading, setOrdersLoading] = useState(true)
  const [error, setError] = useState('')
  const [positionsError, setPositionsError] = useState('')
  const [ordersError, setOrdersError] = useState('')
  const [activeTab, setActiveTab] = useState<'bot-positions' | 'positions' | 'orders' | 'trades' | 'equity' | 'holdings' | 'bot-activity'>('bot-positions')
  
  // Bot positions state
  const [botPositions, setBotPositions] = useState<BotPosition[]>([])
  const [botPositionsLoading, setBotPositionsLoading] = useState(true)
  const [botPositionsError, setBotPositionsError] = useState('')
  const [botPositionsSummary, setBotPositionsSummary] = useState({
    totalPositions: 0,
    openPositions: 0,
    closedPositions: 0,
    totalUnrealizedPnl: 0,
    totalRealizedPnl: 0,
    totalPnl: 0
  })
  const [syncing, setSyncing] = useState(false)
  const [syncStatus, setSyncStatus] = useState<any>(null)
  const [cleaning, setCleaning] = useState(false)
  const [generatingContractNote, setGeneratingContractNote] = useState(false)
  
  // Order filtering states (no date filters - Zerodha API limitation)
  const [orderFilters, setOrderFilters] = useState({
    orderStatus: 'all' as 'all' | 'complete' | 'open' | 'cancelled'
  })
  
  // Trade filtering states
  const [tradeFilters, setTradeFilters] = useState({
    startDate: '',
    endDate: '',
    botType: 'all' as 'all' | 'bot' | 'manual'
  })
  const [equityData, setEquityData] = useState<{date: string, value: number, pnl: number, totalPnL?: number, botPerformance?: any[]}[]>([])
  const [totalPnl, setTotalPnl] = useState(0)
  const [equityLoading, setEquityLoading] = useState(false)
  const [equityError, setEquityError] = useState('')
  const [equitySummary, setEquitySummary] = useState({
    totalDays: 0,
    profitableDays: 0,
    winRate: 0,
    averageDailyPnL: 0,
    bestDay: 0,
    worstDay: 0
  })
  const [availableBots, setAvailableBots] = useState<{id: string, name: string}[]>([])
  const [selectedBot, setSelectedBot] = useState<string>('all')
  const [orderSummary, setOrderSummary] = useState({
    total: 0,
    complete: 0,
    open: 0,
    cancelled: 0,
    totalValue: 0
  })
  
  // Search states for Zerodha-style UI
  const [searchTerms, setSearchTerms] = useState({
    botPositions: '',
    positions: '',
    orders: '',
    trades: '',
    botActivity: ''
  })
  
  // Bot Activity state
  const [webhookSignals, setWebhookSignals] = useState<WebhookSignal[]>([])
  const [webhookSignalsLoading, setWebhookSignalsLoading] = useState(true)
  const [webhookSignalsError, setWebhookSignalsError] = useState('')
  const [webhookSignalsStats, setWebhookSignalsStats] = useState({
    totalSignals: 0,
    processedSignals: 0,
    totalExecutions: 0,
    successfulExecutions: 0,
    failedExecutions: 0,
    successRate: 0
  })
  const [activityFilters, setActivityFilters] = useState({
    status: 'all' as 'all' | 'successful' | 'failed' | 'emergency',
    botId: 'all'
  })
  
  // Holdings state
  const [holdings, setHoldings] = useState<Holding[]>([])
  const [holdingsLoading, setHoldingsLoading] = useState(true)
  const [holdingsError, setHoldingsError] = useState('')
  const [holdingsSummary, setHoldingsSummary] = useState({
    totalValue: 0,
    totalPnl: 0,
    totalDayChange: 0,
    count: 0
  })

  // Set initial tab from URL parameter
  useEffect(() => {
    const tabParam = searchParams.get('tab') as typeof activeTab
    if (tabParam && ['bot-positions', 'positions', 'orders', 'trades', 'equity', 'holdings', 'bot-activity'].includes(tabParam)) {
      setActiveTab(tabParam)
    }
  }, [searchParams])

  useEffect(() => {
    if (session) {
      fetchTrades()
      fetchPositions()
      fetchOrders()
      fetchSyncStatus()
      fetchBotPositions()
      fetchHoldings()
      fetchWebhookSignals()
    }
  }, [session])

  // Refetch orders when filters change
  useEffect(() => {
    if (session) {
      fetchOrders()
    }
  }, [orderFilters, session])

  // Refetch trades when filters change
  useEffect(() => {
    if (session) {
      fetchTrades()
    }
  }, [tradeFilters, session])

  // Auto-refresh holdings every 30 seconds when holdings tab is active
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null
    
    if (session && activeTab === 'holdings') {
      // Refresh immediately when tab becomes active
      fetchHoldings()
      
      // Set up 30-second interval
      interval = setInterval(() => {
        fetchHoldings()
      }, 30000)
    }
    
    return () => {
      if (interval) {
        clearInterval(interval)
      }
    }
  }, [session, activeTab])

  // Fetch equity curve when equity tab is active or filters change
  useEffect(() => {
    if (session && activeTab === 'equity') {
      fetchEquityCurve()
    }
  }, [session, activeTab, tradeFilters, selectedBot])

  // Fetch webhook signals when bot activity tab is active or filters change
  useEffect(() => {
    if (session && activeTab === 'bot-activity') {
      fetchWebhookSignals()
    }
  }, [session, activeTab, activityFilters])

  const fetchTrades = async () => {
    try {
      setLoading(true)
      setError('')
      
      // Build query parameters for date filtering
      const queryParams = new URLSearchParams()
      if (tradeFilters.startDate) queryParams.set('startDate', tradeFilters.startDate)
      if (tradeFilters.endDate) queryParams.set('endDate', tradeFilters.endDate)
      queryParams.set('source', 'hybrid') // Get both live and database data
      
      const response = await fetch(`/api/zerodha/trades?${queryParams}`)
      
      if (response.ok) {
        const data = await response.json()
        let filteredTrades = data.trades || []
        
        // Apply client-side date filtering (important for hybrid data that includes live trades)
        if (tradeFilters.startDate || tradeFilters.endDate) {
          filteredTrades = filteredTrades.filter((trade: Trade) => {
            try {
              if (!trade.trade_date) return true // Include trades without dates
              
              const tradeDate = new Date(trade.trade_date)
              const startDate = tradeFilters.startDate ? new Date(tradeFilters.startDate) : null
              const endDate = tradeFilters.endDate ? new Date(tradeFilters.endDate + 'T23:59:59') : null
              
              // Check if trade date is within the range
              if (startDate && tradeDate < startDate) return false
              if (endDate && tradeDate > endDate) return false
              
              return true
            } catch (error) {
              console.error('Error filtering trade by date:', error, trade)
              return true // Include trades with date parsing errors
            }
          })
        }
        
        // Apply bot type filter with error handling
        if (tradeFilters.botType !== 'all') {
          filteredTrades = filteredTrades.filter((trade: Trade) => {
            try {
              if (tradeFilters.botType === 'bot') {
                return trade.trade_source === 'BOT' || trade.bot_id
              } else {
                return trade.trade_source !== 'BOT' && !trade.bot_id
              }
            } catch {
              // If there's an error filtering, include the trade
              return true
            }
          })
        }
        
        setTrades(filteredTrades)
        // Note: Equity curve is now fetched separately on demand
      } else {
        const errorData = await response.json()
        setError(errorData.error || 'Failed to fetch trades')
      }
    } catch (error) {
      console.error('Error fetching trades:', error)
      setError('Error connecting to server')
    } finally {
      setLoading(false)
    }
  }

  const fetchPositions = async () => {
    try {
      setPositionsLoading(true)
      setPositionsError('')
      const response = await fetch('/api/zerodha/positions')
      
      if (response.ok) {
        const data = await response.json()
        setPositions(data.positions || {net: [], day: []})
      } else {
        const errorData = await response.json()
        setPositionsError(errorData.error || 'Failed to fetch positions')
      }
    } catch (error) {
      console.error('Error fetching positions:', error)
      setPositionsError('Error connecting to server')
    } finally {
      setPositionsLoading(false)
    }
  }

  const fetchBotPositions = async () => {
    try {
      setBotPositionsLoading(true)
      setBotPositionsError('')
      const response = await fetch('/api/positions/bot-positions?status=all')
      
      if (response.ok) {
        const data = await response.json()
        setBotPositions(data.positions || [])
        setBotPositionsSummary(data.summary || {
          totalPositions: 0,
          openPositions: 0,
          closedPositions: 0,
          totalUnrealizedPnl: 0,
          totalRealizedPnl: 0,
          totalPnl: 0
        })
      } else {
        const errorData = await response.json()
        setBotPositionsError(errorData.error || 'Failed to fetch bot positions')
      }
    } catch (error) {
      console.error('Error fetching bot positions:', error)
      setBotPositionsError('Error connecting to server')
    } finally {
      setBotPositionsLoading(false)
    }
  }

  const fetchOrders = async () => {
    try {
      setOrdersLoading(true)
      setOrdersError('')
      
      const queryParams = new URLSearchParams({
        status: orderFilters.orderStatus
      })
      
      const response = await fetch(`/api/zerodha/orders?${queryParams}`)
      
      if (response.ok) {
        const data = await response.json()
        setOrders(data.orders || [])
        setOrderSummary(data.summary || {
          total: 0,
          complete: 0,
          open: 0,
          cancelled: 0,
          totalValue: 0
        })
      } else {
        const errorData = await response.json()
        setOrdersError(errorData.error || 'Failed to fetch orders')
      }
    } catch (error) {
      console.error('Error fetching orders:', error)
      setOrdersError('Error connecting to server')
    } finally {
      setOrdersLoading(false)
    }
  }

  const fetchSyncStatus = async () => {
    try {
      const response = await fetch('/api/zerodha/sync-trades')
      if (response.ok) {
        const data = await response.json()
        setSyncStatus(data.syncStatus)
      }
    } catch (error) {
      console.error('Error fetching sync status:', error)
    }
  }

  const syncTrades = async () => {
    try {
      setSyncing(true)
      const response = await fetch('/api/zerodha/sync-trades', {
        method: 'POST'
      })
      
      if (response.ok) {
        const data = await response.json()
        console.log('Sync result:', data)
        // Refresh trades and sync status after sync
        await fetchTrades()
        await fetchSyncStatus()
      } else {
        const errorData = await response.json()
        console.error('Sync failed:', errorData)
      }
    } catch (error) {
      console.error('Error syncing trades:', error)
    } finally {
      setSyncing(false)
    }
  }

  const cleanupDuplicates = async () => {
    try {
      setCleaning(true)
      const response = await fetch('/api/zerodha/fix-trade-prices', {
        method: 'POST'
      })
      
      if (response.ok) {
        const data = await response.json()
        console.log('Cleanup result:', data)
        // Show success message to user
        alert(`Cleanup completed: ${data.summary.duplicatesRemoved} duplicates removed, ${data.summary.fixed} prices fixed`)
        // Refresh trades after cleanup
        await fetchTrades()
      } else {
        const errorData = await response.json()
        console.error('Cleanup failed:', errorData)
        alert('Cleanup failed: ' + errorData.error)
      }
    } catch (error) {
      console.error('Error cleaning trades:', error)
      alert('Error cleaning trades: ' + error.message)
    } finally {
      setCleaning(false)
    }
  }

  const generateContractNote = async () => {
    try {
      setGeneratingContractNote(true)
      
      // Use the trade filters to determine date range
      const startDate = tradeFilters.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] // Default to last 30 days
      const endDate = tradeFilters.endDate || new Date().toISOString().split('T')[0] // Default to today
      
      // Open contract note in new window/tab for PDF generation
      const pdfUrl = `/api/trades/contract-note/pdf?startDate=${startDate}&endDate=${endDate}`
      const contractNoteWindow = window.open(pdfUrl, '_blank')
      
      if (contractNoteWindow) {
        console.log('Contract note opened in new window')
      } else {
        alert('Contract note generated! Please enable popups to view/download the PDF.')
      }
    } catch (error) {
      console.error('Error generating contract note:', error)
      alert('Error generating contract note: ' + error.message)
    } finally {
      setGeneratingContractNote(false)
    }
  }

  const fetchHoldings = async () => {
    try {
      setHoldingsLoading(true)
      setHoldingsError('')
      
      const response = await fetch('/api/zerodha/holdings')
      if (response.ok) {
        const data = await response.json()
        const holdingsData = data.data || []
        setHoldings(holdingsData)
        
        // Calculate summary
        let totalValue = 0
        let totalPnl = 0
        let totalDayChange = 0
        
        holdingsData.forEach((holding: Holding) => {
          totalValue += (holding.last_price || 0) * (holding.quantity || 0)
          totalPnl += holding.pnl || 0
          totalDayChange += holding.day_change || 0
        })
        
        setHoldingsSummary({
          totalValue,
          totalPnl,
          totalDayChange,
          count: holdingsData.length
        })
      } else {
        const errorData = await response.json()
        setHoldingsError(errorData.error || 'Failed to fetch holdings')
        setHoldings([])
        setHoldingsSummary({ totalValue: 0, totalPnl: 0, totalDayChange: 0, count: 0 })
      }
    } catch (error) {
      console.error('Error fetching holdings:', error)
      setHoldingsError('Error fetching holdings')
      setHoldings([])
      setHoldingsSummary({ totalValue: 0, totalPnl: 0, totalDayChange: 0, count: 0 })
    } finally {
      setHoldingsLoading(false)
    }
  }

  const refreshAll = async () => {
    await Promise.all([fetchTrades(), fetchPositions(), fetchOrders(), fetchBotPositions(), fetchHoldings(), fetchWebhookSignals()])
  }

  const fetchEquityCurve = async () => {
    try {
      setEquityLoading(true)
      setEquityError('')

      // Build query parameters
      const queryParams = new URLSearchParams()
      if (tradeFilters.startDate) queryParams.set('startDate', tradeFilters.startDate)
      if (tradeFilters.endDate) queryParams.set('endDate', tradeFilters.endDate)
      if (selectedBot !== 'all') queryParams.set('botId', selectedBot)
      queryParams.set('realtime', 'true') // Include real-time data

      console.log('Fetching equity curve data with params:', queryParams.toString())

      const response = await fetch(`/api/equity/pnl-breakdown?${queryParams}`)
      
      if (response.ok) {
        const data = await response.json()
        
        if (data.success && data.data) {
          // Transform P&L snapshots to equity curve format
          const snapshots = data.data.snapshots || []
          let runningValue = 100000 // Initial capital
          
          const equityPoints = snapshots
            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
            .map(snapshot => {
              runningValue += snapshot.totalDayPnL
              return {
                date: snapshot.date,
                value: runningValue,
                pnl: snapshot.totalDayPnL,
                totalPnL: snapshot.totalPortfolioPnL,
                botPerformance: snapshot.botPerformance || []
              }
            })

          setEquityData(equityPoints)
          setTotalPnl(data.data.summary?.totalPnL || 0)
          setEquitySummary(data.data.summary || {
            totalDays: 0,
            profitableDays: 0,
            winRate: 0,
            averageDailyPnL: 0,
            bestDay: 0,
            worstDay: 0
          })
          setAvailableBots(data.data.availableBots || [])

          console.log('✅ Equity curve data loaded:', {
            snapshots: snapshots.length,
            summary: data.data.summary
          })
        } else {
          throw new Error(data.error || 'Failed to fetch equity data')
        }
      } else {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to fetch equity curve data')
      }
    } catch (error) {
      console.error('Error fetching equity curve:', error)
      setEquityError(error.message || 'Error fetching equity curve data')
      setEquityData([])
      setTotalPnl(0)
    } finally {
      setEquityLoading(false)
    }
  }

  const fetchWebhookSignals = async () => {
    try {
      setWebhookSignalsLoading(true)
      setWebhookSignalsError('')

      // Build query parameters
      const queryParams = new URLSearchParams()
      if (activityFilters.status !== 'all') queryParams.set('status', activityFilters.status)
      if (activityFilters.botId !== 'all') queryParams.set('botId', activityFilters.botId)
      queryParams.set('limit', '50') // Show last 50 signals

      console.log('Fetching webhook signals with params:', queryParams.toString())

      const response = await fetch(`/api/user/webhook-signals?${queryParams}`)
      
      if (response.ok) {
        const data = await response.json()
        
        setWebhookSignals(data.signals || [])
        setWebhookSignalsStats(data.stats || {
          totalSignals: 0,
          processedSignals: 0,
          totalExecutions: 0,
          successfulExecutions: 0,
          failedExecutions: 0,
          successRate: 0
        })

        console.log('✅ Webhook signals loaded:', {
          signals: data.signals?.length || 0,
          stats: data.stats
        })
      } else {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to fetch webhook signals')
      }
    } catch (error) {
      console.error('Error fetching webhook signals:', error)
      setWebhookSignalsError(error.message || 'Error fetching webhook signals')
      setWebhookSignals([])
    } finally {
      setWebhookSignalsLoading(false)
    }
  }

  const formatDate = (dateString: string) => {
    try {
      if (!dateString) return 'Unknown Date'
      return new Date(dateString).toLocaleDateString('en-IN', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })
    } catch (error) {
      console.error('Error formatting date:', error, dateString)
      return 'Invalid Date'
    }
  }

  const formatCurrency = (amount: number | undefined | null) => {
    try {
      if (amount === undefined || amount === null || isNaN(Number(amount))) {
        return '₹0.00'
      }
      return `₹${Number(amount).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
    } catch (error) {
      console.error('Error formatting currency:', error, amount)
      return '₹0.00'
    }
  }

  const getOrderStatusColor = (status: string) => {
    switch (status) {
      case 'COMPLETE': return 'bg-green-100 text-green-800'
      case 'OPEN': 
      case 'TRIGGER PENDING': return 'bg-blue-100 text-blue-800'
      case 'CANCELLED': 
      case 'REJECTED': return 'bg-red-100 text-red-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const getOrderStatusIcon = (status: string) => {
    switch (status) {
      case 'COMPLETE': return <TrendingUp className="h-4 w-4" />
      case 'OPEN': 
      case 'TRIGGER PENDING': return <Activity className="h-4 w-4" />
      case 'CANCELLED': 
      case 'REJECTED': return <TrendingDown className="h-4 w-4" />
      default: return <FileText className="h-4 w-4" />
    }
  }

  if (status === 'loading') {
    return <div className="flex justify-center items-center min-h-screen">Loading...</div>
  }

  if (!session) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Please sign in to view trades</h1>
          <Link href="/signin">
            <Button>Sign In</Button>
          </Link>
        </div>
      </div>
    )
  }

  // Add error boundary for the entire component
  try {

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-4 mb-4">
          <Link href="/dashboard">
            <Button variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Dashboard
            </Button>
          </Link>
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-gray-900">Trading Overview</h1>
            <p className="text-gray-600">Review your positions and trade history</p>
          </div>
          <div className="flex gap-2">
            <Button onClick={syncTrades} disabled={syncing} variant="outline">
              <Download className={`h-4 w-4 mr-2 ${syncing ? 'animate-bounce' : ''}`} />
              {syncing ? 'Syncing...' : 'Sync Trades'}
            </Button>
            <Button onClick={cleanupDuplicates} disabled={cleaning} variant="outline">
              <RotateCcw className={`h-4 w-4 mr-2 ${cleaning ? 'animate-spin' : ''}`} />
              {cleaning ? 'Cleaning...' : 'Cleanup Duplicates'}
            </Button>
            <Button onClick={refreshAll} disabled={loading || positionsLoading || ordersLoading} variant="outline">
              <RefreshCw className={`h-4 w-4 mr-2 ${(loading || positionsLoading || ordersLoading) ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>
      </div>

      {/* Sync Status */}
      {syncStatus && (
        <div className="mb-6">
          <Card className="bg-blue-50 border-blue-200">
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div>
                    <p className="text-sm font-medium text-blue-900">Trade Sync Status</p>
                    <p className="text-xs text-blue-700">
                      {syncStatus.totalStoredTrades} trades stored | 
                      Last sync: {syncStatus.lastSync ? formatDate(syncStatus.lastSync) : 'Never'}
                    </p>
                  </div>
                  {syncStatus.todayTrades > 0 && (
                    <Badge variant="secondary" className="bg-green-100 text-green-800">
                      {syncStatus.todayTrades} today
                    </Badge>
                  )}
                </div>
                <div className="text-xs text-blue-600">
                  Historical data available
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tabs */}
      <div className="mb-6">
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-8">
            <button
              onClick={() => setActiveTab('bot-positions')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'bot-positions'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <Shield className="h-4 w-4 inline mr-2" />
              Bot Positions ({botPositionsSummary.openPositions})
            </button>
            <button
              onClick={() => setActiveTab('positions')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'positions'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <Activity className="h-4 w-4 inline mr-2" />
              Live Positions ({positions.net.length + positions.day.length})
            </button>
            <button
              onClick={() => setActiveTab('orders')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'orders'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <FileText className="h-4 w-4 inline mr-2" />
              Orders ({orderSummary.total})
            </button>
            <button
              onClick={() => setActiveTab('trades')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'trades'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <BarChart3 className="h-4 w-4 inline mr-2" />
              Trade History ({trades.length})
            </button>
            <button
              onClick={() => setActiveTab('equity')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'equity'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <TrendingUp className="h-4 w-4 inline mr-2" />
              Equity Curve
            </button>
            <button
              onClick={() => setActiveTab('holdings')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'holdings'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <PieChart className="h-4 w-4 inline mr-2" />
              Holdings ({holdingsSummary.count})
            </button>
            <button
              onClick={() => setActiveTab('bot-activity')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'bot-activity'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <Zap className="h-4 w-4 inline mr-2" />
              Bot Activity ({webhookSignalsStats.totalSignals})
            </button>
          </nav>
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === 'bot-positions' && (
        <>
          {/* Bot Positions Summary */}
          <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mb-6">
            <Card>
              <CardContent className="pt-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-gray-900">{botPositionsSummary.totalPositions}</div>
                  <div className="text-sm text-gray-600">Total</div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">{botPositionsSummary.openPositions}</div>
                  <div className="text-sm text-gray-600">Open</div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-gray-600">{botPositionsSummary.closedPositions}</div>
                  <div className="text-sm text-gray-600">Closed</div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-center">
                  <div className={`text-2xl font-bold ${botPositionsSummary.totalUnrealizedPnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {formatCurrency(botPositionsSummary.totalUnrealizedPnl)}
                  </div>
                  <div className="text-sm text-gray-600">Unrealized</div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-center">
                  <div className={`text-2xl font-bold ${botPositionsSummary.totalRealizedPnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {formatCurrency(botPositionsSummary.totalRealizedPnl)}
                  </div>
                  <div className="text-sm text-gray-600">Realized</div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-center">
                  <div className={`text-2xl font-bold ${botPositionsSummary.totalPnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {formatCurrency(botPositionsSummary.totalPnl)}
                  </div>
                  <div className="text-sm text-gray-600">Total P&L</div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Bot Positions Error State */}
          {botPositionsError && (
            <Card className="mb-6 border-red-200 bg-red-50">
              <CardContent className="pt-6">
                <p className="text-red-800">{botPositionsError}</p>
                <Button onClick={fetchBotPositions} className="mt-4" variant="outline">
                  Try Again
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Bot Positions Loading State */}
          {botPositionsLoading && (
            <Card>
              <CardContent className="pt-6">
                <div className="flex justify-center items-center py-8">
                  <RefreshCw className="h-6 w-6 animate-spin mr-2" />
                  <span>Loading bot positions...</span>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Bot Positions List */}
          {!botPositionsLoading && !botPositionsError && (
            <ZerodhaTable
              headers={['Product', 'Instrument', 'Entry Date & Time', 'Type/Duration', 'Qty.', 'Avg.', 'P&L', 'Status']}
              searchTerm={searchTerms.botPositions}
              onSearch={(term) => setSearchTerms(prev => ({ ...prev, botPositions: term }))}
              actions={
                <Button onClick={fetchBotPositions} disabled={botPositionsLoading} variant="outline" size="sm">
                  <RefreshCw className={`h-4 w-4 mr-2 ${botPositionsLoading ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
              }
            >
              {botPositions
                .filter(position => 
                  position.symbol.toLowerCase().includes(searchTerms.botPositions.toLowerCase()) ||
                  (position.botName || '').toLowerCase().includes(searchTerms.botPositions.toLowerCase())
                )
                .map((position) => (
                  <BotPositionRow key={position._id} position={position} />
                ))}
              {botPositions.filter(position => 
                position.symbol.toLowerCase().includes(searchTerms.botPositions.toLowerCase()) ||
                (position.botName || '').toLowerCase().includes(searchTerms.botPositions.toLowerCase())
              ).length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                    {searchTerms.botPositions ? 'No bot positions match your search' : 'No bot positions found'}
                  </td>
                </tr>
              )}
            </ZerodhaTable>
          )}
        </>
      )}

      {activeTab === 'positions' && (
        <>
          {/* Positions Error State */}
          {positionsError && (
            <Card className="mb-6 border-red-200 bg-red-50">
              <CardContent className="pt-6">
                <p className="text-red-800">{positionsError}</p>
                <Button onClick={fetchPositions} className="mt-4" variant="outline">
                  Try Again
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Positions Loading State */}
          {positionsLoading && (
            <Card>
              <CardContent className="pt-6">
                <div className="flex justify-center items-center py-8">
                  <RefreshCw className="h-6 w-6 animate-spin mr-2" />
                  <span>Loading positions...</span>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Positions List */}
          {!positionsLoading && !positionsError && (
            <ZerodhaTable
              headers={['Product', 'Instrument', 'Qty.', 'Avg.', 'LTP', 'P&L']}
              searchTerm={searchTerms.positions}
              onSearch={(term) => setSearchTerms(prev => ({ ...prev, positions: term }))}
              actions={
                <Button onClick={fetchPositions} disabled={positionsLoading} variant="outline" size="sm">
                  <RefreshCw className={`h-4 w-4 mr-2 ${positionsLoading ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
              }
            >
              {(() => {
                // Combine and deduplicate positions by instrument_token
                const allPositions = [...positions.net, ...positions.day]
                const uniquePositions = allPositions.reduce((acc, position) => {
                  const key = position.instrument_token
                  if (!acc.find(p => p.instrument_token === key)) {
                    acc.push(position)
                  }
                  return acc
                }, [])
                
                return uniquePositions
                  .filter(position => 
                    position.tradingsymbol.toLowerCase().includes(searchTerms.positions.toLowerCase())
                  )
                  .map((position, index) => (
                    <PositionRow key={`${position.instrument_token}-${index}`} position={position} />
                  ))
              })()}
              {(() => {
                const allPositions = [...positions.net, ...positions.day]
                const uniquePositions = allPositions.reduce((acc, position) => {
                  const key = position.instrument_token
                  if (!acc.find(p => p.instrument_token === key)) {
                    acc.push(position)
                  }
                  return acc
                }, [])
                
                return uniquePositions
                  .filter(position => 
                    position.tradingsymbol.toLowerCase().includes(searchTerms.positions.toLowerCase())
                  ).length === 0
              })() && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                    {searchTerms.positions ? 'No positions match your search' : 'No positions found'}
                  </td>
                </tr>
              )}
            </ZerodhaTable>
          )}
        </>
      )}

      {activeTab === 'orders' && (
        <>
          {/* Order Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
            <Card>
              <CardContent className="pt-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-gray-900">{orderSummary.total}</div>
                  <div className="text-sm text-gray-600">Total Orders</div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">{orderSummary.complete}</div>
                  <div className="text-sm text-gray-600">Completed</div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600">{orderSummary.open}</div>
                  <div className="text-sm text-gray-600">Open</div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-red-600">{orderSummary.cancelled}</div>
                  <div className="text-sm text-gray-600">Cancelled</div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-purple-600">{formatCurrency(orderSummary.totalValue)}</div>
                  <div className="text-sm text-gray-600">Total Value</div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Orders Error State */}
          {ordersError && (
            <Card className="mb-6 border-red-200 bg-red-50">
              <CardContent className="pt-6">
                <p className="text-red-800">{ordersError}</p>
                <Button onClick={fetchOrders} className="mt-4" variant="outline">
                  Try Again
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Orders Table */}
          <ZerodhaTable
            headers={['Time', 'Type', 'Instrument', 'Product', 'Qty.', 'Avg. price', 'Status']}
            searchTerm={searchTerms.orders}
            onSearch={(term) => setSearchTerms(prev => ({ ...prev, orders: term }))}
            actions={
              <>
                <div className="flex items-center space-x-2">
                  <Label className="text-sm font-medium">Status:</Label>
                  <select
                    value={orderFilters.orderStatus}
                    onChange={(e) => setOrderFilters(prev => ({
                      ...prev,
                      orderStatus: e.target.value as 'all' | 'complete' | 'open' | 'cancelled'
                    }))}
                    className="text-sm border border-gray-300 rounded px-3 py-1 h-9"
                  >
                    <option value="all">All Orders</option>
                    <option value="complete">Completed</option>
                    <option value="open">Open/Pending</option>
                    <option value="cancelled">Cancelled/Rejected</option>
                  </select>
                </div>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => setOrderFilters({ orderStatus: 'all' })}
                >
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Reset
                </Button>
                <Button variant="outline" size="sm" onClick={fetchOrders} disabled={ordersLoading}>
                  <RefreshCw className={`h-4 w-4 mr-2 ${ordersLoading ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
              </>
            }
          >
            {ordersLoading ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                  <div className="flex justify-center items-center">
                    <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                    Loading orders...
                  </div>
                </td>
              </tr>
            ) : orders.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                  <div>
                    <FileText className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                    <div>No orders found</div>
                    <div className="text-xs text-orange-600 mt-1">
                      Note: Zerodha API only provides current day orders
                    </div>
                  </div>
                </td>
              </tr>
            ) : (
              orders
                .filter(order => 
                  order.tradingsymbol.toLowerCase().includes(searchTerms.orders.toLowerCase())
                )
                .map((order) => (
                  <OrderRow key={order.order_id} order={order} />
                ))
            )}
            {orders.length > 0 && orders.filter(order => 
              order.tradingsymbol.toLowerCase().includes(searchTerms.orders.toLowerCase())
            ).length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                  No orders match your search
                </td>
              </tr>
            )}
          </ZerodhaTable>
        </>
      )}

      {activeTab === 'trades' && (
        <>
          {/* Trade Filters */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Filter className="h-5 w-5" />
                Trade Filters
              </CardTitle>
              <CardDescription>
                Filter trades by date range and bot type.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                <div>
                  <Label htmlFor="startDate">Start Date</Label>
                  <Input
                    id="startDate"
                    type="date"
                    value={tradeFilters.startDate}
                    onChange={(e) => setTradeFilters(prev => ({
                      ...prev,
                      startDate: e.target.value
                    }))}
                  />
                </div>
                
                <div>
                  <Label htmlFor="endDate">End Date</Label>
                  <Input
                    id="endDate"
                    type="date"
                    value={tradeFilters.endDate}
                    onChange={(e) => setTradeFilters(prev => ({
                      ...prev,
                      endDate: e.target.value
                    }))}
                  />
                </div>
                
                <div>
                  <Label htmlFor="botType">Trade Type</Label>
                  <select
                    id="botType"
                    value={tradeFilters.botType}
                    onChange={(e) => setTradeFilters(prev => ({
                      ...prev,
                      botType: e.target.value as 'all' | 'bot' | 'manual'
                    }))}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <option value="all">All Trades</option>
                    <option value="bot">Bot Trades</option>
                    <option value="manual">Manual Trades</option>
                  </select>
                </div>
                
                <div>
                  <Button
                    onClick={() => setTradeFilters({
                      startDate: '',
                      endDate: '',
                      botType: 'all'
                    })}
                    variant="outline"
                    className="w-full"
                  >
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Clear Filters
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Trades Error State */}
          {error && (
            <Card className="mb-6 border-red-200 bg-red-50">
              <CardContent className="pt-6">
                <p className="text-red-800">{error}</p>
                <Button onClick={fetchTrades} className="mt-4" variant="outline">
                  Try Again
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Trades Loading State */}
          {loading && (
            <Card>
              <CardContent className="pt-6">
                <div className="flex justify-center items-center py-8">
                  <RefreshCw className="h-6 w-6 animate-spin mr-2" />
                  <span>Loading trades...</span>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Trades Table */}
          <ZerodhaTable
            headers={['Trade ID', 'Fill time', 'Type', 'Instrument', 'Product', 'Qty.', 'Avg. Price']}
            searchTerm={searchTerms.trades}
            onSearch={(term) => setSearchTerms(prev => ({ ...prev, trades: term }))}
            actions={
              <>
                <Button variant="outline" size="sm" onClick={generateContractNote} disabled={generatingContractNote || trades.length === 0}>
                  <Download className={`h-4 w-4 mr-2 ${generatingContractNote ? 'animate-bounce' : ''}`} />
                  {generatingContractNote ? 'Generating...' : 'Contract Note'}
                </Button>
                <Button variant="outline" size="sm" onClick={cleanupDuplicates} disabled={cleaning}>
                  <RotateCcw className={`h-4 w-4 mr-2 ${cleaning ? 'animate-spin' : ''}`} />
                  {cleaning ? 'Cleaning...' : 'Cleanup'}
                </Button>
                <Button variant="outline" size="sm" onClick={fetchTrades} disabled={loading}>
                  <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
              </>
            }
          >
            {loading ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                  <div className="flex justify-center items-center">
                    <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                    Loading trades...
                  </div>
                </td>
              </tr>
            ) : trades.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                  <div>
                    <TrendingUp className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                    <div>No trades found</div>
                    <div className="text-xs text-gray-500 mt-1">
                      Your trade history will appear here once you start trading
                    </div>
                  </div>
                </td>
              </tr>
            ) : (
              trades
                .filter(trade => 
                  trade.tradingsymbol.toLowerCase().includes(searchTerms.trades.toLowerCase()) ||
                  (trade.bot_name || '').toLowerCase().includes(searchTerms.trades.toLowerCase())
                )
                .map((trade) => (
                  <TradeRow key={trade.trade_id} trade={trade} />
                ))
            )}
            {trades.length > 0 && trades.filter(trade => 
              trade.tradingsymbol.toLowerCase().includes(searchTerms.trades.toLowerCase()) ||
              (trade.bot_name || '').toLowerCase().includes(searchTerms.trades.toLowerCase())
            ).length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                  No trades match your search
                </td>
              </tr>
            )}
          </ZerodhaTable>
        </>
      )}

      {activeTab === 'equity' && (
        <>
          {/* Equity Curve */}
          <div className="space-y-6">
            {/* Bot Filter */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Filter className="h-5 w-5" />
                  Equity Curve Filters
                </CardTitle>
                <CardDescription>
                  Filter equity curve by bot performance and date range.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                  <div>
                    <Label htmlFor="botFilter">Bot Performance</Label>
                    <select
                      id="botFilter"
                      value={selectedBot}
                      onChange={(e) => setSelectedBot(e.target.value)}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <option value="all">All Trading Activity</option>
                      {availableBots.map(bot => (
                        <option key={bot.id} value={bot.id}>{bot.name}</option>
                      ))}
                    </select>
                  </div>
                  
                  <div>
                    <Label htmlFor="equityStartDate">Start Date</Label>
                    <Input
                      id="equityStartDate"
                      type="date"
                      value={tradeFilters.startDate}
                      onChange={(e) => setTradeFilters(prev => ({
                        ...prev,
                        startDate: e.target.value
                      }))}
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="equityEndDate">End Date</Label>
                    <Input
                      id="equityEndDate"
                      type="date"
                      value={tradeFilters.endDate}
                      onChange={(e) => setTradeFilters(prev => ({
                        ...prev,
                        endDate: e.target.value
                      }))}
                    />
                  </div>
                  
                  <div>
                    <Button
                      onClick={() => {
                        setTradeFilters({
                          startDate: '',
                          endDate: '',
                          botType: 'all'
                        })
                        setSelectedBot('all')
                      }}
                      variant="outline"
                      className="w-full"
                    >
                      <RotateCcw className="h-4 w-4 mr-2" />
                      Reset
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Enhanced Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-gray-600">Total P&L</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center">
                    <span className={`text-2xl font-bold ${totalPnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {formatCurrency(totalPnl)}
                    </span>
                    {totalPnl >= 0 ? (
                      <TrendingUp className="h-5 w-5 text-green-600 ml-2" />
                    ) : (
                      <TrendingDown className="h-5 w-5 text-red-600 ml-2" />
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">Zerodha calculated</p>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-gray-600">Trading Days</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-gray-900">{equitySummary.totalDays}</div>
                  <p className="text-xs text-gray-500 mt-1">{equitySummary.profitableDays} profitable</p>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-gray-600">Daily Win Rate</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-gray-900">{equitySummary.winRate}%</div>
                  <p className="text-xs text-gray-500 mt-1">Profitable days</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-gray-600">Avg Daily P&L</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className={`text-2xl font-bold ${equitySummary.averageDailyPnL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {formatCurrency(equitySummary.averageDailyPnL)}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">Per trading day</p>
                </CardContent>
              </Card>
            </div>

            {/* Equity Curve Chart */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Portfolio Value Over Time</CardTitle>
                    <CardDescription>
                      Track your portfolio value using Zerodha's daily P&L data
                      {selectedBot !== 'all' && availableBots.find(b => b.id === selectedBot) && 
                        ` - Filtered by ${availableBots.find(b => b.id === selectedBot)?.name}`}
                    </CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button 
                      onClick={fetchEquityCurve} 
                      disabled={equityLoading}
                      variant="outline"
                      size="sm"
                    >
                      <RefreshCw className={`h-4 w-4 mr-2 ${equityLoading ? 'animate-spin' : ''}`} />
                      Refresh
                    </Button>
                    <Button 
                      onClick={async () => {
                        try {
                          const response = await fetch('/api/equity/pnl-breakdown', { method: 'POST' })
                          if (response.ok) {
                            const data = await response.json()
                            alert('Daily P&L snapshot created successfully!')
                            fetchEquityCurve() // Refresh data
                          } else {
                            const error = await response.json()
                            alert(`Failed to create snapshot: ${error.error}`)
                          }
                        } catch (error) {
                          alert(`Error: ${error.message}`)
                        }
                      }}
                      variant="outline"
                      size="sm"
                    >
                      <Download className="h-4 w-4 mr-2" />
                      Snapshot Today
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {equityError && (
                  <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
                    {equityError}
                  </div>
                )}

                {equityLoading ? (
                  <div className="text-center py-8">
                    <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4" />
                    <p>Loading equity curve data...</p>
                  </div>
                ) : equityData.length > 0 ? (
                  <div className="space-y-4">
                    {/* Simple equity curve visualization */}
                    <div className="h-64 bg-gray-50 rounded-lg p-4 flex items-end space-x-1">
                      {equityData.map((point, index) => {
                        const maxValue = Math.max(...equityData.map(d => d.value))
                        const minValue = Math.min(...equityData.map(d => d.value))
                        const height = ((point.value - minValue) / (maxValue - minValue)) * 200 + 20
                        
                        return (
                          <div key={index} className="flex-1 flex flex-col items-center">
                            <div
                              className={`w-full rounded-t ${point.pnl >= 0 ? 'bg-green-500' : 'bg-red-500'}`}
                              style={{ height: `${height}px` }}
                              title={`${point.date}: ${formatCurrency(point.value)} (${point.pnl >= 0 ? '+' : ''}${formatCurrency(point.pnl)})`}
                            />
                          </div>
                        )
                      })}
                    </div>
                    
                    {/* Enhanced Data Points */}
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left py-2">Date</th>
                            <th className="text-right py-2">Portfolio Value</th>
                            <th className="text-right py-2">Daily P&L</th>
                            <th className="text-right py-2">Total P&L</th>
                            <th className="text-left py-2">Source</th>
                          </tr>
                        </thead>
                        <tbody>
                          {equityData.slice(-15).reverse().map((point, index) => (
                            <tr key={index} className="border-b hover:bg-gray-50">
                              <td className="py-2">
                                <div className="flex items-center gap-2">
                                  {new Date(point.date).toLocaleDateString()}
                                  {point.isRealtime && (
                                    <Badge variant="secondary" className="text-xs">Live</Badge>
                                  )}
                                </div>
                              </td>
                              <td className="py-2 text-right font-medium">{formatCurrency(point.value)}</td>
                              <td className={`py-2 text-right font-mono ${point.pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                {point.pnl >= 0 ? '+' : ''}{formatCurrency(point.pnl)}
                              </td>
                              <td className={`py-2 text-right font-mono ${(point.totalPnL || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                {(point.totalPnL || 0) >= 0 ? '+' : ''}{formatCurrency(point.totalPnL || 0)}
                              </td>
                              <td className="py-2">
                                <div className="text-xs text-gray-500">
                                  {point.isRealtime ? 'Real-time' : 'Snapshot'}
                                  {point.botPerformance && point.botPerformance.length > 0 && (
                                    <div className="text-xs text-blue-600">
                                      {point.botPerformance.length} bot{point.botPerformance.length > 1 ? 's' : ''} active
                                    </div>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Best/Worst Days */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 pt-4 border-t">
                      <div className="text-center">
                        <div className="text-sm text-gray-600">Best Day</div>
                        <div className="text-lg font-bold text-green-600">
                          {formatCurrency(equitySummary.bestDay)}
                        </div>
                      </div>
                      <div className="text-center">
                        <div className="text-sm text-gray-600">Worst Day</div>
                        <div className="text-lg font-bold text-red-600">
                          {formatCurrency(equitySummary.worstDay)}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <BarChart3 className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">No P&L data available</h3>
                    <p className="text-gray-600 mb-4">
                      Create a daily P&L snapshot to start tracking your equity curve with Zerodha's data.
                    </p>
                    <Button 
                      onClick={async () => {
                        try {
                          const response = await fetch('/api/equity/pnl-breakdown', { method: 'POST' })
                          if (response.ok) {
                            alert('Daily P&L snapshot created successfully!')
                            fetchEquityCurve()
                          } else {
                            const error = await response.json()
                            alert(`Failed to create snapshot: ${error.error}`)
                          }
                        } catch (error) {
                          alert(`Error: ${error.message}`)
                        }
                      }}
                      className="mx-auto"
                    >
                      <Download className="h-4 w-4 mr-2" />
                      Create First Snapshot
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}

      {activeTab === 'holdings' && (
        <>
          {/* Holdings Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-600">Total Holdings</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-gray-900">{holdingsSummary.count}</div>
                <p className="text-xs text-gray-500">Securities owned</p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-600">Total Value</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-gray-900">{formatCurrency(holdingsSummary.totalValue)}</div>
                <p className="text-xs text-gray-500">Current market value</p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-600">Total P&L</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center">
                  <span className={`text-2xl font-bold ${holdingsSummary.totalPnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {formatCurrency(holdingsSummary.totalPnl)}
                  </span>
                  {holdingsSummary.totalPnl >= 0 ? (
                    <TrendingUp className="h-5 w-5 text-green-600 ml-2" />
                  ) : (
                    <TrendingDown className="h-5 w-5 text-red-600 ml-2" />
                  )}
                </div>
                <p className="text-xs text-gray-500">Unrealized gains/losses</p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-600">Day Change</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center">
                  <span className={`text-2xl font-bold ${holdingsSummary.totalDayChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {formatCurrency(holdingsSummary.totalDayChange)}
                  </span>
                  {holdingsSummary.totalDayChange >= 0 ? (
                    <TrendingUp className="h-5 w-5 text-green-600 ml-2" />
                  ) : (
                    <TrendingDown className="h-5 w-5 text-red-600 ml-2" />
                  )}
                </div>
                <p className="text-xs text-gray-500">Today's change</p>
              </CardContent>
            </Card>
          </div>

          {/* Holdings Table */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Holdings Portfolio</CardTitle>
                  <CardDescription>
                    Your current equity holdings {activeTab === 'holdings' && '(Auto-refreshes every 30 seconds)'}
                  </CardDescription>
                </div>
                <Button 
                  onClick={fetchHoldings} 
                  disabled={holdingsLoading}
                  variant="outline"
                  size="sm"
                >
                  <RefreshCw className={`h-4 w-4 mr-2 ${holdingsLoading ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {holdingsError && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
                  {holdingsError}
                </div>
              )}

              {holdingsLoading ? (
                <div className="text-center py-8">
                  <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4" />
                  <p>Loading holdings...</p>
                </div>
              ) : holdings.length === 0 ? (
                <div className="text-center py-8">
                  <PieChart className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No holdings found</h3>
                  <p className="text-gray-600">You don't have any equity holdings at the moment.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-3 px-2">Symbol</th>
                        <th className="text-right py-3 px-2">Quantity</th>
                        <th className="text-right py-3 px-2">Avg Price</th>
                        <th className="text-right py-3 px-2">LTP</th>
                        <th className="text-right py-3 px-2">Value</th>
                        <th className="text-right py-3 px-2">P&L</th>
                        <th className="text-right py-3 px-2">Day Change</th>
                        <th className="text-right py-3 px-2">Day Change %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {holdings.map((holding, index) => (
                        <tr key={index} className="border-b hover:bg-gray-50">
                          <td className="py-3 px-2">
                            <div>
                              <div className="font-medium">{holding.tradingsymbol}</div>
                              <div className="text-xs text-gray-500">{holding.exchange}</div>
                            </div>
                          </td>
                          <td className="py-3 px-2 text-right font-mono">{holding.quantity}</td>
                          <td className="py-3 px-2 text-right font-mono">{formatCurrency(holding.average_price)}</td>
                          <td className="py-3 px-2 text-right font-mono">{formatCurrency(holding.last_price)}</td>
                          <td className="py-3 px-2 text-right font-mono font-medium">
                            {formatCurrency(holding.last_price * holding.quantity)}
                          </td>
                          <td className={`py-3 px-2 text-right font-mono ${holding.pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {holding.pnl >= 0 ? '+' : ''}{formatCurrency(holding.pnl)}
                          </td>
                          <td className={`py-3 px-2 text-right font-mono ${holding.day_change >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {holding.day_change >= 0 ? '+' : ''}{formatCurrency(holding.day_change)}
                          </td>
                          <td className={`py-3 px-2 text-right font-mono ${holding.day_change_percentage >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {holding.day_change_percentage >= 0 ? '+' : ''}{holding.day_change_percentage?.toFixed(2)}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {activeTab === 'bot-activity' && (
        <>
          {/* Bot Activity Summary */}
          <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mb-6">
            <Card>
              <CardContent className="pt-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-gray-900">{webhookSignalsStats.totalSignals}</div>
                  <div className="text-sm text-gray-600">Total Signals</div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">{webhookSignalsStats.successfulExecutions}</div>
                  <div className="text-sm text-gray-600">Successful</div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-red-600">{webhookSignalsStats.failedExecutions}</div>
                  <div className="text-sm text-gray-600">Failed</div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600">{webhookSignalsStats.successRate}%</div>
                  <div className="text-sm text-gray-600">Success Rate</div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-purple-600">{webhookSignalsStats.processedSignals}</div>
                  <div className="text-sm text-gray-600">Processed</div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-orange-600">{webhookSignalsStats.totalExecutions}</div>
                  <div className="text-sm text-gray-600">Total Executions</div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Activity Filters */}
          <Card className="mb-6">
            <CardContent className="pt-4">
              <div className="flex flex-wrap gap-4 items-center">
                <div className="flex items-center gap-2">
                  <Label htmlFor="status-filter">Status:</Label>
                  <select
                    id="status-filter"
                    className="px-3 py-1 border rounded text-sm"
                    value={activityFilters.status}
                    onChange={(e) => setActivityFilters(prev => ({ ...prev, status: e.target.value as any }))}
                  >
                    <option value="all">All Signals</option>
                    <option value="successful">Successful Only</option>
                    <option value="failed">Failed Only</option>
                    <option value="emergency">Emergency Stopped</option>
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <Search className="h-4 w-4 text-gray-400" />
                  <Input
                    placeholder="Search signals..."
                    value={searchTerms.botActivity}
                    onChange={(e) => setSearchTerms(prev => ({ ...prev, botActivity: e.target.value }))}
                    className="w-64"
                  />
                </div>
                <Button 
                  onClick={fetchWebhookSignals} 
                  disabled={webhookSignalsLoading}
                  variant="outline"
                  size="sm"
                >
                  <RefreshCw className={`h-4 w-4 mr-2 ${webhookSignalsLoading ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Bot Activity Error State */}
          {webhookSignalsError && (
            <Card className="mb-6 border-red-200 bg-red-50">
              <CardContent className="pt-6">
                <p className="text-red-800">{webhookSignalsError}</p>
                <Button onClick={fetchWebhookSignals} className="mt-4" variant="outline">
                  Try Again
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Bot Activity Loading State */}
          {webhookSignalsLoading && (
            <Card>
              <CardContent className="pt-6">
                <div className="flex justify-center items-center py-8">
                  <RefreshCw className="h-6 w-6 animate-spin mr-2" />
                  <span>Loading bot activity...</span>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Bot Activity List */}
          {!webhookSignalsLoading && !webhookSignalsError && (
            <ZerodhaTable
              headers={['Signal', 'Symbol', 'Price', 'Status', 'Executions', 'Time', 'Details']}
              searchTerm={searchTerms.botActivity}
              onSearch={(term) => setSearchTerms(prev => ({ ...prev, botActivity: term }))}
              actions={
                <Button onClick={fetchWebhookSignals} disabled={webhookSignalsLoading} variant="outline" size="sm">
                  <RefreshCw className={`h-4 w-4 mr-2 ${webhookSignalsLoading ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
              }
            >
              {webhookSignals
                .filter(signal => 
                  signal.symbol.toLowerCase().includes(searchTerms.botActivity.toLowerCase()) ||
                  signal.signal.toLowerCase().includes(searchTerms.botActivity.toLowerCase()) ||
                  signal.bot.name.toLowerCase().includes(searchTerms.botActivity.toLowerCase())
                )
                .map((signal) => (
                  <tr key={signal._id} className="border-b hover:bg-gray-50">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <Badge className={
                          signal.emergencyStop ? 'bg-red-100 text-red-800' :
                          !signal.processed ? 'bg-yellow-100 text-yellow-800' :
                          signal.userStats.failedExecutions > 0 ? 'bg-orange-100 text-orange-800' :
                          'bg-green-100 text-green-800'
                        }>
                          {signal.emergencyStop ? 'Emergency Stop' : 
                           signal.processed ? 'Processed' : 'Processing'}
                        </Badge>
                        <span className="font-medium">{signal.signal}</span>
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        via {signal.bot.name}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-medium">{signal.symbol}</div>
                      <div className="text-xs text-gray-500">{signal.exchange}</div>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="font-medium">₹{signal.price.toLocaleString()}</div>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <div className="flex items-center justify-center gap-1">
                        {signal.userStats.successfulExecutions > 0 && (
                          <span className="text-green-600 text-sm">✓ {signal.userStats.successfulExecutions}</span>
                        )}
                        {signal.userStats.failedExecutions > 0 && (
                          <span className="text-red-600 text-sm">✗ {signal.userStats.failedExecutions}</span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <div className="text-sm">
                        <div className="text-green-600">✓ {signal.userStats.successfulExecutions}</div>
                        <div className="text-red-600">✗ {signal.userStats.failedExecutions}</div>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="text-sm text-gray-500 flex items-center justify-end gap-1">
                        <Clock className="h-3 w-3" />
                        {formatDate(signal.createdAt)}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-center">
                      {signal.executions.length > 0 && (
                        <details className="inline-block">
                          <summary className="cursor-pointer text-blue-600 hover:text-blue-800 text-sm flex items-center gap-1">
                            <Eye className="h-3 w-3" />
                            View Details
                          </summary>
                          <div className="absolute z-10 mt-2 w-96 bg-white border border-gray-200 rounded-lg shadow-lg p-4 right-0">
                            <h4 className="font-medium mb-2">Execution Details</h4>
                            <div className="space-y-2 max-h-60 overflow-y-auto">
                              {signal.executions.map((exec, idx) => (
                                <div key={idx} className={`text-xs p-3 rounded border-l-4 ${
                                  exec.status === 'EXECUTED' 
                                    ? 'bg-green-50 border-green-400' 
                                    : 'bg-red-50 border-red-400'
                                }`}>
                                  <div className="flex justify-between items-start mb-2">
                                    <span className="font-medium">
                                      {exec.user?.name || exec.user?.email || 'Unknown User'}
                                    </span>
                                    <Badge variant={exec.status === 'EXECUTED' ? 'default' : 'destructive'} className="text-xs">
                                      {exec.status}
                                    </Badge>
                                  </div>
                                  <div className="text-gray-600 mb-1">
                                    Qty: {exec.quantity} | Price: ₹{exec.executedPrice || 'Pending'}
                                  </div>
                                  {exec.createdAt && (
                                    <div className="text-gray-500 text-xs mb-1">
                                      {new Date(exec.createdAt).toLocaleString()}
                                    </div>
                                  )}
                                  {exec.error && (
                                    <div className="text-red-700 bg-red-100 p-2 rounded mt-2 border border-red-200">
                                      <div className="font-medium text-red-800 flex items-center gap-1">
                                        <AlertTriangle className="h-3 w-3" />
                                        Error:
                                      </div>
                                      <div className="mt-1">{exec.error}</div>
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        </details>
                      )}
                    </td>
                  </tr>
                ))}
              {webhookSignals
                .filter(signal => 
                  signal.symbol.toLowerCase().includes(searchTerms.botActivity.toLowerCase()) ||
                  signal.signal.toLowerCase().includes(searchTerms.botActivity.toLowerCase()) ||
                  signal.bot.name.toLowerCase().includes(searchTerms.botActivity.toLowerCase())
                ).length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                    {searchTerms.botActivity ? 'No signals match your search' : 'No bot activity found'}
                  </td>
                </tr>
              )}
            </ZerodhaTable>
          )}
        </>
      )}
    </div>
  )
  } catch (error) {
    console.error('Error rendering trades page:', error)
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4 text-red-600">Error Loading Trades</h1>
          <p className="text-gray-600 mb-4">
            There was an error loading the trades page. Please try refreshing the page.
          </p>
          <Button onClick={() => window.location.reload()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh Page
          </Button>
          <p className="text-sm text-gray-500 mt-4">
            If the problem persists, please contact support.
          </p>
        </div>
      </div>
    )
  }
}

// Main component with Suspense wrapper
export default function Trades() {
  return (
    <Suspense fallback={
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-center items-center min-h-screen">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p>Loading trades...</p>
          </div>
        </div>
      </div>
    }>
      <TradesContent />
    </Suspense>
  )
}