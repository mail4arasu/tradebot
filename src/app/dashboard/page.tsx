'use client'

import { useSession } from 'next-auth/react'
import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { IndianRupee, TrendingUp, Bot, Activity, Settings, AlertCircle, RefreshCw, Clock, PieChart, Wallet, Target, BarChart3, TrendingDown } from 'lucide-react'
import Link from 'next/link'

export default function Dashboard() {
  const { data: session, status } = useSession()
  const [userName, setUserName] = useState('')
  const [zerodhaConnected, setZerodhaConnected] = useState(false)
  const [balance, setBalance] = useState(0)
  const [activeBots] = useState(0)
  const [totalPnL, setTotalPnL] = useState(0)
  const [pnlPercentage, setPnlPercentage] = useState(0)
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
        
        // Check if last sync was more than 24 hours ago
        if (data.zerodhaConfig?.isConnected && lastSyncDate) {
          const hoursAgo = (Date.now() - lastSyncDate.getTime()) / (1000 * 60 * 60)
          setNeedsDailyLogin(hoursAgo > 24)
        } else {
          setNeedsDailyLogin(data.zerodhaConfig?.isConnected || false)
        }
        
        // If connected, fetch trading data for P&L
        if (data.zerodhaConfig?.isConnected) {
          await fetchTradingData()
        }
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

  const fetchTradingData = async () => {
    try {
      // Fetch comprehensive dashboard data
      const response = await fetch('/api/zerodha/dashboard-data')
      if (response.ok) {
        const data = await response.json()
        
        // Monthly P&L from trades
        setTotalPnL(data.monthlyPnL || 0)
        setPnlPercentage(data.pnlPercentage || 0)
        
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
      }
    } catch (error) {
      console.error('Error fetching trading data:', error)
      // Reset all values to 0 if unable to fetch
      setTotalPnL(0)
      setPnlPercentage(0)
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
    }
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
          <Link href="/auth/signin">
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
        <p style={{ color: 'var(--muted-foreground)' }}>Here&apos;s your trading overview</p>
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
              Zerodha requires daily authentication for security. Your token {lastSync ? 
                `was last refreshed ${Math.round((Date.now() - lastSync.getTime()) / (1000 * 60 * 60))} hours ago` : 
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
              )}
              <IndianRupee className="h-4 w-4" style={{ color: 'var(--muted-foreground)' }} />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" style={{ color: 'var(--foreground)' }}>₹{balance.toLocaleString()}</div>
            <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
              {zerodhaConnected ? (syncing ? 'Syncing...' : 'Cash available for trading') : 'Connect Zerodha to see balance'}
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
            <CardTitle className="text-sm font-medium" style={{ color: 'var(--muted-foreground)' }}>Portfolio Value</CardTitle>
            <PieChart className="h-4 w-4" style={{ color: 'var(--muted-foreground)' }} />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" style={{ color: 'var(--foreground)' }}>₹{portfolioValue.toLocaleString()}</div>
            <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
              {zerodhaConnected 
                ? `${holdingsCount} holdings • ${positionsCount} positions`
                : 'Connect Zerodha to see portfolio'
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
            <CardTitle className="text-sm font-medium" style={{ color: 'var(--muted-foreground)' }}>Portfolio P&L</CardTitle>
            {portfolioPnL >= 0 ? <TrendingUp className="h-4 w-4" style={{ color: 'var(--muted-foreground)' }} /> : <TrendingDown className="h-4 w-4" style={{ color: 'var(--muted-foreground)' }} />}
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
            <CardTitle className="text-sm font-medium" style={{ color: 'var(--muted-foreground)' }}>Day P&L</CardTitle>
            {dayPnL >= 0 ? <TrendingUp className="h-4 w-4" style={{ color: 'var(--muted-foreground)' }} /> : <TrendingDown className="h-4 w-4" style={{ color: 'var(--muted-foreground)' }} />}
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

      {/* Margin & Trading Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
        <Card className="card hover:shadow-lg transition-all duration-300" 
              style={{ 
                backgroundColor: 'var(--card)',
                borderColor: 'var(--border)',
                color: 'var(--card-foreground)'
              }}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium" style={{ color: 'var(--muted-foreground)' }}>Available Margin</CardTitle>
            <Wallet className="h-4 w-4" style={{ color: 'var(--muted-foreground)' }} />
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
            <Target className="h-4 w-4" style={{ color: 'var(--muted-foreground)' }} />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" style={{ color: 'var(--foreground)' }}>₹{usedMargin.toLocaleString()}</div>
            <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
              {zerodhaConnected ? `${marginUtilization.toFixed(1)}% utilization` : 'Connect Zerodha to see usage'}
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
            <CardTitle className="text-sm font-medium" style={{ color: 'var(--muted-foreground)' }}>Monthly Trading P&L</CardTitle>
            <BarChart3 className="h-4 w-4" style={{ color: 'var(--muted-foreground)' }} />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${totalPnL >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
              {totalPnL >= 0 ? '+' : ''}₹{totalPnL.toLocaleString()}
            </div>
            <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
              {zerodhaConnected 
                ? (pnlPercentage !== 0 ? `${pnlPercentage >= 0 ? '+' : ''}${pnlPercentage.toFixed(1)}% this month` : 'No trades this month')
                : 'Connect Zerodha to see trading P&L'
              }
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
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
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

        <Card className="card hover:shadow-lg transition-all duration-300" 
              style={{ 
                backgroundColor: 'var(--card)',
                borderColor: 'var(--border)',
                color: 'var(--card-foreground)'
              }}>
          <CardHeader>
            <CardTitle style={{ color: 'var(--foreground)' }}>Backtest Strategies</CardTitle>
            <CardDescription style={{ color: 'var(--muted-foreground)' }}>
              Test trading strategies on historical data
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/backtest">
              <Button className="w-full transition-colors duration-200" 
                     variant="outline"
                     style={{
                       borderColor: 'var(--border)',
                       color: 'var(--foreground)',
                       backgroundColor: 'transparent'
                     }}>
                <TrendingUp className="h-4 w-4 mr-2" />
                Start Backtest
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}