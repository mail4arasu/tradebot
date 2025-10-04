'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, Play, RefreshCw, Database, TrendingUp, BarChart3, Calendar, Activity } from 'lucide-react'
import Link from 'next/link'

interface PrecomputedBacktest {
  backtestId: string
  strategy: string
  symbol: string
  period: string
  totalTrades: number
  totalPnL: number
  totalPnLPercent: number
  winRate: number
  maxDrawdown: number
  computedAt: string
}

export default function PrecomputeBacktestsAdmin() {
  const [precomputedBacktests, setPrecomputedBacktests] = useState<PrecomputedBacktest[]>([])
  const [loading, setLoading] = useState(false)
  const [computing, setComputing] = useState(false)
  const [computeResults, setComputeResults] = useState<any>(null)

  useEffect(() => {
    fetchPrecomputedBacktests()
  }, [])

  const fetchPrecomputedBacktests = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/backtest/precompute')
      if (response.ok) {
        const data = await response.json()
        setPrecomputedBacktests(data.backtests || [])
      }
    } catch (error) {
      console.error('Error fetching pre-computed backtests:', error)
    } finally {
      setLoading(false)
    }
  }

  const triggerPrecomputation = async (force: boolean = false) => {
    try {
      setComputing(true)
      setComputeResults(null)
      
      const response = await fetch('/api/backtest/precompute', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ force })
      })
      
      const data = await response.json()
      setComputeResults(data)
      
      if (data.success) {
        // Refresh the list
        await fetchPrecomputedBacktests()
      }
    } catch (error) {
      console.error('Error triggering pre-computation:', error)
      setComputeResults({
        success: false,
        error: error.message
      })
    } finally {
      setComputing(false)
    }
  }

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-4 mb-4">
          <Link href="/admin">
            <Button variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Admin
            </Button>
          </Link>
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-gray-900">Pre-computed Backtests</h1>
            <p className="text-gray-600">Manage pre-computed backtest results for instant performance</p>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={() => fetchPrecomputedBacktests()}
              disabled={loading}
              variant="outline"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button
              onClick={() => triggerPrecomputation(false)}
              disabled={computing}
              className="bg-blue-600 hover:bg-blue-700"
            >
              <Play className={`h-4 w-4 mr-2 ${computing ? 'animate-spin' : ''}`} />
              {computing ? 'Computing...' : 'Compute New'}
            </Button>
            <Button
              onClick={() => triggerPrecomputation(true)}
              disabled={computing}
              variant="outline"
              className="border-orange-300 text-orange-700 hover:bg-orange-50"
            >
              <Database className="h-4 w-4 mr-2" />
              Force Recompute All
            </Button>
          </div>
        </div>
      </div>

      {/* Compute Results */}
      {computeResults && (
        <Card className={`mb-6 ${computeResults.success ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
          <CardHeader>
            <CardTitle className={computeResults.success ? 'text-green-800' : 'text-red-800'}>
              {computeResults.success ? '✅ Pre-computation Results' : '❌ Pre-computation Failed'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {computeResults.success ? (
              <div>
                <p className="text-green-700 mb-4">{computeResults.message}</p>
                {computeResults.summary && (
                  <div className="grid grid-cols-4 gap-4">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-green-600">{computeResults.summary.total}</div>
                      <div className="text-sm text-gray-600">Total</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-blue-600">{computeResults.summary.computed}</div>
                      <div className="text-sm text-gray-600">Computed</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-gray-600">{computeResults.summary.skipped}</div>
                      <div className="text-sm text-gray-600">Skipped</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-red-600">{computeResults.summary.failed}</div>
                      <div className="text-sm text-gray-600">Failed</div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-red-700">{computeResults.error}</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Pre-computed Backtests List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Available Pre-computed Backtests
          </CardTitle>
          <CardDescription>
            Pre-computed backtests provide instant, consistent results
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center items-center py-8">
              <RefreshCw className="h-8 w-8 animate-spin mr-2" />
              <span>Loading pre-computed backtests...</span>
            </div>
          ) : precomputedBacktests.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Database className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No pre-computed backtests available</p>
              <p className="text-sm">Click "Compute New" to generate pre-computed results</p>
            </div>
          ) : (
            <div className="space-y-4">
              {precomputedBacktests.map((backtest) => (
                <Card key={backtest.backtestId} className="border-l-4 border-l-blue-500">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="font-semibold">{backtest.backtestId}</h3>
                          <Badge className="bg-blue-100 text-blue-800">{backtest.strategy}</Badge>
                          <Badge variant="outline">{backtest.symbol}</Badge>
                        </div>
                        
                        <div className="grid grid-cols-2 md:grid-cols-6 gap-4 text-sm">
                          <div>
                            <span className="text-gray-500">Period:</span>
                            <span className="ml-2 font-medium">{backtest.period}</span>
                          </div>
                          <div>
                            <span className="text-gray-500">Total Trades:</span>
                            <span className="ml-2 font-medium">{backtest.totalTrades}</span>
                          </div>
                          <div>
                            <span className="text-gray-500">Total P&L:</span>
                            <span className={`ml-2 font-bold ${
                              backtest.totalPnL >= 0 ? 'text-green-600' : 'text-red-600'
                            }`}>
                              ₹{backtest.totalPnL.toLocaleString()}
                            </span>
                          </div>
                          <div>
                            <span className="text-gray-500">Return %:</span>
                            <span className={`ml-2 font-medium ${
                              backtest.totalPnLPercent >= 0 ? 'text-green-600' : 'text-red-600'
                            }`}>
                              {backtest.totalPnLPercent.toFixed(1)}%
                            </span>
                          </div>
                          <div>
                            <span className="text-gray-500">Win Rate:</span>
                            <span className="ml-2 font-medium">{backtest.winRate.toFixed(1)}%</span>
                          </div>
                          <div>
                            <span className="text-gray-500">Max DD:</span>
                            <span className="ml-2 font-medium text-red-600">{backtest.maxDrawdown.toFixed(1)}%</span>
                          </div>
                        </div>
                        
                        <div className="mt-2 text-xs text-gray-500">
                          <Calendar className="h-3 w-3 inline mr-1" />
                          Computed: {new Date(backtest.computedAt).toLocaleString()}
                        </div>
                      </div>
                      
                      <div className="ml-4 flex flex-col gap-2">
                        <Button
                          size="sm"
                          onClick={() => {
                            // Test this pre-computed result
                            window.open(`/api/backtest/precomputed/${backtest.backtestId}`, '_blank')
                          }}
                          className="bg-green-600 hover:bg-green-700"
                        >
                          <TrendingUp className="h-4 w-4 mr-1" />
                          Test API
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            // Copy backtest ID
                            navigator.clipboard.writeText(backtest.backtestId)
                            alert('Backtest ID copied to clipboard!')
                          }}
                        >
                          Copy ID
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Usage Instructions */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            How Pre-computed Backtests Work
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h4 className="font-semibold mb-2">Benefits:</h4>
              <ul className="list-disc list-inside space-y-1 text-sm text-gray-600">
                <li><strong>Instant Results</strong>: No re-computation needed</li>
                <li><strong>Consistent</strong>: Same results every time</li>
                <li><strong>Detailed Trades</strong>: Complete trade-by-trade history</li>
                <li><strong>Capital Scaling</strong>: Auto-scales for different amounts</li>
                <li><strong>Performance</strong>: No load on backtest servers</li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-2">API Usage:</h4>
              <div className="space-y-2 text-sm">
                <div className="bg-gray-100 p-2 rounded font-mono">
                  GET /api/backtest/precomputed/[id]
                </div>
                <div className="bg-gray-100 p-2 rounded font-mono">
                  ?capital=500000 (optional scaling)
                </div>
                <p className="text-gray-600">
                  Use these IDs in your regular backtest UI - the system will automatically prefer 
                  pre-computed results for speed and consistency.
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}