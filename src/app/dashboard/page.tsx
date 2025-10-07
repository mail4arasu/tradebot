'use client'

import { useSession } from 'next-auth/react'
import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { IndianRupee, TrendingUp, Bot, Activity, Settings, AlertCircle, RefreshCw, Clock, PieChart, Wallet, Target, BarChart3, TrendingDown, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react'
import Link from 'next/link'

export default function Dashboard() {
  const { data: session, status } = useSession()
  const [userName, setUserName] = useState('')
  const [zerodhaConnected, setZerodhaConnected] = useState(false)
  const [balance, setBalance] = useState(0)
  const [activeBots, setActiveBots] = useState(0)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [lastSync, setLastSync] = useState<Date | null>(null)
  const [needsDailyLogin, setNeedsDailyLogin] = useState(false)
  const [refreshingToken, setRefreshingToken] = useState(false)
  
  // Enhanced portfolio data
  const [portfolioValue, setPortfolioValue] = useState(0)
  const [totalInvestmentValue, setTotalInvestmentValue] = useState(0)
  const [portfolioPnL, setPortfolioPnL] = useState(0)
  const [portfolioPnLPercentage, setPortfolioPnLPercentage] = useState(0)
  const [dayPnL, setDayPnL] = useState(0)
  const [availableMargin, setAvailableMargin] = useState(0)
  const [usedMargin, setUsedMargin] = useState(0)
  const [totalMargin, setTotalMargin] = useState(0)
  const [marginUtilization, setMarginUtilization] = useState(0)
  const [holdingsCount, setHoldingsCount] = useState(0)
  const [positionsCount, setPositionsCount] = useState(0)
  
  // Auto-refresh states
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(false)
  const [isMarketHours, setIsMarketHours] = useState(false)
  const [nextRefreshTime, setNextRefreshTime] = useState<Date | null>(null)
  const [refreshingPortfolio, setRefreshingPortfolio] = useState(false)
  
  // Portfolio dropdown state
  const [showPortfolioDropdown, setShowPortfolioDropdown] = useState(false)
  const [holdingsData, setHoldingsData] = useState<any[]>([])
  const [positionsData, setPositionsData] = useState<any[]>([])
  const [loadingPortfolioDetails, setLoadingPortfolioDetails] = useState(false)

  // Check if current time is within market hours (9:00 AM - 3:30 PM IST)
  const checkMarketHours = useCallback(() => {
    const now = new Date()
    // Convert to IST (UTC+5:30)
    const istTime = new Date(now.getTime() + (5.5 * 60 * 60 * 1000))
    const hours = istTime.getHours()
    const minutes = istTime.getMinutes()
    
    // Market hours: 9:00 AM to 3:30 PM IST (weekdays only)
    const dayOfWeek = istTime.getDay() // 0 = Sunday, 6 = Saturday
    const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5
    const currentTimeInMinutes = hours * 60 + minutes
    const marketOpenTime = 9 * 60 // 9:00 AM
    const marketCloseTime = 15 * 60 + 30 // 3:30 PM
    
    const isInMarketHours = isWeekday && currentTimeInMinutes >= marketOpenTime && currentTimeInMinutes <= marketCloseTime
    setIsMarketHours(isInMarketHours)
    return isInMarketHours
  }, [])

  const fetchActiveBots = async () => {
    try {
      const response = await fetch('/api/bots/allocations')
      if (response.ok) {
        const data = await response.json()
        const activeBotsCount = data.allocations?.filter((allocation: any) => allocation.isActive).length || 0
        setActiveBots(activeBotsCount)
      }
    } catch (error) {
      console.error('Error fetching active bots:', error)
    }
  }

  const fetchPortfolioDetails = async () => {
    if (!zerodhaConnected || needsDailyLogin) return
    
    try {
      setLoadingPortfolioDetails(true)
      const [holdingsResponse, positionsResponse] = await Promise.all([
        fetch('/api/zerodha/holdings'),
        fetch('/api/zerodha/positions')
      ])
      
      if (holdingsResponse.ok) {
        const holdingsResult = await holdingsResponse.json()
        setHoldingsData(holdingsResult.data || [])
      }
      
      if (positionsResponse.ok) {
        const positionsResult = await positionsResponse.json()
        const allPositions = [
          ...(positionsResult.data?.net || []),
          ...(positionsResult.data?.day || [])
        ]
        setPositionsData(allPositions)
      }
    } catch (error) {
      console.error('Error fetching portfolio details:', error)
    } finally {
      setLoadingPortfolioDetails(false)
    }
  }

  const togglePortfolioDropdown = async () => {
    if (!showPortfolioDropdown && (holdingsData.length === 0 || positionsData.length === 0)) {
      await fetchPortfolioDetails()
    }
    setShowPortfolioDropdown(!showPortfolioDropdown)
  }

  const fetchUserData = useCallback(async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/user/profile')
      if (response.ok) {
        const data = await response.json()
        setUserName(data.name || 'User')
        setZerodhaConnected(data.zerodhaConfig?.isConnected || false)
        setBalance(data.zerodhaConfig?.balance || 0)
        
        // Check last sync time to determine if daily login is needed
        const lastSyncDate = data.zerodhaConfig?.lastSync ? new Date(data.zerodhaConfig.lastSync) : null
        setLastSync(lastSyncDate)
        
        // Check if token needs refresh based on 08:00 AM IST reset
        if (data.zerodhaConfig?.isConnected && lastSyncDate) {
          const now = new Date()
          const istNow = new Date(now.getTime() + (5.5 * 60 * 60 * 1000))
          
          // Create 08:00 AM IST today
          const today8AM = new Date(istNow)
          today8AM.setHours(8, 0, 0, 0)
          
          // If it's past 08:00 AM today and last sync was before today's 08:00 AM, need refresh
          const needsRefresh = istNow > today8AM && lastSyncDate < today8AM
          setNeedsDailyLogin(needsRefresh)
        } else {
          setNeedsDailyLogin(data.zerodhaConfig?.isConnected || false)
        }
        
        // If connected, fetch trading data for P&L
        if (data.zerodhaConfig?.isConnected) {
          await fetchTradingData()
        }
        
        // Fetch active bots count
        await fetchActiveBots()
      }
    } catch (error) {
      console.error('Error fetching user data:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (session) {
      // Fetch user data and Zerodha connection status
      fetchUserData()
    }
  }, [session, fetchUserData])

  // Market hours monitoring and auto-refresh setup
  useEffect(() => {
    // Check market hours immediately
    const inMarketHours = checkMarketHours()
    setAutoRefreshEnabled(inMarketHours)

    // Set up interval to check market hours every minute
    const marketHoursInterval = setInterval(() => {
      const inMarketHours = checkMarketHours()
      setAutoRefreshEnabled(inMarketHours)
    }, 60000) // Check every minute

    return () => clearInterval(marketHoursInterval)
  }, [checkMarketHours])

  // Auto-refresh portfolio data every 30 seconds during market hours
  useEffect(() => {
    let refreshInterval: NodeJS.Timeout | null = null

    if (autoRefreshEnabled && zerodhaConnected && !needsDailyLogin) {
      refreshInterval = setInterval(() => {
        fetchTradingData(false) // Silent refresh without loader
      }, 30000) // 30 seconds
    }

    return () => {
      if (refreshInterval) {
        clearInterval(refreshInterval)
      }
    }
  }, [autoRefreshEnabled, zerodhaConnected, needsDailyLogin])

  const fetchTradingData = async (showLoader = false) => {
    try {
      if (showLoader) setRefreshingPortfolio(true)
      
      // Fetch comprehensive dashboard data including fresh balance
      const response = await fetch('/api/zerodha/dashboard-data')
      if (response.ok) {
        const data = await response.json()
        
        // Available Balance (now auto-refreshed)
        setBalance(data.balance || 0)
        
        
        // Portfolio data
        setPortfolioValue(data.portfolioValue || 0)
        setTotalInvestmentValue(data.totalInvestmentValue || 0)
        setPortfolioPnL(data.totalPnL || 0)
        setPortfolioPnLPercentage(data.totalPnLPercentage || 0)
        setDayPnL(data.dayPnL || 0)
        
        // Margin data
        setAvailableMargin(data.availableMargin || 0)
        setUsedMargin(data.usedMargin || 0)
        setTotalMargin(data.totalMargin || 0)
        setMarginUtilization(data.marginUtilization || 0)
        
        // Holdings and positions count
        setHoldingsCount(data.holdingsCount || 0)
        setPositionsCount(data.positionsCount || 0)
        
        // Update last refresh time
        setNextRefreshTime(new Date(Date.now() + 30000)) // Next refresh in 30 seconds
      }
    } catch (error) {
      console.error('Error fetching trading data:', error)
      // Reset all values to 0 if unable to fetch
      setBalance(0)
      setPortfolioValue(0)
      setTotalInvestmentValue(0)
      setPortfolioPnL(0)
      setPortfolioPnLPercentage(0)
      setDayPnL(0)
      setAvailableMargin(0)
      setUsedMargin(0)
      setTotalMargin(0)
      setMarginUtilization(0)
      setHoldingsCount(0)
      setPositionsCount(0)
    } finally {
      if (showLoader) setRefreshingPortfolio(false)
    }
  }

  const refreshPortfolioData = async () => {
    await fetchTradingData(true)
  }

  const syncBalance = async () => {
    try {
      setSyncing(true)
      const response = await fetch('/api/zerodha/sync-balance', {
        method: 'POST',
      })
      
      if (response.ok) {
        const data = await response.json()
        setBalance(data.balance || 0)
        // Refresh user data to get updated information
        await fetchUserData()
      } else {
        const errorData = await response.json()
        console.error('Balance sync failed:', errorData.error)
        alert('Failed to sync balance: ' + errorData.error)
      }
    } catch (error) {
      console.error('Error syncing balance:', error)
      alert('Error syncing balance. Please try again.')
    } finally {
      setSyncing(false)
    }
  }

  const handleQuickTokenRefresh = async () => {
    try {
      setRefreshingToken(true)
      const response = await fetch('/api/zerodha/quick-refresh', {
        method: 'POST'
      })
      
      const result = await response.json()
      
      if (response.ok) {
        // Redirect to Zerodha for fresh token
        window.location.href = result.loginUrl
      } else {
        if (result.needsCredentials) {
          alert('Please configure your Zerodha credentials in Settings first.')
        } else {
          alert(result.error || 'Failed to refresh token')
        }
        setRefreshingToken(false)
      }
    } catch (error) {
      console.error('Error refreshing token:', error)
      alert('Error refreshing token')
      setRefreshingToken(false)
    }
  }

  if (status === 'loading') {
    return <div className="flex justify-center items-center min-h-screen">Loading...</div>
  }

  if (!session) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Please sign in to access the dashboard</h1>
          <Link href="/signin">
            <Button>Sign In</Button>
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2" style={{ color: 'var(--foreground)' }}>
          Welcome back, {userName || session.user?.name}!
        </h1>
        <div className="flex items-center justify-between">
          <p style={{ color: 'var(--muted-foreground)' }}>Here&apos;s your trading overview</p>
          <div className="flex items-center space-x-4">
            {/* API Connection Status */}
            <div className="flex items-center space-x-2 text-xs" style={{ color: 'var(--muted-foreground)' }}>
              <div className={`w-2 h-2 rounded-full ${zerodhaConnected && !needsDailyLogin ? 'bg-green-500' : 'bg-red-500'}`}></div>
              <span>
                {zerodhaConnected && !needsDailyLogin ? 'API Connected' : 'API Disconnected'}
              </span>
            </div>
            
            {/* Market Hours & Auto-refresh Status */}
            {zerodhaConnected && (
              <div className="flex items-center space-x-2 text-xs" style={{ color: 'var(--muted-foreground)' }}>
                <div className={`w-2 h-2 rounded-full ${isMarketHours ? 'bg-green-500' : 'bg-gray-400'} ${autoRefreshEnabled ? 'animate-pulse' : ''}`}></div>
                <span>
                  {isMarketHours 
                    ? 'Market Open'
                    : 'Market Closed'
                  }
                  {autoRefreshEnabled && ' • Auto-refresh active'}
                </span>
                {autoRefreshEnabled && refreshingPortfolio && (
                  <RefreshCw className="h-3 w-3 animate-spin" />
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Zerodha Connection Status */}
      {!zerodhaConnected && (
        <Card className="mb-8 border-yellow-200 dark:border-yellow-800" 
              style={{ 
                backgroundColor: 'var(--card)',
                borderColor: 'var(--border)'
              }}>
          <CardHeader>
            <div className="flex items-center space-x-2">
              <AlertCircle className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
              <CardTitle className="text-yellow-800 dark:text-yellow-300">Connect Your Zerodha Account</CardTitle>
            </div>
            <CardDescription className="text-yellow-700 dark:text-yellow-400">
              You need to connect your Zerodha account to start automated trading.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/settings">
              <Button className="bg-yellow-600 hover:bg-yellow-700 dark:bg-yellow-700 dark:hover:bg-yellow-600 text-white transition-colors duration-200">
                <Settings className="h-4 w-4 mr-2" />
                Connect Zerodha
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}

      {/* Daily Token Refresh Notification */}
      {zerodhaConnected && needsDailyLogin && (
        <Card className="mb-8 border-orange-200 dark:border-orange-800" 
              style={{ 
                backgroundColor: 'var(--card)',
                borderColor: 'var(--border)'
              }}>
          <CardHeader>
            <div className="flex items-center space-x-2">
              <Clock className="h-5 w-5 text-orange-600 dark:text-orange-400" />
              <CardTitle className="text-orange-800 dark:text-orange-300">Daily Token Refresh Required</CardTitle>
            </div>
            <CardDescription className="text-orange-700 dark:text-orange-400">
              Zerodha resets access tokens daily at 08:00 AM IST. Your token {lastSync ? 
                `was last refreshed on ${lastSync.toLocaleDateString()} at ${lastSync.toLocaleTimeString()}` : 
                'needs to be refreshed'} to continue automated trading.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex space-x-4">
              <Button 
                onClick={handleQuickTokenRefresh}
                disabled={refreshingToken}
                className="bg-orange-600 hover:bg-orange-700 dark:bg-orange-700 dark:hover:bg-orange-600 text-white transition-colors duration-200"
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${refreshingToken ? 'animate-spin' : ''}`} />
                {refreshingToken ? 'Redirecting...' : 'Quick Token Refresh'}
              </Button>
              <Link href="/settings">
                <Button variant="outline" className="border-orange-600 text-orange-600 hover:bg-orange-50">
                  <Settings className="h-4 w-4 mr-2" />
                  Manage Settings
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Portfolio Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <Card className="card hover:shadow-lg transition-all duration-300" 
              style={{ 
                backgroundColor: 'var(--card)',
                borderColor: 'var(--border)',
                color: 'var(--card-foreground)'
              }}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium" style={{ color: 'var(--muted-foreground)' }}>Available Balance</CardTitle>
            <div className="flex items-center space-x-2">
              {zerodhaConnected && (
                autoRefreshEnabled ? (
                  // Show auto-refresh indicator when auto-refresh is active
                  <div
                    className="p-1 rounded"
                    style={{ color: 'var(--muted-foreground)' }}
                    title="Auto-refreshing every 30 seconds"
                  >
                    <RefreshCw className={`h-3 w-3 ${refreshingPortfolio ? 'animate-spin' : ''}`} />
                  </div>
                ) : (
                  // Show manual refresh button when auto-refresh is disabled
                  <button
                    onClick={syncBalance}
                    disabled={syncing}
                    className="p-1 rounded hover:bg-muted transition-colors duration-200"
                    style={{ 
                      color: 'var(--muted-foreground)',
                      backgroundColor: syncing ? 'var(--muted)' : 'transparent'
                    }}
                    title="Sync balance from Zerodha"
                  >
                    <RefreshCw className={`h-3 w-3 ${syncing ? 'animate-spin' : ''}`} />
                  </button>
                )
              )}
              <IndianRupee className="h-4 w-4" style={{ color: 'var(--muted-foreground)' }} />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" style={{ color: 'var(--foreground)' }}>₹{balance.toLocaleString()}</div>
            <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
              {zerodhaConnected ? (
                syncing ? 'Syncing...' : 
                autoRefreshEnabled ? 'Auto-refreshing • Cash available for trading' : 
                'Cash available for trading'
              ) : 'Connect Zerodha to see balance'}
            </p>
          </CardContent>
        </Card>

        <Card className="card hover:shadow-lg transition-all duration-300 relative" 
              style={{ 
                backgroundColor: 'var(--card)',
                borderColor: 'var(--border)',
                color: 'var(--card-foreground)'
              }}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium" style={{ color: 'var(--muted-foreground)' }}>Portfolio Value</CardTitle>
            <div className="flex items-center space-x-2">
              {zerodhaConnected && (
                <button
                  onClick={refreshPortfolioData}
                  disabled={refreshingPortfolio}
                  className="p-1 rounded hover:bg-muted transition-colors duration-200"
                  style={{ 
                    color: 'var(--muted-foreground)',
                    backgroundColor: refreshingPortfolio ? 'var(--muted)' : 'transparent'
                  }}
                  title="Refresh portfolio data"
                >
                  <RefreshCw className={`h-3 w-3 ${refreshingPortfolio ? 'animate-spin' : ''}`} />
                </button>
              )}
              <PieChart className="h-4 w-4" style={{ color: 'var(--muted-foreground)' }} />
            </div>
          </CardHeader>
          <CardContent>
            <div 
              className="cursor-pointer hover:opacity-75 transition-opacity"
              onClick={zerodhaConnected && !needsDailyLogin ? togglePortfolioDropdown : undefined}
              title={zerodhaConnected && !needsDailyLogin ? "Click to view holdings and positions" : undefined}
            >
              <div className="text-2xl font-bold" style={{ color: 'var(--foreground)' }}>₹{portfolioValue.toLocaleString()}</div>
              <div className="flex items-center justify-between">
                <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                  {zerodhaConnected 
                    ? `${holdingsCount} holdings • ${positionsCount} positions`
                    : 'Connect Zerodha to see portfolio'
                  }
                </p>
                {zerodhaConnected && !needsDailyLogin && (holdingsCount > 0 || positionsCount > 0) && (
                  <div className="flex items-center text-xs" style={{ color: 'var(--muted-foreground)' }}>
                    <span className="mr-1">click to expand</span>
                    {showPortfolioDropdown ? (
                      <ChevronUp className="h-3 w-3" />
                    ) : (
                      <ChevronDown className="h-3 w-3" />
                    )}
                  </div>
                )}
              </div>
            </div>
            
            {/* Portfolio Dropdown */}
            {showPortfolioDropdown && (
              <div className="absolute top-full left-0 right-0 z-10 mt-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg max-h-96 overflow-y-auto">
                {loadingPortfolioDetails ? (
                  <div className="p-4 text-center">
                    <RefreshCw className="h-4 w-4 animate-spin mx-auto mb-2" />
                    <p className="text-sm text-gray-600">Loading portfolio details...</p>
                  </div>
                ) : (
                  <div className="p-4">
                    <div className="flex justify-between items-center mb-3">
                      <h4 className="font-semibold text-sm">Portfolio Details</h4>
                      <button 
                        onClick={() => setShowPortfolioDropdown(false)}
                        className="text-gray-400 hover:text-gray-600 p-1"
                      >
                        ×
                      </button>
                    </div>
                    
                    {/* Holdings */}
                    {holdingsData.length > 0 && (
                      <div className="mb-4">
                        <div className="flex items-center justify-between mb-2">
                          <h5 className="font-medium text-xs text-gray-700 dark:text-gray-300">Holdings ({holdingsData.length})</h5>
                          <Link href="/trades?tab=holdings" className="text-xs text-blue-600 hover:text-blue-800 flex items-center">
                            <span>View All</span>
                            <ExternalLink className="h-3 w-3 ml-1" />
                          </Link>
                        </div>
                        <div className="space-y-1 max-h-32 overflow-y-auto">
                          {holdingsData.slice(0, 5).map((holding: any, index: number) => (
                            <div key={index} className="flex justify-between items-center text-xs p-2 bg-gray-50 dark:bg-gray-700 rounded hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors">
                              <span className="font-medium">{holding.tradingsymbol || holding.instrument_token}</span>
                              <div className="text-right">
                                <div className="font-medium">₹{(holding.last_price || 0).toLocaleString()}</div>
                                <div className={`text-xs ${(holding.pnl || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                  {(holding.pnl || 0) >= 0 ? '+' : ''}₹{(holding.pnl || 0).toFixed(2)}
                                </div>
                              </div>
                            </div>
                          ))}
                          {holdingsData.length > 5 && (
                            <div className="text-xs text-gray-500 text-center py-1">
                              +{holdingsData.length - 5} more holdings
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                    
                    {/* Positions */}
                    {positionsData.length > 0 && (
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <h5 className="font-medium text-xs text-gray-700 dark:text-gray-300">Positions ({positionsData.length})</h5>
                          <Link href="/trades?tab=positions" className="text-xs text-blue-600 hover:text-blue-800 flex items-center">
                            <span>View All</span>
                            <ExternalLink className="h-3 w-3 ml-1" />
                          </Link>
                        </div>
                        <div className="space-y-1 max-h-32 overflow-y-auto">
                          {positionsData.slice(0, 5).map((position: any, index: number) => (
                            <div key={index} className="flex justify-between items-center text-xs p-2 bg-gray-50 dark:bg-gray-700 rounded hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors">
                              <span className="font-medium">{position.tradingsymbol || position.instrument_token}</span>
                              <div className="text-right">
                                <div className="font-medium">Qty: {Math.abs(position.quantity || position.net_quantity || 0)}</div>
                                <div className={`text-xs ${(position.pnl || position.m2m || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                  {(position.pnl || position.m2m || 0) >= 0 ? '+' : ''}₹{(position.pnl || position.m2m || 0).toFixed(2)}
                                </div>
                              </div>
                            </div>
                          ))}
                          {positionsData.length > 5 && (
                            <div className="text-xs text-gray-500 text-center py-1">
                              +{positionsData.length - 5} more positions
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                    
                    {holdingsData.length === 0 && positionsData.length === 0 && (
                      <p className="text-xs text-gray-500 text-center py-4">No holdings or positions found</p>
                    )}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="card hover:shadow-lg transition-all duration-300" 
              style={{ 
                backgroundColor: 'var(--card)',
                borderColor: 'var(--border)',
                color: 'var(--card-foreground)'
              }}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium" style={{ color: 'var(--muted-foreground)' }}>Portfolio P&L</CardTitle>
            <div className="flex items-center space-x-2">
              {zerodhaConnected && (
                <button
                  onClick={refreshPortfolioData}
                  disabled={refreshingPortfolio}
                  className="p-1 rounded hover:bg-muted transition-colors duration-200"
                  style={{ 
                    color: 'var(--muted-foreground)',
                    backgroundColor: refreshingPortfolio ? 'var(--muted)' : 'transparent'
                  }}
                  title="Refresh portfolio data"
                >
                  <RefreshCw className={`h-3 w-3 ${refreshingPortfolio ? 'animate-spin' : ''}`} />
                </button>
              )}
              {portfolioPnL >= 0 ? <TrendingUp className="h-4 w-4" style={{ color: 'var(--muted-foreground)' }} /> : <TrendingDown className="h-4 w-4" style={{ color: 'var(--muted-foreground)' }} />}
            </div>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${portfolioPnL >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
              {portfolioPnL >= 0 ? '+' : ''}₹{portfolioPnL.toLocaleString()}
            </div>
            <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
              {zerodhaConnected 
                ? `${portfolioPnLPercentage >= 0 ? '+' : ''}${portfolioPnLPercentage.toFixed(2)}% overall returns`
                : 'Connect Zerodha to see P&L'
              }
            </p>
          </CardContent>
        </Card>

        <Card className="card hover:shadow-lg transition-all duration-300" 
              style={{ 
                backgroundColor: 'var(--card)',
                borderColor: 'var(--border)',
                color: 'var(--card-foreground)'
              }}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium" style={{ color: 'var(--muted-foreground)' }}>P&L</CardTitle>
            <div className="flex items-center space-x-2">
              {zerodhaConnected && (
                <button
                  onClick={refreshPortfolioData}
                  disabled={refreshingPortfolio}
                  className="p-1 rounded hover:bg-muted transition-colors duration-200"
                  style={{ 
                    color: 'var(--muted-foreground)',
                    backgroundColor: refreshingPortfolio ? 'var(--muted)' : 'transparent'
                  }}
                  title="Refresh portfolio data"
                >
                  <RefreshCw className={`h-3 w-3 ${refreshingPortfolio ? 'animate-spin' : ''}`} />
                </button>
              )}
              {dayPnL >= 0 ? <TrendingUp className="h-4 w-4" style={{ color: 'var(--muted-foreground)' }} /> : <TrendingDown className="h-4 w-4" style={{ color: 'var(--muted-foreground)' }} />}
            </div>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${dayPnL >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
              {dayPnL >= 0 ? '+' : ''}₹{dayPnL.toLocaleString()}
            </div>
            <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
              {zerodhaConnected ? 'Today\'s performance' : 'Connect Zerodha to see day P&L'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Margin Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <Card className="card hover:shadow-lg transition-all duration-300" 
              style={{ 
                backgroundColor: 'var(--card)',
                borderColor: 'var(--border)',
                color: 'var(--card-foreground)'
              }}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium" style={{ color: 'var(--muted-foreground)' }}>Available Margin</CardTitle>
            <div className="flex items-center space-x-2">
              {zerodhaConnected && (
                <button
                  onClick={refreshPortfolioData}
                  disabled={refreshingPortfolio}
                  className="p-1 rounded hover:bg-muted transition-colors duration-200"
                  style={{ 
                    color: 'var(--muted-foreground)',
                    backgroundColor: refreshingPortfolio ? 'var(--muted)' : 'transparent'
                  }}
                  title="Refresh margin data"
                >
                  <RefreshCw className={`h-3 w-3 ${refreshingPortfolio ? 'animate-spin' : ''}`} />
                </button>
              )}
              <Wallet className="h-4 w-4" style={{ color: 'var(--muted-foreground)' }} />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" style={{ color: 'var(--foreground)' }}>₹{availableMargin.toLocaleString()}</div>
            <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
              {zerodhaConnected ? 'Free margin for trading' : 'Connect Zerodha to see margin'}
            </p>
          </CardContent>
        </Card>

        <Card className="card hover:shadow-lg transition-all duration-300" 
              style={{ 
                backgroundColor: 'var(--card)',
                borderColor: 'var(--border)',
                color: 'var(--card-foreground)'
              }}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium" style={{ color: 'var(--muted-foreground)' }}>Used Margin</CardTitle>
            <div className="flex items-center space-x-2">
              {zerodhaConnected && (
                <button
                  onClick={refreshPortfolioData}
                  disabled={refreshingPortfolio}
                  className="p-1 rounded hover:bg-muted transition-colors duration-200"
                  style={{ 
                    color: 'var(--muted-foreground)',
                    backgroundColor: refreshingPortfolio ? 'var(--muted)' : 'transparent'
                  }}
                  title="Refresh margin data"
                >
                  <RefreshCw className={`h-3 w-3 ${refreshingPortfolio ? 'animate-spin' : ''}`} />
                </button>
              )}
              <Target className="h-4 w-4" style={{ color: 'var(--muted-foreground)' }} />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" style={{ color: 'var(--foreground)' }}>₹{usedMargin.toLocaleString()}</div>
            <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
              {zerodhaConnected ? `${marginUtilization.toFixed(1)}% utilization` : 'Connect Zerodha to see usage'}
            </p>
          </CardContent>
        </Card>

      </div>

      {/* System Status & Bots */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <Card className="card hover:shadow-lg transition-all duration-300" 
              style={{ 
                backgroundColor: 'var(--card)',
                borderColor: 'var(--border)',
                color: 'var(--card-foreground)'
              }}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium" style={{ color: 'var(--muted-foreground)' }}>Active Trading Bots</CardTitle>
            <Bot className="h-4 w-4" style={{ color: 'var(--muted-foreground)' }} />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" style={{ color: 'var(--foreground)' }}>{activeBots}</div>
            <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
              {activeBots === 0 ? 'No bots running' : `${activeBots} bots trading`}
            </p>
          </CardContent>
        </Card>

        <Card className="card hover:shadow-lg transition-all duration-300" 
              style={{ 
                backgroundColor: 'var(--card)',
                borderColor: 'var(--border)',
                color: 'var(--card-foreground)'
              }}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium" style={{ color: 'var(--muted-foreground)' }}>System Status</CardTitle>
            <Activity className="h-4 w-4" style={{ color: 'var(--muted-foreground)' }} />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600 dark:text-green-400">Active</div>
            <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
              All systems operational
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="card hover:shadow-lg transition-all duration-300" 
              style={{ 
                backgroundColor: 'var(--card)',
                borderColor: 'var(--border)',
                color: 'var(--card-foreground)'
              }}>
          <CardHeader>
            <CardTitle style={{ color: 'var(--foreground)' }}>Trading Bots</CardTitle>
            <CardDescription style={{ color: 'var(--muted-foreground)' }}>
              Manage your automated trading strategies
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/bots">
              <Button className="w-full bg-primary hover:bg-primary/90 text-primary-foreground transition-colors duration-200"
                     style={{
                       backgroundColor: 'var(--primary)',
                       color: 'var(--primary-foreground)'
                     }}>
                <Bot className="h-4 w-4 mr-2" />
                View Bots
              </Button>
            </Link>
          </CardContent>
        </Card>

        <Card className="card hover:shadow-lg transition-all duration-300" 
              style={{ 
                backgroundColor: 'var(--card)',
                borderColor: 'var(--border)',
                color: 'var(--card-foreground)'
              }}>
          <CardHeader>
            <CardTitle style={{ color: 'var(--foreground)' }}>Trade History</CardTitle>
            <CardDescription style={{ color: 'var(--muted-foreground)' }}>
              Review your past trades and performance
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/trades">
              <Button className="w-full transition-colors duration-200" 
                     variant="outline"
                     style={{
                       borderColor: 'var(--border)',
                       color: 'var(--foreground)',
                       backgroundColor: 'transparent'
                     }}>
                View Trades
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}