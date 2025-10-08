'use client'

import { useSession } from 'next-auth/react'
import { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ArrowLeft, TrendingUp, TrendingDown, RefreshCw, BarChart3, Activity, FileText, Filter, RotateCcw, Download, Clock, Target, Shield, PieChart, Search } from 'lucide-react'
import Link from 'next/link'

// Same interfaces as before...
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
  bot?: {
    name: string
    strategy: string
  }
}

// Zerodha-style Table Component
const ZerodhaTable = ({ 
  headers, 
  children, 
  searchTerm, 
  onSearch, 
  actions 
}: { 
  headers: string[]
  children: React.ReactNode
  searchTerm?: string
  onSearch?: (term: string) => void
  actions?: React.ReactNode
}) => {
  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      {/* Table Header with Search */}
      <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            {onSearch && (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                <Input
                  placeholder="Search instruments..."
                  value={searchTerm || ''}
                  onChange={(e) => onSearch(e.target.value)}
                  className="pl-10 w-64 h-9 text-sm"
                />
              </div>
            )}
          </div>
          {actions && (
            <div className="flex items-center space-x-2">
              {actions}
            </div>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              {headers.map((header, index) => (
                <th key={index} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {children}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// Position Row Component
const PositionRow = ({ position }: { position: Position }) => {
  const isProfit = position.pnl >= 0
  const changePercent = position.average_price > 0 ? ((position.last_price - position.average_price) / position.average_price * 100) : 0
  
  return (
    <tr className="hover:bg-gray-50">
      <td className="px-4 py-3">
        <div className="flex items-center">
          <div className={`w-2 h-2 rounded-full mr-3 ${position.quantity > 0 ? 'bg-blue-500' : 'bg-red-500'}`}></div>
          <div>
            <div className="text-sm font-medium text-gray-900">{position.product}</div>
          </div>
        </div>
      </td>
      <td className="px-4 py-3">
        <div className="text-sm text-gray-900">{position.tradingsymbol}</div>
        <div className="text-xs text-gray-500">{position.exchange}</div>
      </td>
      <td className="px-4 py-3 text-sm text-gray-900 text-right">
        {Math.abs(position.quantity)}
      </td>
      <td className="px-4 py-3 text-sm text-gray-900 text-right">
        {position.average_price.toFixed(2)}
      </td>
      <td className="px-4 py-3 text-sm text-gray-900 text-right">
        {position.last_price.toFixed(2)}
      </td>
      <td className="px-4 py-3 text-right">
        <div className={`text-sm font-medium ${isProfit ? 'text-green-600' : 'text-red-600'}`}>
          {isProfit ? '+' : ''}{position.pnl.toFixed(2)}
        </div>
        <div className={`text-xs ${changePercent >= 0 ? 'text-green-600' : 'text-red-600'}`}>
          {changePercent >= 0 ? '+' : ''}{changePercent.toFixed(2)}%
        </div>
      </td>
    </tr>
  )
}

// Order Row Component
const OrderRow = ({ order }: { order: Order }) => {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'COMPLETE': return 'text-green-600 bg-green-50'
      case 'CANCELLED': 
      case 'REJECTED': return 'text-red-600 bg-red-50'
      default: return 'text-orange-600 bg-orange-50'
    }
  }

  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString('en-IN', { 
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
  }

  return (
    <tr className="hover:bg-gray-50">
      <td className="px-4 py-3 text-sm text-gray-900">
        {formatTime(order.order_timestamp)}
      </td>
      <td className="px-4 py-3">
        <div className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
          order.transaction_type === 'BUY' ? 'bg-blue-100 text-blue-800' : 'bg-red-100 text-red-800'
        }`}>
          {order.transaction_type}
        </div>
      </td>
      <td className="px-4 py-3">
        <div className="text-sm text-gray-900">{order.tradingsymbol}</div>
        <div className="text-xs text-gray-500">{order.exchange}</div>
      </td>
      <td className="px-4 py-3 text-sm text-gray-900">
        {order.product}
      </td>
      <td className="px-4 py-3 text-sm text-gray-900 text-right">
        {order.filled_quantity > 0 ? `${order.filled_quantity} / ${order.quantity}` : `0 / ${order.quantity}`}
      </td>
      <td className="px-4 py-3 text-sm text-gray-900 text-right">
        {order.average_price > 0 ? order.average_price.toFixed(2) : order.price.toFixed(2)}
      </td>
      <td className="px-4 py-3">
        <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(order.status)}`}>
          {order.status}
        </span>
      </td>
    </tr>
  )
}

// Trade Row Component  
const TradeRow = ({ trade }: { trade: Trade }) => {
  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleTimeString('en-IN', { 
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
  }

  return (
    <tr className="hover:bg-gray-50">
      <td className="px-4 py-3 text-sm text-gray-900">
        {trade.trade_id}
      </td>
      <td className="px-4 py-3 text-sm text-gray-900">
        {formatTime(trade.trade_date)}
      </td>
      <td className="px-4 py-3">
        <div className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
          trade.transaction_type === 'BUY' ? 'bg-blue-100 text-blue-800' : 'bg-red-100 text-red-800'
        }`}>
          {trade.transaction_type}
        </div>
      </td>
      <td className="px-4 py-3">
        <div className="text-sm text-gray-900">{trade.tradingsymbol}</div>
        <div className="text-xs text-gray-500">{trade.exchange}</div>
      </td>
      <td className="px-4 py-3 text-sm text-gray-900">
        {trade.product}
      </td>
      <td className="px-4 py-3 text-sm text-gray-900 text-right">
        {trade.quantity}
      </td>
      <td className="px-4 py-3 text-sm text-gray-900 text-right">
        {trade.price.toFixed(2)}
      </td>
    </tr>
  )
}

// Bot Position Row Component
const BotPositionRow = ({ position }: { position: BotPosition }) => {
  const isProfit = position.totalPnl >= 0
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'OPEN': return 'text-blue-600 bg-blue-50'
      case 'PARTIAL': return 'text-orange-600 bg-orange-50'
      case 'CLOSED': return 'text-gray-600 bg-gray-50'
      default: return 'text-gray-600 bg-gray-50'
    }
  }

  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleTimeString('en-IN', { 
      hour12: false,
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  return (
    <tr className="hover:bg-gray-50">
      <td className="px-4 py-3">
        <div className="flex items-center">
          <div className={`w-2 h-2 rounded-full mr-3 ${position.side === 'LONG' ? 'bg-green-500' : 'bg-red-500'}`}></div>
          <div>
            <div className="text-sm font-medium text-gray-900">{position.instrumentType}</div>
          </div>
        </div>
      </td>
      <td className="px-4 py-3">
        <div className="text-sm text-gray-900">{position.symbol}</div>
        <div className="text-xs text-gray-500">{position.exchange} • {position.botName || 'Bot'} • {position.side}</div>
      </td>
      <td className="px-4 py-3 text-sm text-gray-900 text-right">
        {position.currentQuantity}
      </td>
      <td className="px-4 py-3 text-sm text-gray-900 text-right">
        {position.averagePrice.toFixed(2)}
      </td>
      <td className="px-4 py-3 text-sm text-gray-900 text-right">
        {position.entryPrice.toFixed(2)}
      </td>
      <td className="px-4 py-3 text-right">
        <div className={`text-sm font-medium ${isProfit ? 'text-green-600' : 'text-red-600'}`}>
          {isProfit ? '+' : ''}{position.totalPnl.toFixed(2)}
        </div>
      </td>
      <td className="px-4 py-3">
        <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(position.status)}`}>
          {position.status}
        </span>
      </td>
    </tr>
  )
}

// Export all components
export { ZerodhaTable, PositionRow, OrderRow, TradeRow, BotPositionRow }

// Main component (optional)
export default function ZerodhaStyleTrades() {
  // State management (same as before)
  const { data: session, status } = useSession()
  const [activeTab, setActiveTab] = useState('positions')
  const [positions, setPositions] = useState<{ net: Position[], day: Position[] }>({ net: [], day: [] })
  const [orders, setOrders] = useState<Order[]>([])
  const [trades, setTrades] = useState<Trade[]>([])
  const [botPositions, setBotPositions] = useState<BotPosition[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')

  // Sample data loading functions (implement as needed)
  useEffect(() => {
    if (session) {
      fetchAllData()
    }
  }, [session])

  const fetchAllData = async () => {
    // Implement data fetching
    setLoading(false)
  }

  // Filter functions
  const filteredPositions = positions.net.filter(p => 
    p.tradingsymbol.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const filteredOrders = orders.filter(o => 
    o.tradingsymbol.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const filteredTrades = trades.filter(t => 
    t.tradingsymbol.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const filteredBotPositions = botPositions.filter(p => 
    p.symbol.toLowerCase().includes(searchTerm.toLowerCase())
  )

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

  return (
    <div className="container mx-auto px-4 py-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/dashboard">
              <Button variant="outline" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Dashboard
              </Button>
            </Link>
            <h1 className="text-2xl font-bold text-gray-900">Trading Overview</h1>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm">
              <Download className="h-4 w-4 mr-2" />
              Sync Trades
            </Button>
            <Button variant="outline" size="sm">
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>
        </div>
        <p className="text-gray-600 mt-1">Review your positions and trade history</p>
      </div>

      {/* Tabs */}
      <div className="mb-6">
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-8">
            <button
              onClick={() => setActiveTab('bot-positions')}
              className={`py-3 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'bot-positions'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Bot Positions ({botPositions.length})
            </button>
            <button
              onClick={() => setActiveTab('positions')}
              className={`py-3 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'positions'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Positions ({positions.net.length})
            </button>
            <button
              onClick={() => setActiveTab('orders')}
              className={`py-3 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'orders'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Executed orders ({orders.length})
            </button>
            <button
              onClick={() => setActiveTab('trades')}
              className={`py-3 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'trades'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Trades ({trades.length})
            </button>
          </nav>
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === 'bot-positions' && (
        <ZerodhaTable
          headers={['Product', 'Instrument', 'Qty.', 'Avg.', 'LTP', 'P&L', 'Status']}
          searchTerm={searchTerm}
          onSearch={setSearchTerm}
          actions={
            <Button variant="outline" size="sm">
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          }
        >
          {filteredBotPositions.map((position) => (
            <BotPositionRow key={position._id} position={position} />
          ))}
          {filteredBotPositions.length === 0 && (
            <tr>
              <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                No bot positions found
              </td>
            </tr>
          )}
        </ZerodhaTable>
      )}

      {activeTab === 'positions' && (
        <ZerodhaTable
          headers={['Product', 'Instrument', 'Qty.', 'Avg.', 'LTP', 'P&L']}
          searchTerm={searchTerm}
          onSearch={setSearchTerm}
          actions={
            <Button variant="outline" size="sm">
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          }
        >
          {filteredPositions.map((position) => (
            <PositionRow key={position.instrument_token} position={position} />
          ))}
          {filteredPositions.length === 0 && (
            <tr>
              <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                No positions found
              </td>
            </tr>
          )}
        </ZerodhaTable>
      )}

      {activeTab === 'orders' && (
        <ZerodhaTable
          headers={['Time', 'Type', 'Instrument', 'Product', 'Qty.', 'Avg. price', 'Status']}
          searchTerm={searchTerm}
          onSearch={setSearchTerm}
          actions={
            <>
              <Button variant="outline" size="sm">
                <Filter className="h-4 w-4 mr-2" />
                Filter
              </Button>
              <Button variant="outline" size="sm">
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
            </>
          }
        >
          {filteredOrders.map((order) => (
            <OrderRow key={order.order_id} order={order} />
          ))}
          {filteredOrders.length === 0 && (
            <tr>
              <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                No orders found
              </td>
            </tr>
          )}
        </ZerodhaTable>
      )}

      {activeTab === 'trades' && (
        <ZerodhaTable
          headers={['Trade ID', 'Fill time', 'Type', 'Instrument', 'Product', 'Qty.', 'Avg. Price']}
          searchTerm={searchTerm}
          onSearch={setSearchTerm}
          actions={
            <Button variant="outline" size="sm">
              <Download className="h-4 w-4 mr-2" />
              Download
            </Button>
          }
        >
          {filteredTrades.map((trade) => (
            <TradeRow key={trade.trade_id} trade={trade} />
          ))}
          {filteredTrades.length === 0 && (
            <tr>
              <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                No trades found
              </td>
            </tr>
          )}
        </ZerodhaTable>
      )}
    </div>
  )
}