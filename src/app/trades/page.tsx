'use client'

import { useSession } from 'next-auth/react'
import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ArrowLeft, TrendingUp, TrendingDown, RefreshCw, BarChart3, Activity, FileText, Filter, RotateCcw, Download } from 'lucide-react'
import Link from 'next/link'

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

export default function Trades() {
  const { data: session, status } = useSession()
  const [trades, setTrades] = useState<Trade[]>([])
  const [positions, setPositions] = useState<{net: Position[], day: Position[]}>({net: [], day: []})
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [positionsLoading, setPositionsLoading] = useState(true)
  const [ordersLoading, setOrdersLoading] = useState(true)
  const [error, setError] = useState('')
  const [positionsError, setPositionsError] = useState('')
  const [ordersError, setOrdersError] = useState('')
  const [activeTab, setActiveTab] = useState<'trades' | 'positions' | 'orders'>('positions')
  const [syncing, setSyncing] = useState(false)
  const [syncStatus, setSyncStatus] = useState<any>(null)
  
  // Order filtering states
  const [orderFilters, setOrderFilters] = useState({
    startDate: new Date().toISOString().split('T')[0], // Today (Zerodha API limitation)
    endDate: new Date().toISOString().split('T')[0], // Today
    orderStatus: 'all' as 'all' | 'complete' | 'open' | 'cancelled'
  })
  const [orderSummary, setOrderSummary] = useState({
    total: 0,
    complete: 0,
    open: 0,
    cancelled: 0,
    totalValue: 0
  })

  useEffect(() => {
    if (session) {
      fetchTrades()
      fetchPositions()
      fetchOrders()
      fetchSyncStatus()
    }
  }, [session])

  // Refetch orders when filters change
  useEffect(() => {
    if (session) {
      fetchOrders()
    }
  }, [orderFilters, session])

  const fetchTrades = async () => {
    try {
      setLoading(true)
      setError('')
      const response = await fetch('/api/zerodha/trades')
      
      if (response.ok) {
        const data = await response.json()
        setTrades(data.trades || [])
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

  const fetchOrders = async () => {
    try {
      setOrdersLoading(true)
      setOrdersError('')
      
      const queryParams = new URLSearchParams({
        startDate: orderFilters.startDate,
        endDate: orderFilters.endDate,
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

  const refreshAll = async () => {
    await Promise.all([fetchTrades(), fetchPositions(), fetchOrders()])
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const formatCurrency = (amount: number) => {
    return `₹${amount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
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
          <Link href="/auth/signin">
            <Button>Sign In</Button>
          </Link>
        </div>
      </div>
    )
  }

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
              onClick={() => setActiveTab('positions')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'positions'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <Activity className="h-4 w-4 inline mr-2" />
              Open Positions ({positions.net.length + positions.day.length})
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
          </nav>
        </div>
      </div>

      {/* Tab Content */}
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
            <>
              {positions.net.length === 0 && positions.day.length === 0 ? (
                <Card>
                  <CardContent className="pt-6">
                    <div className="text-center py-8">
                      <Activity className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                      <h3 className="text-lg font-medium text-gray-900 mb-2">No open positions</h3>
                      <p className="text-gray-600">Your open positions will appear here when you have active trades.</p>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-6">
                  {/* Net Positions */}
                  {positions.net.length > 0 && (
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900 mb-4">Net Positions ({positions.net.length})</h3>
                      <div className="space-y-4">
                        {positions.net.map((position, index) => (
                          <Card key={`net-${index}`}>
                            <CardContent className="pt-6">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center space-x-4">
                                  <div className={`p-2 rounded-full ${
                                    position.quantity > 0 
                                      ? 'bg-green-100 text-green-600' 
                                      : 'bg-red-100 text-red-600'
                                  }`}>
                                    {position.quantity > 0 ? (
                                      <TrendingUp className="h-4 w-4" />
                                    ) : (
                                      <TrendingDown className="h-4 w-4" />
                                    )}
                                  </div>
                                  
                                  <div>
                                    <h3 className="font-medium text-gray-900">
                                      {position.tradingsymbol}
                                    </h3>
                                    <p className="text-sm text-gray-600">
                                      {position.exchange} • {position.product}
                                    </p>
                                  </div>
                                </div>
                                
                                <div className="text-right">
                                  <div className="flex items-center space-x-4">
                                    <Badge variant={position.quantity > 0 ? 'default' : 'secondary'}>
                                      {position.quantity > 0 ? 'LONG' : 'SHORT'}
                                    </Badge>
                                    
                                    <div className="text-right">
                                      <p className="font-medium">
                                        {Math.abs(position.quantity)} @ {formatCurrency(position.average_price)}
                                      </p>
                                      <p className={`text-sm ${
                                        position.pnl >= 0 ? 'text-green-600' : 'text-red-600'
                                      }`}>
                                        P&L: {formatCurrency(position.pnl)}
                                      </p>
                                    </div>
                                  </div>
                                </div>
                              </div>
                              
                              <div className="mt-4 pt-4 border-t border-gray-100">
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                                  <div>
                                    <span className="text-gray-500">Last Price:</span>
                                    <p className="font-medium">{formatCurrency(position.last_price)}</p>
                                  </div>
                                  <div>
                                    <span className="text-gray-500">Value:</span>
                                    <p className="font-medium">{formatCurrency(position.value)}</p>
                                  </div>
                                  <div>
                                    <span className="text-gray-500">Unrealised:</span>
                                    <p className={`font-medium ${
                                      position.unrealised >= 0 ? 'text-green-600' : 'text-red-600'
                                    }`}>
                                      {formatCurrency(position.unrealised)}
                                    </p>
                                  </div>
                                  <div>
                                    <span className="text-gray-500">Realised:</span>
                                    <p className={`font-medium ${
                                      position.realised >= 0 ? 'text-green-600' : 'text-red-600'
                                    }`}>
                                      {formatCurrency(position.realised)}
                                    </p>
                                  </div>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Day Positions */}
                  {positions.day.length > 0 && (
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900 mb-4">Day Positions ({positions.day.length})</h3>
                      <div className="space-y-4">
                        {positions.day.map((position, index) => (
                          <Card key={`day-${index}`} className="border-orange-200 bg-orange-50">
                            <CardContent className="pt-6">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center space-x-4">
                                  <div className={`p-2 rounded-full ${
                                    position.quantity > 0 
                                      ? 'bg-green-100 text-green-600' 
                                      : 'bg-red-100 text-red-600'
                                  }`}>
                                    {position.quantity > 0 ? (
                                      <TrendingUp className="h-4 w-4" />
                                    ) : (
                                      <TrendingDown className="h-4 w-4" />
                                    )}
                                  </div>
                                  
                                  <div>
                                    <h3 className="font-medium text-gray-900">
                                      {position.tradingsymbol}
                                    </h3>
                                    <p className="text-sm text-gray-600">
                                      {position.exchange} • {position.product} • <span className="text-orange-600">Day Position</span>
                                    </p>
                                  </div>
                                </div>
                                
                                <div className="text-right">
                                  <div className="flex items-center space-x-4">
                                    <Badge variant={position.quantity > 0 ? 'default' : 'secondary'}>
                                      {position.quantity > 0 ? 'LONG' : 'SHORT'}
                                    </Badge>
                                    
                                    <div className="text-right">
                                      <p className="font-medium">
                                        {Math.abs(position.quantity)} @ {formatCurrency(position.average_price)}
                                      </p>
                                      <p className={`text-sm ${
                                        position.pnl >= 0 ? 'text-green-600' : 'text-red-600'
                                      }`}>
                                        P&L: {formatCurrency(position.pnl)}
                                      </p>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </>
      )}

      {activeTab === 'orders' && (
        <>
          {/* Order Filters */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Filter className="h-5 w-5" />
                Order Filters
              </CardTitle>
              <CardDescription>
                Filter orders by date range and status. Note: Zerodha API only provides current day orders.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4 items-end">
                <div>
                  <Label htmlFor="startDate">Start Date</Label>
                  <Input
                    id="startDate"
                    type="date"
                    value={orderFilters.startDate}
                    onChange={(e) => setOrderFilters(prev => ({
                      ...prev,
                      startDate: e.target.value
                    }))}
                    max={orderFilters.endDate}
                  />
                </div>
                
                <div>
                  <Label htmlFor="endDate">End Date</Label>
                  <Input
                    id="endDate"
                    type="date"
                    value={orderFilters.endDate}
                    onChange={(e) => setOrderFilters(prev => ({
                      ...prev,
                      endDate: e.target.value
                    }))}
                    min={orderFilters.startDate}
                    max={new Date().toISOString().split('T')[0]}
                  />
                </div>
                
                <div>
                  <Label htmlFor="orderStatus">Order Status</Label>
                  <select
                    id="orderStatus"
                    value={orderFilters.orderStatus}
                    onChange={(e) => setOrderFilters(prev => ({
                      ...prev,
                      orderStatus: e.target.value as 'all' | 'complete' | 'open' | 'cancelled'
                    }))}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <option value="all">All Orders</option>
                    <option value="complete">Completed</option>
                    <option value="open">Open/Pending</option>
                    <option value="cancelled">Cancelled/Rejected</option>
                  </select>
                </div>
                
                <div>
                  <Button
                    onClick={() => setOrderFilters({
                      startDate: new Date().toISOString().split('T')[0],
                      endDate: new Date().toISOString().split('T')[0],
                      orderStatus: 'all'
                    })}
                    variant="outline"
                    className="w-full"
                  >
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Today
                  </Button>
                </div>
                
                <div>
                  <Button
                    onClick={fetchOrders}
                    disabled={ordersLoading}
                    className="w-full"
                  >
                    <Filter className="h-4 w-4 mr-2" />
                    Apply Filters
                  </Button>
                </div>
              </div>
              
              {/* Order Summary */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-6 pt-4 border-t">
                <div className="text-center">
                  <div className="text-2xl font-bold text-gray-900">{orderSummary.total}</div>
                  <div className="text-sm text-gray-600">Total Orders</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">{orderSummary.complete}</div>
                  <div className="text-sm text-gray-600">Completed</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600">{orderSummary.open}</div>
                  <div className="text-sm text-gray-600">Open</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-red-600">{orderSummary.cancelled}</div>
                  <div className="text-sm text-gray-600">Cancelled</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-purple-600">{formatCurrency(orderSummary.totalValue)}</div>
                  <div className="text-sm text-gray-600">Total Value</div>
                </div>
              </div>
            </CardContent>
          </Card>

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

          {/* Orders Loading State */}
          {ordersLoading && (
            <Card>
              <CardContent className="pt-6">
                <div className="flex justify-center items-center py-8">
                  <RefreshCw className="h-6 w-6 animate-spin mr-2" />
                  <span>Loading orders...</span>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Orders List */}
          {!ordersLoading && !ordersError && (
            <>
              {orders.length === 0 ? (
                <Card>
                  <CardContent className="pt-6">
                    <div className="text-center py-8">
                      <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                      <h3 className="text-lg font-medium text-gray-900 mb-2">No orders found</h3>
                      <p className="text-gray-600">
                        No orders match your current filter criteria. 
                        <br />
                        <span className="text-sm text-orange-600 mt-2 inline-block">
                          Note: Zerodha API only provides orders for the current trading day.
                        </span>
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-4">
                  <div className="mb-4">
                    <p className="text-sm text-gray-600">
                      Showing {orders.length} order{orders.length !== 1 ? 's' : ''} 
                      {orderFilters.startDate && orderFilters.endDate && (
                        <span> from {formatDate(orderFilters.startDate)} to {formatDate(orderFilters.endDate)}</span>
                      )}
                    </p>
                  </div>
                  
                  {orders.map((order) => (
                    <Card key={order.order_id}>
                      <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-4">
                            <div className={`p-2 rounded-full ${getOrderStatusColor(order.status)}`}>
                              {getOrderStatusIcon(order.status)}
                            </div>
                            
                            <div>
                              <h3 className="font-medium text-gray-900">
                                {order.tradingsymbol}
                              </h3>
                              <p className="text-sm text-gray-600">
                                {order.exchange} • {formatDate(order.order_timestamp)} • {order.order_type}
                              </p>
                            </div>
                          </div>
                          
                          <div className="text-right">
                            <div className="flex items-center space-x-4">
                              <Badge className={getOrderStatusColor(order.status)}>
                                {order.status}
                              </Badge>
                              <Badge variant={order.transaction_type === 'BUY' ? 'default' : 'secondary'}>
                                {order.transaction_type}
                              </Badge>
                              
                              <div className="text-right">
                                <p className="font-medium">
                                  {order.filled_quantity > 0 && order.status === 'COMPLETE' 
                                    ? `${order.filled_quantity} @ ${formatCurrency(order.average_price)}` 
                                    : `${order.quantity} @ ${formatCurrency(order.price)}`}
                                </p>
                                <p className="text-sm text-gray-600">
                                  {order.status === 'COMPLETE' && order.filled_quantity > 0 
                                    ? `Total: ${formatCurrency(order.filled_quantity * order.average_price)}`
                                    : `Target: ${formatCurrency(order.quantity * order.price)}`}
                                </p>
                              </div>
                            </div>
                          </div>
                        </div>
                        
                        <div className="mt-4 pt-4 border-t border-gray-100">
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                            <div>
                              <span className="text-gray-500">Order ID:</span>
                              <p className="font-mono">{order.order_id}</p>
                            </div>
                            <div>
                              <span className="text-gray-500">Product:</span>
                              <p>{order.product}</p>
                            </div>
                            <div>
                              <span className="text-gray-500">Quantity:</span>
                              <p>
                                {order.filled_quantity > 0 
                                  ? `${order.filled_quantity}/${order.quantity}`
                                  : order.quantity}
                                {order.pending_quantity > 0 && (
                                  <span className="text-orange-600"> ({order.pending_quantity} pending)</span>
                                )}
                              </p>
                            </div>
                            <div>
                              <span className="text-gray-500">Validity:</span>
                              <p>{order.validity}</p>
                            </div>
                          </div>
                          
                          {order.status_message && (
                            <div className="mt-3 pt-3 border-t border-gray-100">
                              <span className="text-gray-500 text-sm">Status Message:</span>
                              <p className="text-sm text-gray-700 mt-1">{order.status_message}</p>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}

      {activeTab === 'trades' && (
        <>
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

          {/* Trades List */}
          {!loading && !error && (
            <>
              {trades.length === 0 ? (
                <Card>
                  <CardContent className="pt-6">
                    <div className="text-center py-8">
                      <TrendingUp className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                      <h3 className="text-lg font-medium text-gray-900 mb-2">No trades found</h3>
                      <p className="text-gray-600">Your trade history will appear here once you start trading.</p>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-4">
                  <div className="mb-4">
                    <p className="text-sm text-gray-600">
                      Showing {trades.length} trade{trades.length !== 1 ? 's' : ''}
                    </p>
                  </div>
                  
                  {trades.map((trade) => (
                    <Card key={trade.trade_id}>
                      <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-4">
                            <div className={`p-2 rounded-full ${
                              trade.transaction_type === 'BUY' 
                                ? 'bg-green-100 text-green-600' 
                                : 'bg-red-100 text-red-600'
                            }`}>
                              {trade.transaction_type === 'BUY' ? (
                                <TrendingUp className="h-4 w-4" />
                              ) : (
                                <TrendingDown className="h-4 w-4" />
                              )}
                            </div>
                            
                            <div>
                              <h3 className="font-medium text-gray-900">
                                {trade.tradingsymbol}
                              </h3>
                              <p className="text-sm text-gray-600">
                                {trade.exchange} • {formatDate(trade.trade_date)}
                              </p>
                            </div>
                          </div>
                          
                          <div className="text-right">
                            <div className="flex items-center space-x-4">
                              <Badge variant={trade.transaction_type === 'BUY' ? 'default' : 'secondary'}>
                                {trade.transaction_type}
                              </Badge>
                              
                              <div className="text-right">
                                <p className="font-medium">
                                  {trade.quantity} @ {formatCurrency(trade.price)}
                                </p>
                                <p className="text-sm text-gray-600">
                                  Total: {formatCurrency(trade.quantity * trade.price)}
                                </p>
                              </div>
                            </div>
                          </div>
                        </div>
                        
                        <div className="mt-4 pt-4 border-t border-gray-100">
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                            <div>
                              <span className="text-gray-500">Trade ID:</span>
                              <p className="font-mono">{trade.trade_id}</p>
                            </div>
                            <div>
                              <span className="text-gray-500">Order ID:</span>
                              <p className="font-mono">{trade.order_id}</p>
                            </div>
                            <div>
                              <span className="text-gray-500">Product:</span>
                              <p>{trade.product}</p>
                            </div>
                            <div>
                              <span className="text-gray-500">Exchange:</span>
                              <p>{trade.exchange}</p>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}