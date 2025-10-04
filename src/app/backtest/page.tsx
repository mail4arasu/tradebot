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
  
  // Debug state to see what's in backtestResults
  useEffect(() => {
    console.log('🐛 DEBUG: backtestResults state updated:', backtestResults)
  }, [backtestResults])
  const [loadingResults, setLoadingResults] = useState(false)
  const [currentBacktestId, setCurrentBacktestId] = useState<string | null>(null)
  
  // Add localStorage tracking for running backtests
  const [trackedBacktests, setTrackedBacktests] = useState<string[]>([])
  
  // Modal state for detailed trade view
  const [showTradeModal, setShowTradeModal] = useState(false)
  const [selectedBacktestDetails, setSelectedBacktestDetails] = useState<any>(null)

  // Load tracked backtests from localStorage on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('trackingBacktests')
      if (stored) {
        try {
          const parsed = JSON.parse(stored)
          setTrackedBacktests(parsed)
          console.log('📱 Loaded tracked backtests from localStorage:', parsed)
        } catch (e) {
          console.warn('Failed to parse stored backtests:', e)
          localStorage.removeItem('trackingBacktests')
        }
      }
    }
  }, [])

  // Save tracked backtests to localStorage whenever it changes
  useEffect(() => {
    if (typeof window !== 'undefined' && trackedBacktests.length >= 0) {
      localStorage.setItem('trackingBacktests', JSON.stringify(trackedBacktests))
      console.log('💾 Saved tracked backtests to localStorage:', trackedBacktests)
    }
  }, [trackedBacktests])

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

  // NEW: Poll all tracked backtests for status/results
  useEffect(() => {
    if (trackedBacktests.length > 0) {
      console.log(`🔄 Polling ${trackedBacktests.length} tracked backtests...`)
      
      const interval = setInterval(() => {
        trackedBacktests.forEach(backtestId => {
          checkTrackedBacktestStatus(backtestId)
        })
      }, 5000) // Check every 5 seconds

      return () => clearInterval(interval)
    }
  }, [trackedBacktests])

  const checkTrackedBacktestStatus = async (backtestId: string) => {
    try {
      console.log(`🔍 Checking tracked backtest: ${backtestId}`)
      
      // Try to get status first
      const statusResponse = await fetch(`/api/backtest/${backtestId}?type=status`)
      if (statusResponse.ok) {
        const statusData = await statusResponse.json()
        if (statusData.success && statusData.status) {
          console.log(`📊 Status for ${backtestId}:`, statusData.status)
          
          // Update or add to results
          setBacktestResults(prev => {
            const existingIndex = prev.findIndex(bt => bt.id === backtestId)
            if (existingIndex >= 0) {
              return prev.map(bt => 
                bt.id === backtestId ? { ...bt, ...statusData.status } : bt
              )
            } else {
              return [{ id: backtestId, ...statusData.status }, ...prev]
            }
          })
          
          // If completed, try to get results and remove from tracking
          if (statusData.status.status === 'COMPLETED') {
            console.log(`✅ Backtest ${backtestId} completed - fetching results`)
            
            try {
              const resultResponse = await fetch(`/api/backtest/${backtestId}?type=result`)
              if (resultResponse.ok) {
                const resultData = await resultResponse.json()
                if (resultData.success && resultData.result) {
                  const result = resultData.result
                  setBacktestResults(prev => prev.map(bt => 
                    bt.id === backtestId ? { 
                      ...bt, 
                      status: 'COMPLETED',
                      result: result,
                      hasResults: true,
                      totalReturn: result.totalReturn || result.totalPnL || 0,
                      totalReturnPercent: result.totalReturnPercent || 0,
                      winRate: result.winRate || 0,
                      totalTrades: result.totalTrades || 0,
                      maxDrawdownPercent: result.maxDrawdownPercent || result.maxDrawdown || 0,
                      sharpeRatio: result.sharpeRatio || 0
                    } : bt
                  ))
                  console.log(`📈 Results loaded for ${backtestId}:`, result)
                }
              }
            } catch (resultError) {
              console.error(`Failed to fetch results for ${backtestId}:`, resultError)
            }
            
            // Remove from tracking
            setTrackedBacktests(prev => prev.filter(id => id !== backtestId))
            console.log(`🗑️ Removed ${backtestId} from tracking (completed)`)
          } else if (statusData.status.status === 'FAILED') {
            console.log(`❌ Backtest ${backtestId} failed - removing from tracking`)
            setTrackedBacktests(prev => prev.filter(id => id !== backtestId))
          }
        }
      } else if (statusResponse.status === 404) {
        // Backtest not found - might be completed and cleaned up
        console.log(`🚫 Backtest ${backtestId} not found - removing from tracking`)
        setTrackedBacktests(prev => prev.filter(id => id !== backtestId))
      }
    } catch (error) {
      console.error(`Error checking tracked backtest ${backtestId}:`, error)
    }
  }

  const testManualFetch = async (backtestId: string) => {
    try {
      console.log(`🔧 Testing manual fetch for: ${backtestId}`)
      
      const response = await fetch('/api/backtest/manual-result', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ backtestId })
      })
      
      const data = await response.json()
      console.log('🔍 Manual fetch result:', data)
      
      if (data.success && data.result) {
        alert(`🎉 Results Found!\n\nSource: ${data.source}\nTotal Return: ₹${data.result.totalReturn?.toLocaleString() || 'N/A'}\nWin Rate: ${data.result.winRate?.toFixed(1) || 'N/A'}%\nTotal Trades: ${data.result.totalTrades || 'N/A'}\n\nCheck console for full details.`)
        
        // Add to results display
        setBacktestResults(prev => {
          const existingIndex = prev.findIndex(bt => bt.id === backtestId)
          if (existingIndex >= 0) {
            return prev.map(bt => 
              bt.id === backtestId ? { 
                ...bt, 
                status: 'COMPLETED',
                result: data.result,
                hasResults: true,
                totalReturn: data.result.totalReturn || 0,
                totalReturnPercent: data.result.totalReturnPercent || 0,
                winRate: data.result.winRate || 0,
                totalTrades: data.result.totalTrades || 0,
                maxDrawdownPercent: data.result.maxDrawdownPercent || 0
              } : bt
            )
          } else {
            return [{
              id: backtestId,
              status: 'COMPLETED',
              result: data.result,
              hasResults: true,
              totalReturn: data.result.totalReturn || 0,
              totalReturnPercent: data.result.totalReturnPercent || 0,
              winRate: data.result.winRate || 0,
              totalTrades: data.result.totalTrades || 0,
              maxDrawdownPercent: data.result.maxDrawdownPercent || 0,
              progress: 100
            }, ...prev]
          }
        })
      } else {
        alert(`❌ No Results Found\n\nBacktest: ${backtestId}\nMessage: ${data.message || 'No results available'}\n\nCheck console for detailed attempts.`)
      }
      
    } catch (error) {
      console.error('Manual fetch error:', error)
      alert(`🚨 Fetch Error\n\nError: ${error}\n\nCheck console for details.`)
    }
  }

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
      console.log('📋 FETCH: Starting to fetch backtest results...')
      
      const response = await fetch('/api/backtest?action=list')
      if (response.ok) {
        const data = await response.json()
        console.log('📋 FETCH: List API response:', data)
        
        if (data.success && data.backtests) {
          console.log(`📋 FETCH: Got ${data.backtests.length} backtests from API`)
          
          // SMART MERGE: Don't overwrite existing results, merge them intelligently
          setBacktestResults(prev => {
            console.log('📋 FETCH: Current state before merge:', prev)
            console.log('📋 FETCH: New data to merge:', data.backtests)
            
            // Create a map of existing results for fast lookup
            const existingMap = new Map(prev.map(bt => [bt.id, bt]))
            
            // Merge new data with existing, preserving any results that exist
            const merged = data.backtests.map((newBt: any) => {
              const existing = existingMap.get(newBt.id)
              
              if (existing) {
                // If we have existing data, merge it smartly
                // Keep existing results if they exist and are complete
                if (existing.result && existing.status === 'COMPLETED' && !newBt.result) {
                  console.log(`📋 FETCH: Preserving existing results for ${newBt.id}`)
                  return existing
                }
                
                // Otherwise merge, giving priority to new data but preserving results
                return {
                  ...newBt,
                  result: newBt.result || existing.result,
                  hasResults: !!(newBt.result || existing.result),
                  totalReturn: newBt.totalReturn || existing.totalReturn,
                  totalReturnPercent: newBt.totalReturnPercent || existing.totalReturnPercent,
                  winRate: newBt.winRate || existing.winRate,
                  totalTrades: newBt.totalTrades || existing.totalTrades,
                  maxDrawdownPercent: newBt.maxDrawdownPercent || existing.maxDrawdownPercent
                }
              }
              
              // New backtest, mark if it has results
              return {
                ...newBt,
                hasResults: !!newBt.result
              }
            })
            
            // Add any existing backtests that weren't in the API response
            prev.forEach(existing => {
              if (!data.backtests.find((bt: any) => bt.id === existing.id)) {
                console.log(`📋 FETCH: Preserving missing backtest ${existing.id}`)
                merged.push(existing)
              }
            })
            
            // Sort by start time (newest first)
            merged.sort((a, b) => {
              const timeA = new Date(a.startTime || 0).getTime()
              const timeB = new Date(b.startTime || 0).getTime()
              return timeB - timeA
            })
            
            console.log(`📋 FETCH: Final merged results (${merged.length} total):`, merged)
            return merged
          })
        } else {
          console.log('📋 FETCH: No backtests in response or API failed')
        }
      } else {
        console.error('📋 FETCH: API response not ok:', response.status, response.statusText)
      }
    } catch (error) {
      console.error('📋 FETCH: Error fetching backtest results:', error)
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
                  // FORCE ADD RESULTS TO DISPLAY
                  setBacktestResults(prev => {
                    console.log('🐛 DEBUG: Forcing result display for:', backtestId)
                    
                    // Force add the result even if backtest doesn't exist in array
                    const newResult = {
                      id: backtestId,
                      status: 'COMPLETED',
                      result: result,
                      hasResults: true,
                      totalReturn: result.totalReturn || result.totalPnL || 0,
                      totalReturnPercent: result.totalReturnPercent || 0,
                      winRate: result.winRate || 0,
                      totalTrades: result.totalTrades || 0,
                      maxDrawdownPercent: result.maxDrawdownPercent || result.maxDrawdown || 0,
                      sharpeRatio: result.sharpeRatio || 0,
                      startTime: new Date().toISOString()
                    }
                    
                    // Remove any existing entry for this ID and add new one
                    const filtered = prev.filter(bt => bt.id !== backtestId)
                    const updated = [newResult, ...filtered]
                    console.log('🐛 DEBUG: Updated results array:', updated)
                    return updated
                  })
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
          
          // Show detailed modal with trade breakdown
          setSelectedBacktestDetails({
            id: backtestId,
            result: result,
            summary: {
              totalReturn: result.totalReturn || result.totalPnL || 0,
              totalReturnPercent: result.totalReturnPercent || 
                ((result.totalReturn / (result.parameters?.initialCapital || 100000)) * 100).toFixed(2),
              winRate: result.winRate || 0,
              totalTrades: result.totalTrades || 0,
              winningTrades: result.winningTrades || 0,
              losingTrades: result.losingTrades || 0,
              maxDrawdownPercent: result.maxDrawdownPercent || result.maxDrawdown || 0,
              sharpeRatio: result.sharpeRatio || 0,
              finalCapital: result.finalCapital || 0,
              initialCapital: result.parameters?.initialCapital || 100000,
              startDate: result.parameters?.startDate,
              endDate: result.parameters?.endDate
            },
            trades: result.trades || []
          })
          setShowTradeModal(true)
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
      
      // NEW: Add to tracked backtests for persistent monitoring
      setTrackedBacktests(prev => {
        if (!prev.includes(data.backtestId)) {
          console.log(`📱 Adding ${data.backtestId} to tracked backtests`)
          return [...prev, data.backtestId]
        }
        return prev
      })
      
      alert(`Backtest started successfully!\n\nBacktest ID: ${data.backtestId}\n\nYou can monitor the progress in the results section below.\n\nNote: This backtest will be tracked automatically until completion.`)
      
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
            {trackedBacktests.length > 0 && (
              <div className="mt-2 text-sm text-blue-600">
                📱 Tracking {trackedBacktests.length} backtest{trackedBacktests.length > 1 ? 's' : ''}: {trackedBacktests.join(', ')}
              </div>
            )}
            <div className="mt-2 flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  // Force inject the completed backtests we can see in console
                  const knownCompletedBacktests = [
                    'bt_1759591874635_u9236q362',
                    'bt_1759574778009_3721hpGgw'
                  ]
                  
                  console.log('🔧 INJECT: Force injecting known completed backtests...')
                  const injectedResults = []
                  
                  for (const backtestId of knownCompletedBacktests) {
                    try {
                      const response = await fetch('/api/backtest/manual-result', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ backtestId })
                      })
                      const data = await response.json()
                      
                      if (data.success && data.result) {
                        injectedResults.push({
                          id: backtestId,
                          status: 'COMPLETED',
                          result: data.result,
                          hasResults: true,
                          totalReturn: data.result.totalReturn || 0,
                          totalReturnPercent: data.result.totalReturnPercent || 0,
                          winRate: data.result.winRate || 0,
                          totalTrades: data.result.totalTrades || 0,
                          maxDrawdownPercent: data.result.maxDrawdownPercent || 0,
                          startTime: new Date().toISOString(),
                          source: 'INJECTED'
                        })
                        console.log(`🔧 INJECT: Injected results for ${backtestId}`)
                      }
                    } catch (error) {
                      console.error(`🔧 INJECT: Failed to inject ${backtestId}:`, error)
                    }
                  }
                  
                  if (injectedResults.length > 0) {
                    setBacktestResults(prev => [...injectedResults, ...prev.filter(bt => !injectedResults.find(inj => inj.id === bt.id))])
                    alert(`🎉 Injected ${injectedResults.length} completed backtests!\n\nThese should now be visible in the results section.`)
                  } else {
                    alert('❌ No results could be injected. Check console for errors.')
                  }
                }}
                className="text-xs"
              >
                🔧 Inject Known Completed Results
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  console.log('🔄 MANUAL: Force refreshing all backtest results...')
                  
                  // First try normal refresh
                  await fetchBacktestResults()
                  
                  // If still no results, try to recover from tracked backtests
                  if (backtestResults.length === 0 && trackedBacktests.length > 0) {
                    console.log('🔄 RECOVERY: No results from API, trying to recover tracked backtests...')
                    
                    const recoveredResults = []
                    for (const backtestId of trackedBacktests) {
                      try {
                        const response = await fetch('/api/backtest/manual-result', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ backtestId })
                        })
                        const data = await response.json()
                        
                        if (data.success && data.result) {
                          recoveredResults.push({
                            id: backtestId,
                            status: 'COMPLETED',
                            result: data.result,
                            hasResults: true,
                            totalReturn: data.result.totalReturn || 0,
                            totalReturnPercent: data.result.totalReturnPercent || 0,
                            winRate: data.result.winRate || 0,
                            totalTrades: data.result.totalTrades || 0,
                            maxDrawdownPercent: data.result.maxDrawdownPercent || 0,
                            startTime: new Date().toISOString(),
                            source: 'RECOVERED'
                          })
                          console.log(`🔄 RECOVERY: Recovered results for ${backtestId}`)
                        }
                      } catch (error) {
                        console.error(`🔄 RECOVERY: Failed to recover ${backtestId}:`, error)
                      }
                    }
                    
                    if (recoveredResults.length > 0) {
                      setBacktestResults(prev => [...recoveredResults, ...prev])
                      alert(`🎉 Recovered ${recoveredResults.length} completed backtests!\n\nThese were tracked but not showing in the list.`)
                    }
                  }
                }}
                className="text-xs"
              >
                🔄 Force Refresh + Recovery
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  console.log('🔍 DEBUG: Current state:', backtestResults)
                  console.log('🔍 DEBUG: Tracked backtests:', trackedBacktests)
                  
                  // Test the debug list endpoint
                  try {
                    const response = await fetch('/api/backtest/debug-list')
                    const data = await response.json()
                    console.log('🔍 DEBUG LIST RESULTS:', data)
                    
                    let message = `Debug Info:\n\nCurrent UI Results: ${backtestResults.length}\nTracked Backtests: ${trackedBacktests.length}\n\n`
                    
                    if (data.success) {
                      message += `API Tests:\n`
                      data.debug.attempts.forEach((attempt: any, i: number) => {
                        message += `${i + 1}. ${attempt.endpoint}: ${attempt.success ? 'SUCCESS' : 'FAILED'}\n`
                        if (attempt.success && attempt.data.backtests) {
                          message += `   Found ${attempt.data.backtests.length} backtests\n`
                        }
                      })
                    }
                    
                    alert(message + '\nCheck console for full details.')
                  } catch (error) {
                    console.error('Debug failed:', error)
                    alert(`Debug Failed: ${error}\n\nCurrent Results: ${backtestResults.length}\nTracked: ${trackedBacktests.length}`)
                  }
                }}
                className="text-xs"
              >
                🔍 Debug APIs
              </Button>
            </div>
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
                <div className="mt-4 text-xs text-blue-600">
                  <p>If you ran backtests but don't see them:</p>
                  <p>1. Try the "Force Refresh Results" button above</p>
                  <p>2. Check console logs for debugging info</p>
                  <p>3. Use "Debug State" to see current state</p>
                </div>
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

                          {result.status === 'COMPLETED' && (result.totalReturn !== undefined || result.result || result.hasResults) && (
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
                              {(result.totalReturn !== undefined || result.result || result.hasResults) ? 'View Details' : 'Load Results'}
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

      {/* Detailed Trade Modal */}
      {showTradeModal && selectedBacktestDetails && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 m-4 max-w-6xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold">Detailed Backtest Results</h2>
              <button
                onClick={() => setShowTradeModal(false)}
                className="text-gray-500 hover:text-gray-700 text-xl font-bold"
              >
                ×
              </button>
            </div>

            {/* Summary Section */}
            <div className="mb-6">
              <h3 className="text-lg font-semibold mb-4">Summary</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                <div className="bg-gray-50 p-3 rounded">
                  <div className="text-sm text-gray-600">Backtest ID</div>
                  <div className="font-medium">{selectedBacktestDetails.id}</div>
                </div>
                <div className="bg-gray-50 p-3 rounded">
                  <div className="text-sm text-gray-600">Period</div>
                  <div className="font-medium">
                    {selectedBacktestDetails.summary.startDate} to {selectedBacktestDetails.summary.endDate}
                  </div>
                </div>
                <div className="bg-gray-50 p-3 rounded">
                  <div className="text-sm text-gray-600">Initial Capital</div>
                  <div className="font-medium">₹{selectedBacktestDetails.summary.initialCapital.toLocaleString()}</div>
                </div>
                <div className="bg-gray-50 p-3 rounded">
                  <div className="text-sm text-gray-600">Final Capital</div>
                  <div className="font-medium">₹{selectedBacktestDetails.summary.finalCapital.toLocaleString()}</div>
                </div>
              </div>
              
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <div className="bg-green-50 p-3 rounded">
                  <div className="text-sm text-gray-600">Total Return</div>
                  <div className={`font-bold ${selectedBacktestDetails.summary.totalReturn >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    ₹{selectedBacktestDetails.summary.totalReturn.toLocaleString()}
                  </div>
                  <div className="text-sm text-gray-500">
                    {selectedBacktestDetails.summary.totalReturnPercent}%
                  </div>
                </div>
                <div className="bg-blue-50 p-3 rounded">
                  <div className="text-sm text-gray-600">Total Trades</div>
                  <div className="font-bold text-blue-600">{selectedBacktestDetails.summary.totalTrades}</div>
                </div>
                <div className="bg-green-50 p-3 rounded">
                  <div className="text-sm text-gray-600">Win Rate</div>
                  <div className="font-bold text-green-600">{selectedBacktestDetails.summary.winRate.toFixed(1)}%</div>
                  <div className="text-sm text-gray-500">
                    {selectedBacktestDetails.summary.winningTrades}W / {selectedBacktestDetails.summary.losingTrades}L
                  </div>
                </div>
                <div className="bg-red-50 p-3 rounded">
                  <div className="text-sm text-gray-600">Max Drawdown</div>
                  <div className="font-bold text-red-600">{selectedBacktestDetails.summary.maxDrawdownPercent.toFixed(1)}%</div>
                </div>
                <div className="bg-purple-50 p-3 rounded">
                  <div className="text-sm text-gray-600">Sharpe Ratio</div>
                  <div className="font-bold text-purple-600">{selectedBacktestDetails.summary.sharpeRatio.toFixed(2)}</div>
                </div>
              </div>
            </div>

            {/* Trade Details Section */}
            <div>
              <h3 className="text-lg font-semibold mb-4">Trade Details ({selectedBacktestDetails.trades.length} trades)</h3>
              
              {selectedBacktestDetails.trades.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <p>No individual trade data available</p>
                  <p className="text-sm">Only summary results are shown above</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-100">
                        <th className="px-3 py-2 text-left">#</th>
                        <th className="px-3 py-2 text-left">Date/Time</th>
                        <th className="px-3 py-2 text-left">Direction</th>
                        <th className="px-3 py-2 text-right">Entry Price</th>
                        <th className="px-3 py-2 text-right">Exit Price</th>
                        <th className="px-3 py-2 text-right">Quantity</th>
                        <th className="px-3 py-2 text-right">P&L</th>
                        <th className="px-3 py-2 text-right">Capital</th>
                        <th className="px-3 py-2 text-center">Result</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedBacktestDetails.trades.map((trade: any, index: number) => (
                        <tr key={index} className={index % 2 === 0 ? 'bg-gray-50' : 'bg-white'}>
                          <td className="px-3 py-2">{index + 1}</td>
                          <td className="px-3 py-2">
                            {trade.date ? new Date(trade.date).toLocaleString() : 'N/A'}
                          </td>
                          <td className="px-3 py-2">
                            <span className={`px-2 py-1 rounded text-xs font-medium ${
                              trade.action === 'BUY' || trade.action === 'LONG' 
                                ? 'bg-green-100 text-green-800' 
                                : 'bg-red-100 text-red-800'
                            }`}>
                              {trade.action || trade.direction || 'N/A'}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right">₹{(trade.price || trade.entryPrice || 0).toFixed(2)}</td>
                          <td className="px-3 py-2 text-right">₹{(trade.exitPrice || trade.price || 0).toFixed(2)}</td>
                          <td className="px-3 py-2 text-right">{trade.quantity || 25}</td>
                          <td className={`px-3 py-2 text-right font-medium ${
                            (trade.pnl || 0) >= 0 ? 'text-green-600' : 'text-red-600'
                          }`}>
                            {(trade.pnl || 0) >= 0 ? '+' : ''}₹{(trade.pnl || 0).toFixed(2)}
                          </td>
                          <td className="px-3 py-2 text-right">₹{(trade.capital || 0).toLocaleString()}</td>
                          <td className="px-3 py-2 text-center">
                            {(trade.pnl || 0) >= 0 ? (
                              <span className="text-green-600 font-bold">✓</span>
                            ) : (
                              <span className="text-red-600 font-bold">✗</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Close Button */}
            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setShowTradeModal(false)}
                className="px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}