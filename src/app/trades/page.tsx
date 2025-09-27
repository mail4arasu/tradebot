'use client'

import { useSession } from 'next-auth/react'
import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, TrendingUp, TrendingDown, RefreshCw } from 'lucide-react'
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

export default function Trades() {
  const { data: session, status } = useSession()
  const [trades, setTrades] = useState<Trade[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (session) {
      fetchTrades()
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
            <h1 className="text-3xl font-bold text-gray-900">Trade History</h1>
            <p className="text-gray-600">Review your past trades and performance</p>
          </div>
          <Button onClick={fetchTrades} disabled={loading} variant="outline">
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Error State */}
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

      {/* Loading State */}
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
    </div>
  )
}