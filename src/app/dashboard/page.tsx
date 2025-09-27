'use client'

import { useSession } from 'next-auth/react'
import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { IndianRupee, TrendingUp, Bot, Activity, Settings, AlertCircle } from 'lucide-react'
import Link from 'next/link'

export default function Dashboard() {
  const { data: session, status } = useSession()
  const [zerodhaConnected, setZerodhaConnected] = useState(false)
  const [balance, setBalance] = useState(0)
  const [activeBots] = useState(0)
  const [totalPnL, setTotalPnL] = useState(0)
  const [pnlPercentage, setPnlPercentage] = useState(0)
  const [loading, setLoading] = useState(true)

  const fetchUserData = useCallback(async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/user/profile')
      if (response.ok) {
        const data = await response.json()
        setZerodhaConnected(data.zerodhaConfig?.isConnected || false)
        setBalance(data.zerodhaConfig?.balance || 0)
        
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
      // Fetch trades from this month to calculate P&L
      const response = await fetch('/api/zerodha/dashboard-data')
      if (response.ok) {
        const data = await response.json()
        setTotalPnL(data.monthlyPnL || 0)
        setPnlPercentage(data.pnlPercentage || 0)
      }
    } catch (error) {
      console.error('Error fetching trading data:', error)
      // Set to 0 if unable to fetch
      setTotalPnL(0)
      setPnlPercentage(0)
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
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Welcome back, {session.user?.name}!
        </h1>
        <p className="text-gray-600">Here&apos;s your trading overview</p>
      </div>

      {/* Zerodha Connection Status */}
      {!zerodhaConnected && (
        <Card className="mb-8 border-yellow-200 bg-yellow-50">
          <CardHeader>
            <div className="flex items-center space-x-2">
              <AlertCircle className="h-5 w-5 text-yellow-600" />
              <CardTitle className="text-yellow-800">Connect Your Zerodha Account</CardTitle>
            </div>
            <CardDescription className="text-yellow-700">
              You need to connect your Zerodha account to start automated trading.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/settings">
              <Button className="bg-yellow-600 hover:bg-yellow-700">
                <Settings className="h-4 w-4 mr-2" />
                Connect Zerodha
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Available Balance</CardTitle>
            <IndianRupee className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">₹{balance.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              {zerodhaConnected ? 'Last updated now' : 'Connect Zerodha to see balance'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total P&L</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${totalPnL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              ₹{totalPnL.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground">
              {zerodhaConnected 
                ? (pnlPercentage !== 0 ? `${pnlPercentage >= 0 ? '+' : ''}${pnlPercentage.toFixed(1)}% this month` : 'No trades this month')
                : 'Connect Zerodha to see P&L'
              }
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Bots</CardTitle>
            <Bot className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeBots}</div>
            <p className="text-xs text-muted-foreground">
              {activeBots === 0 ? 'No bots running' : `${activeBots} bots trading`}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">System Status</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">Active</div>
            <p className="text-xs text-muted-foreground">
              All systems operational
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Trading Bots</CardTitle>
            <CardDescription>
              Manage your automated trading strategies
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/bots">
              <Button className="w-full">
                <Bot className="h-4 w-4 mr-2" />
                View Bots
              </Button>
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Trade History</CardTitle>
            <CardDescription>
              Review your past trades and performance
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/trades">
              <Button className="w-full" variant="outline">
                View Trades
              </Button>
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Backtest Strategies</CardTitle>
            <CardDescription>
              Test trading strategies on historical data
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/backtest">
              <Button className="w-full" variant="outline">
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