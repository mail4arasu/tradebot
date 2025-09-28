'use client'

import { useSession } from 'next-auth/react'
import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, TrendingUp, TrendingDown, RefreshCw, BarChart3, Activity } from 'lucide-react'
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

export default function Trades() {
  const { data: session, status } = useSession()
  const [trades, setTrades] = useState<Trade[]>([])
  const [positions, setPositions] = useState<{net: Position[], day: Position[]}>({net: [], day: []})
  const [loading, setLoading] = useState(true)
  const [positionsLoading, setPositionsLoading] = useState(true)
  const [error, setError] = useState('')
  const [positionsError, setPositionsError] = useState('')
  const [activeTab, setActiveTab] = useState<'trades' | 'positions'>('positions')

  useEffect(() => {
    if (session) {
      fetchTrades()
      fetchPositions()
    }
  }, [session])

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

  const refreshAll = async () => {
    await Promise.all([fetchTrades(), fetchPositions()])
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
          <Button onClick={refreshAll} disabled={loading || positionsLoading} variant="outline">
            <RefreshCw className={`h-4 w-4 mr-2 ${(loading || positionsLoading) ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

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