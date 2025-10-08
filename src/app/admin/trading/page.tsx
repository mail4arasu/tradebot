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
  Settings,
  Target,
  Calculator,
  Percent
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

interface OptionsSimulatorData {
  action: 'BUY' | 'SELL'
  date: string
  price: number
  capital: number
  riskPercentage: number
}

interface SimulationResult {
  selectedContract: {
    symbol: string
    strike: number
    expiry: string
    optionType: 'CE' | 'PE'
  }
  marketData: {
    premium: number
    delta: number
    openInterest: number
    lotSize: number
  }
  calculation: {
    positionSize: number
    totalInvestment: number
    riskAmount: number
  }
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
    instrumentType: 'FUTURES',
    botId: ''
  })
  const [testLoading, setTestLoading] = useState(false)
  
  // Options Simulator State
  const [simulatorData, setSimulatorData] = useState<OptionsSimulatorData>({
    action: 'BUY',
    date: new Date().toISOString().split('T')[0],
    price: 19500,
    capital: 100000,
    riskPercentage: 5
  })
  const [simulationResult, setSimulationResult] = useState<SimulationResult | null>(null)
  const [simulatorLoading, setSimulatorLoading] = useState(false)

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

  const toggleBotActive = async (botId: string) => {
    try {
      const bot = emergencyStatus?.bots.find(b => b._id === botId)
      const response = await fetch('/api/admin/bots', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          botId,
          isActive: !bot?.isActive
        })
      })

      if (response.ok) {
        fetchData() // Refresh data
        const result = await response.json()
        alert(result.message || `Bot ${!bot?.isActive ? 'activated' : 'deactivated'} successfully`)
      } else {
        const error = await response.json()
        alert(`Error: ${error.error}`)
      }
    } catch (error) {
      alert('Failed to toggle bot status')
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

  const runOptionsSimulation = async () => {
    try {
      setSimulatorLoading(true)
      const response = await fetch('/api/admin/options-simulator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(simulatorData)
      })

      const result = await response.json()
      
      if (result.success) {
        setSimulationResult(result.data)
      } else {
        // Show user-friendly error messages
        if (result.error.includes('access token has expired') || result.error.includes('TokenException')) {
          alert(`🔑 Token Expired!\n\n${result.error}\n\nZerodha tokens expire daily and need to be refreshed each day.`)
        } else if (result.error.includes('not configured')) {
          alert(`⚙️ Setup Required!\n\n${result.error}`)
        } else {
          alert(`❌ Simulation Failed!\n\n${result.error}`)
        }
      }
    } catch (error) {
      console.error('Simulation error:', error)
      alert('Failed to run simulation')
    } finally {
      setSimulatorLoading(false)
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
                    <div className="flex items-center gap-3">
                      <div className="flex flex-col items-center gap-1">
                        <Switch
                          checked={bot.isActive}
                          onCheckedChange={() => toggleBotActive(bot._id)}
                          className="data-[state=checked]:bg-green-600 data-[state=unchecked]:bg-gray-300"
                        />
                        <span className="text-xs text-gray-500">Bot Active</span>
                      </div>
                      <div className="flex flex-col items-center gap-1">
                        <Switch
                          checked={!bot.emergencyStop}
                          onCheckedChange={() => toggleEmergencyStop(bot._id)}
                          disabled={!bot.isActive}
                          className="data-[state=checked]:bg-blue-600 data-[state=unchecked]:bg-red-300"
                        />
                        <span className="text-xs text-gray-500">Emergency</span>
                      </div>
                    </div>
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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            <div>
              <Label htmlFor="bot">Target Bot</Label>
              <select
                className="w-full p-2 border rounded"
                value={testSignal.botId}
                onChange={(e) => setTestSignal(prev => ({ ...prev, botId: e.target.value }))}
              >
                <option value="">Select Bot (All if empty)</option>
                {emergencyStatus?.bots.map((bot) => (
                  <option key={bot._id} value={bot._id}>
                    {bot.name} ({bot.isActive ? 'Active' : 'Inactive'})
                  </option>
                ))}
              </select>
            </div>
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

      {/* Options Trading Simulator */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5" />
            Options Trading Simulator
          </CardTitle>
          <CardDescription>
            Test the Options Analysis Engine with real Zerodha API data to validate strike selection, premium, delta, and position sizing
            <br />
            <span className="text-orange-600 font-medium">⚠️ Requires active Zerodha connection. Tokens expire daily.</span>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Input Parameters */}
            <div className="space-y-4">
              <h4 className="font-medium text-gray-900 flex items-center gap-2">
                <Calculator className="h-4 w-4" />
                Simulation Parameters
              </h4>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="sim-action">Action</Label>
                  <select
                    id="sim-action"
                    className="w-full p-2 border rounded"
                    value={simulatorData.action}
                    onChange={(e) => setSimulatorData(prev => ({ 
                      ...prev, 
                      action: e.target.value as 'BUY' | 'SELL' 
                    }))}
                  >
                    <option value="BUY">BUY (Call Options)</option>
                    <option value="SELL">SELL (Put Options)</option>
                  </select>
                </div>
                
                <div>
                  <Label htmlFor="sim-date">Date (for expiry selection)</Label>
                  <Input
                    id="sim-date"
                    type="date"
                    value={simulatorData.date}
                    onChange={(e) => setSimulatorData(prev => ({ ...prev, date: e.target.value }))}
                  />
                </div>
                
                <div>
                  <Label htmlFor="sim-price">Current Price (₹)</Label>
                  <Input
                    id="sim-price"
                    type="number"
                    step="0.5"
                    value={simulatorData.price}
                    onChange={(e) => setSimulatorData(prev => ({ 
                      ...prev, 
                      price: parseFloat(e.target.value) || 0 
                    }))}
                  />
                  <p className="text-xs text-gray-500 mt-1">Used for ATM strike calculation</p>
                </div>
                
                <div>
                  <Label htmlFor="sim-capital">Capital Amount (₹)</Label>
                  <Input
                    id="sim-capital"
                    type="number"
                    step="1000"
                    value={simulatorData.capital}
                    onChange={(e) => setSimulatorData(prev => ({ 
                      ...prev, 
                      capital: parseFloat(e.target.value) || 0 
                    }))}
                  />
                </div>
                
                <div className="md:col-span-2">
                  <Label htmlFor="sim-risk" className="flex items-center gap-2">
                    <Percent className="h-3 w-3" />
                    Risk Percentage (%)
                  </Label>
                  <Input
                    id="sim-risk"
                    type="number"
                    step="0.5"
                    min="1"
                    max="50"
                    value={simulatorData.riskPercentage}
                    onChange={(e) => setSimulatorData(prev => ({ 
                      ...prev, 
                      riskPercentage: parseFloat(e.target.value) || 0 
                    }))}
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Percentage of capital to risk (Risk Amount: ₹{(simulatorData.capital * simulatorData.riskPercentage / 100).toLocaleString()})
                  </p>
                </div>
              </div>
              
              <Button 
                onClick={runOptionsSimulation} 
                disabled={simulatorLoading}
                className="w-full bg-purple-600 hover:bg-purple-700"
              >
                <Target className="h-4 w-4 mr-2" />
                {simulatorLoading ? 'Running Simulation...' : 'Run Options Simulation'}
              </Button>
            </div>

            {/* Simulation Results */}
            <div className="space-y-4">
              <h4 className="font-medium text-gray-900 flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                Simulation Results
              </h4>
              
              {simulationResult ? (
                <div className="space-y-4">
                  {/* Selected Contract */}
                  <div className="p-4 bg-purple-50 border border-purple-200 rounded-lg">
                    <h5 className="font-medium text-purple-900 mb-2">Selected Options Contract</h5>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <span className="text-gray-500">Symbol:</span>
                        <span className="ml-2 font-mono font-medium">{simulationResult.selectedContract.symbol}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">Strike:</span>
                        <span className="ml-2 font-medium">₹{simulationResult.selectedContract.strike}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">Expiry:</span>
                        <span className="ml-2 font-medium">{simulationResult.selectedContract.expiry}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">Type:</span>
                        <span className="ml-2 font-medium">{simulationResult.selectedContract.optionType}</span>
                      </div>
                    </div>
                  </div>
                  
                  {/* Market Data */}
                  <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                    <h5 className="font-medium text-blue-900 mb-2">Live Market Data (Zerodha API)</h5>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <span className="text-gray-500">Premium:</span>
                        <span className="ml-2 font-medium">₹{simulationResult.marketData.premium.toFixed(2)}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">Delta:</span>
                        <span className="ml-2 font-medium">{simulationResult.marketData.delta.toFixed(3)}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">Open Interest:</span>
                        <span className="ml-2 font-medium">{simulationResult.marketData.openInterest.toLocaleString()}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">Lot Size:</span>
                        <span className="ml-2 font-medium">{simulationResult.marketData.lotSize}</span>
                      </div>
                    </div>
                  </div>
                  
                  {/* Position Calculation */}
                  <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                    <h5 className="font-medium text-green-900 mb-2">Position Size Calculation</h5>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-500">Position Size:</span>
                        <span className="font-medium">{simulationResult.calculation.positionSize} lots</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Total Investment:</span>
                        <span className="font-medium">₹{simulationResult.calculation.totalInvestment.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Risk Amount:</span>
                        <span className="font-medium">₹{simulationResult.calculation.riskAmount.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between border-t pt-2">
                        <span className="text-gray-500">Quantity:</span>
                        <span className="font-medium">{simulationResult.calculation.positionSize * simulationResult.marketData.lotSize}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-8 border-2 border-dashed border-gray-300 rounded-lg text-center text-gray-500">
                  <Target className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Run a simulation to see results</p>
                  <p className="text-sm">This will test the complete Options Analysis Engine with real Zerodha API data</p>
                </div>
              )}
            </div>
          </div>
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
                      <summary className="cursor-pointer text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1">
                        <Eye className="h-3 w-3" />
                        View {signal.executions.length} execution details
                      </summary>
                      <div className="mt-2 space-y-2 max-h-60 overflow-y-auto">
                        {signal.executions.map((exec: any, idx: number) => (
                          <div key={idx} className={`text-xs p-3 rounded border-l-4 ${
                            exec.status === 'EXECUTED' 
                              ? 'bg-green-50 border-green-400' 
                              : 'bg-red-50 border-red-400'
                          }`}>
                            <div className="flex justify-between items-start mb-2">
                              <div className="flex flex-col">
                                <span className="font-medium">
                                  👤 {exec.user?.name || exec.user?.email || `User ${exec.userId.toString().slice(-8)}`}
                                </span>
                                {exec.user?.email && exec.user?.name && (
                                  <span className="text-gray-500 text-xs">{exec.user.email}</span>
                                )}
                              </div>
                              <Badge variant={exec.status === 'EXECUTED' ? 'default' : 'destructive'} className="text-xs">
                                {exec.status}
                              </Badge>
                            </div>
                            <div className="text-gray-600 mb-1">
                              📊 Qty: {exec.quantity} | 💰 Price: ₹{exec.executedPrice || 'Pending'}
                            </div>
                            {exec.createdAt && (
                              <div className="text-gray-500 text-xs mb-1">
                                🕒 {new Date(exec.createdAt).toLocaleString()}
                              </div>
                            )}
                            {exec.error && (
                              <div className="text-red-700 bg-red-100 p-2 rounded mt-2 border border-red-200">
                                <div className="font-medium text-red-800 flex items-center gap-1">
                                  <AlertTriangle className="h-3 w-3" />
                                  Error Details:
                                </div>
                                <div className="mt-1 text-red-700">{exec.error}</div>
                              </div>
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