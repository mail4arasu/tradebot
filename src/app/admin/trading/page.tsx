'use client'

import { useSession } from 'next-auth/react'
import { useAdmin } from '@/hooks/useAdmin'
import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { 
  AlertTriangle, 
  Activity, 
  Users, 
  TrendingUp, 
  Zap, 
  PlayCircle,
  StopCircle,
  RefreshCw,
  Send,
  Eye,
  Clock,
  Settings
} from 'lucide-react'
import Link from 'next/link'

interface SignalData {
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
  executions: any[]
}

interface EmergencyStatus {
  globalEmergencyStop: boolean
  bots: any[]
  pendingExecutions: number
  totalBots: number
  activeBots: number
  stoppedBots: number
}

export default function TradingAdminDashboard() {
  const { data: session, status } = useSession()
  const { isAdmin, loading: adminLoading } = useAdmin()
  const [signals, setSignals] = useState<SignalData[]>([])
  const [emergencyStatus, setEmergencyStatus] = useState<EmergencyStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [testSignal, setTestSignal] = useState({
    symbol: 'NIFTY50',
    action: 'BUY',
    price: 18500,
    strategy: 'Opening Breakout',
    exchange: 'NFO',
    instrumentType: 'FUTURES'
  })
  const [testLoading, setTestLoading] = useState(false)

  useEffect(() => {
    if (session) {
      fetchData()
      // Auto-refresh every 30 seconds
      const interval = setInterval(fetchData, 30000)
      return () => clearInterval(interval)
    }
  }, [session])

  const fetchData = async () => {
    try {
      setLoading(true)
      const [signalsRes, emergencyRes] = await Promise.all([
        fetch('/api/admin/signals?limit=20'),
        fetch('/api/admin/emergency-stop')
      ])

      if (signalsRes.ok) {
        const signalsData = await signalsRes.json()
        setSignals(signalsData.signals || [])
      }

      if (emergencyRes.ok) {
        const emergencyData = await emergencyRes.json()
        setEmergencyStatus(emergencyData)
      }
    } catch (error) {
      console.error('Error fetching data:', error)
    } finally {
      setLoading(false)
    }
  }

  const toggleEmergencyStop = async (botId?: string, global = false) => {
    try {
      const currentStatus = global 
        ? emergencyStatus?.globalEmergencyStop
        : emergencyStatus?.bots.find(b => b._id === botId)?.emergencyStop

      const response = await fetch('/api/admin/emergency-stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          botId,
          global,
          emergencyStop: !currentStatus
        })
      })

      if (response.ok) {
        fetchData() // Refresh data
        const result = await response.json()
        alert(result.message)
      } else {
        const error = await response.json()
        alert(`Error: ${error.error}`)
      }
    } catch (error) {
      alert('Failed to toggle emergency stop')
    }
  }

  const testWebhook = async () => {
    try {
      setTestLoading(true)
      const response = await fetch('/api/admin/signals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testSignal)
      })

      const result = await response.json()
      
      if (result.success) {
        alert(`Test signal sent successfully! Affected ${result.result.results?.totalUsers || 0} users`)
        fetchData() // Refresh to show new signal
      } else {
        alert(`Test failed: ${result.result?.error || 'Unknown error'}`)
      }
    } catch (error) {
      alert('Failed to send test signal')
    } finally {
      setTestLoading(false)
    }
  }

  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleString()
  }

  const getSignalStatusColor = (signal: SignalData) => {
    if (signal.emergencyStop) return 'bg-red-100 text-red-800'
    if (!signal.processed) return 'bg-yellow-100 text-yellow-800'
    if (signal.failedExecutions > 0) return 'bg-orange-100 text-orange-800'
    return 'bg-green-100 text-green-800'
  }

  if (status === 'loading' || adminLoading) {
    return <div className="flex justify-center items-center min-h-screen">Loading...</div>
  }

  if (!session || !isAdmin) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Admin Access Required</h1>
          <Link href="/admin">
            <Button>Go to Admin Dashboard</Button>
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Trading System Control</h1>
            <p className="text-gray-600">Monitor and control automated trading operations</p>
          </div>
          <div className="flex gap-2">
            <Button onClick={fetchData} variant="outline" disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Link href="/admin/webhook-config">
              <Button variant="outline">
                <Settings className="h-4 w-4 mr-2" />
                Webhook Config
              </Button>
            </Link>
            <Link href="/admin">
              <Button variant="outline">Back to Admin</Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Emergency Controls */}
      {emergencyStatus && (
        <Card className="mb-8 border-red-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-900">
              <AlertTriangle className="h-5 w-5" />
              Emergency Controls
            </CardTitle>
            <CardDescription>
              Global emergency stop will halt all bot operations immediately
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">{emergencyStatus.totalBots}</div>
                <div className="text-sm text-gray-600">Total Bots</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">{emergencyStatus.activeBots}</div>
                <div className="text-sm text-gray-600">Active Bots</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-red-600">{emergencyStatus.stoppedBots}</div>
                <div className="text-sm text-gray-600">Stopped Bots</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-orange-600">{emergencyStatus.pendingExecutions}</div>
                <div className="text-sm text-gray-600">Pending Orders</div>
              </div>
            </div>

            <div className="flex items-center justify-between p-4 bg-red-50 rounded-lg">
              <div>
                <div className="font-medium text-red-900">Global Emergency Stop</div>
                <div className="text-sm text-red-700">
                  {emergencyStatus.globalEmergencyStop ? 'All trading is currently halted' : 'All bots are operational'}
                </div>
              </div>
              <Button
                onClick={() => toggleEmergencyStop(undefined, true)}
                variant={emergencyStatus.globalEmergencyStop ? "destructive" : "outline"}
                className="flex items-center gap-2"
              >
                {emergencyStatus.globalEmergencyStop ? (
                  <>
                    <PlayCircle className="h-4 w-4" />
                    Resume All
                  </>
                ) : (
                  <>
                    <StopCircle className="h-4 w-4" />
                    Emergency Stop
                  </>
                )}
              </Button>
            </div>

            {/* Individual Bot Controls */}
            <div className="mt-6">
              <h4 className="font-medium mb-3">Individual Bot Controls</h4>
              <div className="space-y-2">
                {emergencyStatus.bots.map((bot) => (
                  <div key={bot._id} className="flex items-center justify-between p-3 border rounded">
                    <div className="flex items-center gap-3">
                      <div>
                        <div className="font-medium">{bot.name}</div>
                        <div className="text-sm text-gray-600">{bot.symbol} ({bot.exchange})</div>
                      </div>
                      <Badge variant={bot.isActive && !bot.emergencyStop ? 'default' : 'secondary'}>
                        {bot.emergencyStop ? 'Stopped' : bot.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>
                    <Switch
                      checked={!bot.emergencyStop}
                      onCheckedChange={() => toggleEmergencyStop(bot._id)}
                      disabled={!bot.isActive}
                    />
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Test Signal */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Send className="h-5 w-5" />
            Test Signal
          </CardTitle>
          <CardDescription>
            Send a test signal to the webhook endpoint to verify system functionality
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div>
              <Label htmlFor="symbol">Symbol</Label>
              <Input
                id="symbol"
                value={testSignal.symbol}
                onChange={(e) => setTestSignal(prev => ({ ...prev, symbol: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="action">Action</Label>
              <select
                className="w-full p-2 border rounded"
                value={testSignal.action}
                onChange={(e) => setTestSignal(prev => ({ ...prev, action: e.target.value }))}
              >
                <option value="BUY">BUY</option>
                <option value="SELL">SELL</option>
                <option value="EXIT">EXIT</option>
                <option value="ENTRY">ENTRY</option>
              </select>
            </div>
            <div>
              <Label htmlFor="price">Price</Label>
              <Input
                id="price"
                type="number"
                value={testSignal.price}
                onChange={(e) => setTestSignal(prev => ({ ...prev, price: parseFloat(e.target.value) }))}
              />
            </div>
          </div>
          <Button onClick={testWebhook} disabled={testLoading}>
            <Send className="h-4 w-4 mr-2" />
            {testLoading ? 'Sending...' : 'Send Test Signal'}
          </Button>
        </CardContent>
      </Card>

      {/* Recent Signals */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Recent Webhook Signals
          </CardTitle>
          <CardDescription>
            Latest TradingView signals and their execution status
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8">Loading signals...</div>
          ) : signals.length === 0 ? (
            <div className="text-center py-8 text-gray-500">No signals received yet</div>
          ) : (
            <div className="space-y-4">
              {signals.map((signal) => (
                <div key={signal._id} className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <Badge className={getSignalStatusColor(signal)}>
                        {signal.emergencyStop ? 'Emergency Stop' : 
                         signal.processed ? 'Processed' : 'Processing'}
                      </Badge>
                      <div className="font-medium">
                        {signal.signal} {signal.symbol} @ ₹{signal.price}
                      </div>
                      <div className="text-sm text-gray-600">
                        via {signal.bot.name}
                      </div>
                    </div>
                    <div className="text-sm text-gray-500 flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatTime(signal.createdAt)}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <span className="text-gray-500">Users Targeted:</span>
                      <div className="font-medium">{signal.totalUsersTargeted}</div>
                    </div>
                    <div>
                      <span className="text-gray-500">Successful:</span>
                      <div className="font-medium text-green-600">{signal.successfulExecutions}</div>
                    </div>
                    <div>
                      <span className="text-gray-500">Failed:</span>
                      <div className="font-medium text-red-600">{signal.failedExecutions}</div>
                    </div>
                    <div>
                      <span className="text-gray-500">Success Rate:</span>
                      <div className="font-medium">
                        {signal.totalUsersTargeted > 0 
                          ? Math.round((signal.successfulExecutions / signal.totalUsersTargeted) * 100)
                          : 0}%
                      </div>
                    </div>
                  </div>

                  {signal.executions.length > 0 && (
                    <details className="mt-3">
                      <summary className="cursor-pointer text-sm text-blue-600 hover:text-blue-800">
                        View {signal.executions.length} execution details
                      </summary>
                      <div className="mt-2 space-y-2 max-h-40 overflow-y-auto">
                        {signal.executions.map((exec: any, idx: number) => (
                          <div key={idx} className="text-xs p-2 bg-gray-50 rounded">
                            <div className="flex justify-between">
                              <span>User: {exec.userId.toString().slice(-8)}</span>
                              <Badge variant={exec.status === 'EXECUTED' ? 'default' : 'destructive'}>
                                {exec.status}
                              </Badge>
                            </div>
                            <div className="text-gray-600">
                              Qty: {exec.quantity} | Price: ₹{exec.executedPrice || 'Pending'}
                            </div>
                            {exec.error && (
                              <div className="text-red-600">Error: {exec.error}</div>
                            )}
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}