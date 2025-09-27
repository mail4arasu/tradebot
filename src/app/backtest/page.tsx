'use client'

import { useSession } from 'next-auth/react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ArrowLeft, BarChart3, TrendingUp, Calendar, Target } from 'lucide-react'
import Link from 'next/link'

export default function Backtest() {
  const { data: session, status } = useSession()

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
            <h1 className="text-3xl font-bold text-gray-900">Strategy Backtesting</h1>
            <p className="text-gray-600">Test trading strategies on historical data</p>
          </div>
          <Button disabled>
            <BarChart3 className="h-4 w-4 mr-2" />
            Run Backtest
          </Button>
        </div>
      </div>

      {/* Coming Soon Notice */}
      <Card className="mb-8 border-purple-200 bg-purple-50">
        <CardHeader>
          <div className="flex items-center space-x-2">
            <BarChart3 className="h-5 w-5 text-purple-600" />
            <CardTitle className="text-purple-800">Strategy Backtesting - Coming Soon</CardTitle>
          </div>
          <CardDescription className="text-purple-700">
            Advanced backtesting capabilities are in development. Soon you&apos;ll be able to test strategies against historical market data!
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <h4 className="font-medium text-purple-800">Planned Features:</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-3">
                <h5 className="font-medium text-purple-700">Backtesting Engine:</h5>
                <ul className="text-sm text-purple-600 space-y-1 list-disc list-inside">
                  <li>Historical data from multiple timeframes</li>
                  <li>Commission and slippage modeling</li>
                  <li>Risk-adjusted performance metrics</li>
                  <li>Monte Carlo simulation</li>
                  <li>Walk-forward analysis</li>
                </ul>
              </div>
              <div className="space-y-3">
                <h5 className="font-medium text-purple-700">Strategy Builder:</h5>
                <ul className="text-sm text-purple-600 space-y-1 list-disc list-inside">
                  <li>Visual strategy designer</li>
                  <li>Custom indicator support</li>
                  <li>Multiple entry/exit conditions</li>
                  <li>Portfolio-level backtesting</li>
                  <li>Strategy optimization tools</li>
                </ul>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Strategy Templates */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
        <Card className="opacity-60">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Moving Average Crossover
            </CardTitle>
            <CardDescription>
              Classic trend-following strategy using MA crossovers
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span>Type:</span>
                <span className="text-gray-500">Trend Following</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Timeframe:</span>
                <span className="text-gray-500">1D, 4H, 1H</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Complexity:</span>
                <span className="text-gray-500">Beginner</span>
              </div>
              <Button className="w-full" disabled>
                <Target className="h-4 w-4 mr-2" />
                Test Strategy
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="opacity-60">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              RSI Mean Reversion
            </CardTitle>
            <CardDescription>
              Counter-trend strategy based on RSI oversold/overbought
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span>Type:</span>
                <span className="text-gray-500">Mean Reversion</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Timeframe:</span>
                <span className="text-gray-500">1H, 30M, 15M</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Complexity:</span>
                <span className="text-gray-500">Intermediate</span>
              </div>
              <Button className="w-full" disabled>
                <Target className="h-4 w-4 mr-2" />
                Test Strategy
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="opacity-60">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Breakout Strategy
            </CardTitle>
            <CardDescription>
              Momentum-based breakout from key support/resistance levels
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span>Type:</span>
                <span className="text-gray-500">Breakout</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Timeframe:</span>
                <span className="text-gray-500">4H, 1H, 30M</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Complexity:</span>
                <span className="text-gray-500">Advanced</span>
              </div>
              <Button className="w-full" disabled>
                <Target className="h-4 w-4 mr-2" />
                Test Strategy
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Backtesting Info */}
      <Card>
        <CardHeader>
          <CardTitle>What is Strategy Backtesting?</CardTitle>
          <CardDescription>
            Learn how backtesting can help you validate trading strategies before risking real money
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4 text-sm text-gray-600">
            <p>
              <strong>Backtesting</strong> is the process of testing a trading strategy using historical market data 
              to see how it would have performed in the past. This helps you understand the potential risks and 
              returns of a strategy before deploying it with real money.
            </p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
              <div>
                <h4 className="font-medium text-gray-900 mb-2">Key Benefits:</h4>
                <ul className="space-y-1 list-disc list-inside">
                  <li>Validate strategy effectiveness</li>
                  <li>Understand risk characteristics</li>
                  <li>Optimize parameters</li>
                  <li>Build confidence in your approach</li>
                </ul>
              </div>
              
              <div>
                <h4 className="font-medium text-gray-900 mb-2">Important Considerations:</h4>
                <ul className="space-y-1 list-disc list-inside">
                  <li>Past performance doesn&apos;t guarantee future results</li>
                  <li>Account for transaction costs and slippage</li>
                  <li>Test across different market conditions</li>
                  <li>Avoid overfitting to historical data</li>
                </ul>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}