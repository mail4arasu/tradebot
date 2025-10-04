'use client'

import { useSession } from 'next-auth/react'
import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, BarChart3, TrendingUp, Calendar, Target, Bot, PlayCircle, Loader2 } from 'lucide-react'
import Link from 'next/link'

interface Bot {
  _id: string
  name: string
  description: string
  strategy: string
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH'
  symbol: string
  exchange: string
  instrumentType: string
  isActive: boolean
  emergencyStop: boolean
  minInvestment: number
  maxInvestment: number
  expectedReturn: number
}

interface BacktestConfig {
  botId: string
  startDate: string
  endDate: string
  initialCapital: number
}

export default function Backtest() {
  const { data: session, status } = useSession()
  const [bots, setBots] = useState<Bot[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedBot, setSelectedBot] = useState<Bot | null>(null)
  const [backtestConfig, setBacktestConfig] = useState<BacktestConfig>({
    botId: '',
    startDate: '',
    endDate: '',
    initialCapital: 100000
  })
  const [backtesting, setBacktesting] = useState(false)
  const [backtestResults, setBacktestResults] = useState<any[]>([])
  const [loadingResults, setLoadingResults] = useState(false)
  const [currentBacktestId, setCurrentBacktestId] = useState<string | null>(null)

  useEffect(() => {
    if (session) {
      fetchBots()
      fetchBacktestResults()
    }
  }, [session])

  // Poll for backtest progress if there's a current backtest
  useEffect(() => {
    if (currentBacktestId) {
      const interval = setInterval(() => {
        checkBacktestStatus(currentBacktestId)
      }, 5000) // Check every 5 seconds

      return () => clearInterval(interval)
    }
  }, [currentBacktestId])

  const fetchBots = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/bots/available')
      if (response.ok) {
        const data = await response.json()
        setBots(data.bots || [])
      }
    } catch (error) {
      console.error('Error fetching bots:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchBacktestResults = async () => {
    try {
      setLoadingResults(true)
      const response = await fetch('/api/backtest?action=list')
      if (response.ok) {
        const data = await response.json()
        setBacktestResults(data.backtests || [])
      }
    } catch (error) {
      console.error('Error fetching backtest results:', error)
    } finally {
      setLoadingResults(false)
    }
  }

  const checkBacktestStatus = async (backtestId: string) => {
    try {
      console.log(`Checking backtest status for: ${backtestId}`)
      const response = await fetch(`/api/backtest/${backtestId}?type=status`)
      if (response.ok) {
        const data = await response.json()
        console.log('Backtest status response:', data)
        if (data.success && data.status) {
          // Update or add backtest to results list
          setBacktestResults(prev => {
            const existingIndex = prev.findIndex(bt => bt.id === backtestId)
            if (existingIndex >= 0) {
              // Update existing
              return prev.map(bt => 
                bt.id === backtestId ? { ...bt, ...data.status } : bt
              )
            } else {
              // Add new backtest to the list if not found
              return [{ id: backtestId, ...data.status }, ...prev]
            }
          })
          
          // If completed, stop polling and fetch final results
          if (data.status.status === 'COMPLETED') {
            console.log(`Backtest ${backtestId} COMPLETED - fetching final results`)
            setCurrentBacktestId(null)
            
            // Try to fetch final results immediately
            try {
              const resultResponse = await fetch(`/api/backtest/${backtestId}?type=result`)
              if (resultResponse.ok) {
                const resultData = await resultResponse.json()
                if (resultData.success && resultData.result) {
                  console.log('Final backtest results:', resultData.result)
                  const result = resultData.result
                  setBacktestResults(prev => prev.map(bt => 
                    bt.id === backtestId ? { 
                      ...bt, 
                      status: 'COMPLETED',
                      result: result,
                      hasResults: true,
                      // Map result fields to expected UI fields
                      totalReturn: result.totalReturn || result.totalPnL || 0,
                      totalReturnPercent: result.totalReturnPercent || 0,
                      winRate: result.winRate || 0,
                      totalTrades: result.totalTrades || 0,
                      maxDrawdownPercent: result.maxDrawdownPercent || result.maxDrawdown || 0,
                      sharpeRatio: result.sharpeRatio || 0
                    } : bt
                  ))
                } else {
                  console.error('Failed to get backtest results:', resultData.error)
                }
              }
            } catch (resultError) {
              console.error('Error fetching final results:', resultError)
            }
            
            // Also refresh the full list as fallback
            fetchBacktestResults()
          } else if (data.status.status === 'FAILED') {
            console.log(`Backtest ${backtestId} FAILED`)
            setCurrentBacktestId(null)
            fetchBacktestResults()
          }
        }
      } else {
        console.error('Failed to fetch backtest status:', response.status, response.statusText)
      }
    } catch (error) {
      console.error('Error checking backtest status:', error)
    }
  }

  const viewBacktestResult = async (backtestId: string) => {
    try {
      console.log(`Fetching detailed results for: ${backtestId}`)
      const response = await fetch(`/api/backtest/${backtestId}?type=result`)
      if (response.ok) {
        const data = await response.json()
        console.log('Backtest detailed result:', data)
        if (data.success && data.result) {
          // Update UI state with results
          const result = data.result
          setBacktestResults(prev => prev.map(bt => 
            bt.id === backtestId ? { 
              ...bt, 
              result: result,
              hasResults: true,
              // Map result fields to expected UI fields
              totalReturn: result.totalReturn || result.totalPnL || 0,
              totalReturnPercent: result.totalReturnPercent || 0,
              winRate: result.winRate || 0,
              totalTrades: result.totalTrades || 0,
              maxDrawdownPercent: result.maxDrawdownPercent || result.maxDrawdown || 0,
              sharpeRatio: result.sharpeRatio || 0
            } : bt
          ))
          
          // Also display detailed results in alert
          const returnPercent = result.totalReturnPercent || 
            ((result.totalReturn / (result.parameters?.initialCapital || 100000)) * 100).toFixed(2)
          
          alert(`🎯 Backtest Results (${backtestId})\n\n` +
            `💰 Total Return: ₹${(result.totalReturn || 0).toLocaleString()}\n` +
            `📈 Return %: ${returnPercent}%\n` +
            `🎯 Win Rate: ${(result.winRate || 0).toFixed(1)}%\n` +
            `📊 Total Trades: ${result.totalTrades || 0}\n` +
            `✅ Winning: ${result.winningTrades || 0}\n` +
            `❌ Losing: ${result.losingTrades || 0}\n` +
            `📉 Max Drawdown: ${(result.maxDrawdownPercent || 0).toFixed(1)}%\n` +
            `💼 Final Capital: ₹${(result.finalCapital || 0).toLocaleString()}\n\n` +
            `Period: ${result.parameters?.startDate || 'N/A'} to ${result.parameters?.endDate || 'N/A'}`)
        } else {
          alert(`Failed to load backtest results: ${data.error || 'Unknown error'}`)
        }
      } else {
        alert(`Failed to fetch results: ${response.status} ${response.statusText}`)
      }
    } catch (error) {
      console.error('Error fetching backtest result:', error)
      alert(`Error loading results: ${error}`)
    }
  }

  const handleBotSelect = (bot: Bot) => {
    setSelectedBot(bot)
    setBacktestConfig(prev => ({
      ...prev,
      botId: bot._id,
      initialCapital: bot.minInvestment
    }))
  }

  const handleRunBacktest = async () => {
    if (!selectedBot || !backtestConfig.startDate || !backtestConfig.endDate) {
      alert('Please select a bot and complete all required fields')
      return
    }

    setBacktesting(true)
    try {
      console.log('Starting backtest with config:', backtestConfig)
      
      // Check backtest engine health (with fallback to local)
      const healthResponse = await fetch('/api/backtest?action=health')
      if (!healthResponse.ok) {
        throw new Error(`Health check failed: ${healthResponse.status} ${healthResponse.statusText}`)
      }
      
      const healthData = await healthResponse.json()
      
      if (!healthData.success) {
        throw new Error('Backtest engine is not available')
      }
      
      console.log('Backtest engine status:', healthData.backtestEngine)
      if (healthData.usingLocalEngine) {
        console.log('Using local backtest engine')
      }
      
      // Start the backtest
      const response = await fetch('/api/backtest', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'start',
          botId: selectedBot.name || 'nifty50-futures-bot',
          startDate: backtestConfig.startDate,
          endDate: backtestConfig.endDate,
          initialCapital: backtestConfig.initialCapital,
          lotSize: 25, // Nifty lot size
          useStratFilter: true,
          useGaussianFilter: true,
          useFibEntry: true,
          maxBulletsPerDay: 1,
          useStratStops: true,
          timezone: 'Asia/Kolkata'
        })
      })

      const data = await response.json()
      
      if (!data.success) {
        throw new Error(data.error || 'Failed to start backtest')
      }
      
      console.log('Backtest started:', data)
      
      // Add to results list and start monitoring
      const newBacktest = {
        id: data.backtestId,
        status: 'RUNNING',
        progress: 0,
        startTime: new Date().toISOString(),
        ...data.parameters
      }
      
      setBacktestResults(prev => [newBacktest, ...prev])
      setCurrentBacktestId(data.backtestId)
      
      alert(`Backtest started successfully!\n\nBacktest ID: ${data.backtestId}\n\nYou can monitor the progress in the results section below.\n\nNote: This may take several minutes depending on the date range.`)
      
    } catch (error: any) {
      console.error('Backtest error:', error)
      alert(`Backtest failed: ${error.message}`)
    } finally {
      setBacktesting(false)
    }
  }

  const getRiskColor = (level: string) => {
    switch (level) {
      case 'LOW': return 'bg-green-100 text-green-800'
      case 'MEDIUM': return 'bg-yellow-100 text-yellow-800'
      case 'HIGH': return 'bg-red-100 text-red-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  if (status === 'loading') {
    return <div className="flex justify-center items-center min-h-screen">Loading...</div>
  }

  if (!session) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Please sign in to access backtesting</h1>
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
            <h1 className="text-3xl font-bold text-gray-900">Backtest Trading Bots</h1>
            <p className="text-gray-600">Test bot performance on historical data</p>
          </div>
          <Button 
            onClick={handleRunBacktest}
            disabled={!selectedBot || backtesting}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {backtesting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Running...
              </>
            ) : (
              <>
                <PlayCircle className="h-4 w-4 mr-2" />
                Run Backtest
              </>
            )}
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center items-center py-12">
          <Loader2 className="h-8 w-8 animate-spin mr-2" />
          <span>Loading available bots...</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Bot Selection */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Bot className="h-5 w-5" />
                  Select Trading Bot
                </CardTitle>
                <CardDescription>
                  Choose a bot to backtest from your available options
                </CardDescription>
              </CardHeader>
              <CardContent>
                {bots.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <Bot className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No trading bots available</p>
                    <p className="text-sm">Please contact admin to set up bots</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-4">
                    {bots.map((bot) => (
                      <Card
                        key={bot._id}
                        className={`cursor-pointer transition-all hover:shadow-md ${
                          selectedBot?._id === bot._id
                            ? 'ring-2 ring-blue-500 border-blue-200'
                            : 'hover:border-gray-300'
                        }`}
                        onClick={() => handleBotSelect(bot)}
                      >
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-3 mb-2">
                                <h3 className="font-semibold text-lg">{bot.name}</h3>
                                <Badge className={getRiskColor(bot.riskLevel)}>
                                  {bot.riskLevel}
                                </Badge>
                                {bot.isActive ? (
                                  <Badge className="bg-green-100 text-green-800">Active</Badge>
                                ) : (
                                  <Badge variant="secondary">Inactive</Badge>
                                )}
                              </div>
                              <p className="text-gray-600 text-sm mb-3">{bot.description}</p>
                              <div className="grid grid-cols-2 gap-4 text-sm">
                                <div>
                                  <span className="text-gray-500">Strategy:</span>
                                  <span className="ml-2 font-medium">{bot.strategy}</span>
                                </div>
                                <div>
                                  <span className="text-gray-500">Symbol:</span>
                                  <span className="ml-2 font-medium">{bot.symbol}</span>
                                </div>
                                <div>
                                  <span className="text-gray-500">Min Investment:</span>
                                  <span className="ml-2 font-medium">₹{bot.minInvestment.toLocaleString()}</span>
                                </div>
                                <div>
                                  <span className="text-gray-500">Expected Return:</span>
                                  <span className="ml-2 font-medium">{bot.expectedReturn}%</span>
                                </div>
                              </div>
                            </div>
                            {selectedBot?._id === bot._id && (
                              <div className="ml-4">
                                <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center">
                                  <div className="w-2 h-2 bg-white rounded-full"></div>
                                </div>
                              </div>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Backtest Configuration */}
          <div>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="h-5 w-5" />
                  Backtest Settings
                </CardTitle>
                <CardDescription>
                  Configure your backtest parameters
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="startDate">Start Date</Label>
                  <Input
                    id="startDate"
                    type="date"
                    value={backtestConfig.startDate}
                    onChange={(e) => setBacktestConfig(prev => ({
                      ...prev,
                      startDate: e.target.value
                    }))}
                    max={new Date().toISOString().split('T')[0]}
                  />
                </div>
                
                <div>
                  <Label htmlFor="endDate">End Date</Label>
                  <Input
                    id="endDate"
                    type="date"
                    value={backtestConfig.endDate}
                    onChange={(e) => setBacktestConfig(prev => ({
                      ...prev,
                      endDate: e.target.value
                    }))}
                    min={backtestConfig.startDate}
                    max={new Date().toISOString().split('T')[0]}
                  />
                </div>
                
                <div>
                  <Label htmlFor="initialCapital">Initial Capital (₹)</Label>
                  <Input
                    id="initialCapital"
                    type="number"
                    value={backtestConfig.initialCapital}
                    onChange={(e) => setBacktestConfig(prev => ({
                      ...prev,
                      initialCapital: parseInt(e.target.value) || 0
                    }))}
                    min={selectedBot?.minInvestment || 10000}
                    max={selectedBot?.maxInvestment || 5000000}
                  />
                  {selectedBot && (
                    <p className="text-xs text-gray-500 mt-1">
                      Range: ₹{selectedBot.minInvestment.toLocaleString()} - ₹{selectedBot.maxInvestment.toLocaleString()}
                    </p>
                  )}
                </div>

                {selectedBot && (
                  <div className="p-3 bg-blue-50 rounded-lg">
                    <h4 className="font-medium text-blue-900 mb-2">Selected Bot:</h4>
                    <p className="text-sm text-blue-800">{selectedBot.name}</p>
                    <p className="text-sm text-blue-700">{selectedBot.strategy}</p>
                  </div>
                )}

                <div className="pt-4">
                  <Button
                    onClick={handleRunBacktest}
                    disabled={!selectedBot || !backtestConfig.startDate || !backtestConfig.endDate || backtesting}
                    className="w-full bg-blue-600 hover:bg-blue-700"
                  >
                    {backtesting ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Running Backtest...
                      </>
                    ) : (
                      <>
                        <PlayCircle className="h-4 w-4 mr-2" />
                        Run Backtest
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Backtest Results Section */}
      <div className="mt-8">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Backtest Results
            </CardTitle>
            <CardDescription>
              Monitor progress and view completed backtest results
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loadingResults ? (
              <div className="flex justify-center items-center py-8">
                <Loader2 className="h-8 w-8 animate-spin mr-2" />
                <span>Loading results...</span>
              </div>
            ) : backtestResults.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <BarChart3 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No backtest results yet</p>
                <p className="text-sm">Run a backtest to see results here</p>
              </div>
            ) : (
              <div className="space-y-4">
                {backtestResults.map((result) => (
                  <Card
                    key={result.id}
                    className="border-l-4 border-l-blue-500"
                  >
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <h3 className="font-semibold">
                              {result.id}
                            </h3>
                            <Badge
                              className={
                                result.status === 'COMPLETED'
                                  ? 'bg-green-100 text-green-800'
                                  : result.status === 'RUNNING'
                                  ? 'bg-blue-100 text-blue-800'
                                  : result.status === 'FAILED'
                                  ? 'bg-red-100 text-red-800'
                                  : 'bg-gray-100 text-gray-800'
                              }
                            >
                              {result.status}
                            </Badge>
                            {result.status === 'RUNNING' && (
                              <div className="flex items-center gap-2">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                <span className="text-sm text-gray-600">
                                  {result.progress || 0}%
                                </span>
                              </div>
                            )}
                          </div>
                          
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                            <div>
                              <span className="text-gray-500">Bot:</span>
                              <span className="ml-2 font-medium">
                                {result.botId || 'Nifty50 Futures'}
                              </span>
                            </div>
                            <div>
                              <span className="text-gray-500">Capital:</span>
                              <span className="ml-2 font-medium">
                                ₹{(result.initialCapital || 100000).toLocaleString()}
                              </span>
                            </div>
                            <div>
                              <span className="text-gray-500">Period:</span>
                              <span className="ml-2 font-medium">
                                {result.startDate ? new Date(result.startDate).toLocaleDateString() : 'N/A'} - 
                                {result.endDate ? new Date(result.endDate).toLocaleDateString() : 'N/A'}
                              </span>
                            </div>
                            <div>
                              <span className="text-gray-500">Started:</span>
                              <span className="ml-2 font-medium">
                                {result.startTime ? new Date(result.startTime).toLocaleString() : 'N/A'}
                              </span>
                            </div>
                          </div>

                          {result.status === 'COMPLETED' && result.totalReturn !== undefined && (
                            <div className="mt-3 p-3 bg-gray-50 rounded-lg">
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                                <div>
                                  <span className="text-gray-500">Total Return:</span>
                                  <span className={`ml-2 font-bold ${
                                    (result.totalReturn || 0) >= 0 ? 'text-green-600' : 'text-red-600'
                                  }`}>
                                    ₹{(result.totalReturn || 0).toLocaleString()}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-gray-500">Win Rate:</span>
                                  <span className="ml-2 font-medium">
                                    {(result.winRate || 0).toFixed(1)}%
                                  </span>
                                </div>
                                <div>
                                  <span className="text-gray-500">Total Trades:</span>
                                  <span className="ml-2 font-medium">
                                    {result.totalTrades || 0}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-gray-500">Max Drawdown:</span>
                                  <span className="ml-2 font-medium text-red-600">
                                    {(result.maxDrawdownPercent || 0).toFixed(1)}%
                                  </span>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                        
                        <div className="ml-4 flex flex-col gap-2">
                          {result.status === 'COMPLETED' && (
                            <Button
                              size="sm"
                              onClick={() => viewBacktestResult(result.id)}
                              className="bg-green-600 hover:bg-green-700"
                            >
                              <TrendingUp className="h-4 w-4 mr-1" />
                              {result.totalReturn !== undefined ? 'View Details' : 'Load Results'}
                            </Button>
                          )}
                          {result.status === 'RUNNING' && currentBacktestId === result.id && (
                            <Badge variant="secondary" className="text-xs">
                              Monitoring...
                            </Badge>
                          )}
                        </div>
                      </div>
                      
                      {result.status === 'RUNNING' && (
                        <div className="mt-3">
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div
                              className="bg-blue-600 h-2 rounded-full transition-all duration-500"
                              style={{ width: `${result.progress || 0}%` }}
                            />
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}