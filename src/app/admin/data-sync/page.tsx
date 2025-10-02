'use client'

import { useSession } from 'next-auth/react'
import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, Database, Download, RefreshCw, BarChart3, Loader2 } from 'lucide-react'
import Link from 'next/link'

interface DataStats {
  _id: {
    symbol: string
    tradingsymbol: string
    timeframe: string
  }
  count: number
  minDate: string
  maxDate: string
}

export default function DataSyncPage() {
  const { data: session, status } = useSession()
  const [loading, setLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [stats, setStats] = useState<DataStats[]>([])
  const [syncDays, setSyncDays] = useState(365)
  const [lastSync, setLastSync] = useState<string | null>(null)

  useEffect(() => {
    if (session) {
      fetchStats()
    }
  }, [session])

  const fetchStats = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/admin/sync-data')
      if (response.ok) {
        const data = await response.json()
        setStats(data.stats || [])
        setLastSync(data.lastUpdate)
      }
    } catch (error) {
      console.error('Error fetching stats:', error)
    } finally {
      setLoading(false)
    }
  }

  const startSync = async () => {
    try {
      setSyncing(true)
      const response = await fetch('/api/admin/sync-data', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'start',
          days: syncDays
        })
      })

      const data = await response.json()
      
      if (data.success) {
        alert(`Historical data sync started!\\n\\nSync ID: ${data.syncId}\\nEstimated Time: ${data.estimatedTime}\\nContracts: ${data.contracts}\\n\\nThis will run in the background. Refresh the page in a few minutes to see updated statistics.`)
        
        // Refresh stats after a delay
        setTimeout(() => {
          fetchStats()
        }, 5000)
      } else {
        alert(`Sync failed: ${data.error}`)
      }
    } catch (error: any) {
      console.error('Sync error:', error)
      alert(`Sync failed: ${error.message}`)
    } finally {
      setSyncing(false)
    }
  }

  const getTotalRecords = () => {
    return stats.reduce((total, stat) => total + stat.count, 0)
  }

  const getUniqueContracts = () => {
    const contracts = new Set(stats.map(stat => stat._id.tradingsymbol))
    return contracts.size
  }

  const getDateRange = () => {
    if (stats.length === 0) return { min: 'N/A', max: 'N/A' }
    
    const dates = stats.map(stat => ({
      min: new Date(stat.minDate),
      max: new Date(stat.maxDate)
    }))
    
    const minDate = new Date(Math.min(...dates.map(d => d.min.getTime())))
    const maxDate = new Date(Math.max(...dates.map(d => d.max.getTime())))
    
    return {
      min: minDate.toLocaleDateString(),
      max: maxDate.toLocaleDateString()
    }
  }

  if (status === 'loading') {
    return <div className="flex justify-center items-center min-h-screen">Loading...</div>
  }

  if (!session) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Please sign in to access admin panel</h1>
          <Link href="/auth/signin">
            <Button>Sign In</Button>
          </Link>
        </div>
      </div>
    )
  }

  const dateRange = getDateRange()

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
            <h1 className="text-3xl font-bold text-gray-900">Historical Data Sync</h1>
            <p className="text-gray-600">Manage Nifty50 futures historical data for backtesting</p>
          </div>
          <Button 
            onClick={fetchStats}
            disabled={loading}
            variant="outline"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Data Statistics */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                Data Statistics
              </CardTitle>
              <CardDescription>
                Current historical data in the database
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex justify-center items-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin mr-2" />
                  <span>Loading statistics...</span>
                </div>
              ) : stats.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Database className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No historical data found</p>
                  <p className="text-sm">Start a sync to populate the database</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Summary Cards */}
                  <div className="grid grid-cols-3 gap-4 mb-6">
                    <div className="text-center p-4 bg-blue-50 rounded-lg">
                      <div className="text-2xl font-bold text-blue-600">
                        {getTotalRecords().toLocaleString()}
                      </div>
                      <div className="text-sm text-blue-800">Total Records</div>
                    </div>
                    <div className="text-center p-4 bg-green-50 rounded-lg">
                      <div className="text-2xl font-bold text-green-600">
                        {getUniqueContracts()}
                      </div>
                      <div className="text-sm text-green-800">Contracts</div>
                    </div>
                    <div className="text-center p-4 bg-purple-50 rounded-lg">
                      <div className="text-lg font-bold text-purple-600">
                        {dateRange.min} - {dateRange.max}
                      </div>
                      <div className="text-sm text-purple-800">Date Range</div>
                    </div>
                  </div>

                  {/* Detailed Statistics */}
                  <div className="space-y-3">
                    {stats.map((stat, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50"
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-3">
                            <h3 className="font-semibold">{stat._id.tradingsymbol}</h3>
                            <Badge variant="secondary">
                              {stat._id.timeframe}
                            </Badge>
                          </div>
                          <p className="text-sm text-gray-600">
                            {new Date(stat.minDate).toLocaleDateString()} to {new Date(stat.maxDate).toLocaleDateString()}
                          </p>
                        </div>
                        <div className="text-right">
                          <div className="font-semibold">{stat.count.toLocaleString()}</div>
                          <div className="text-sm text-gray-500">records</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Sync Controls */}
        <div>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Download className="h-5 w-5" />
                Sync Historical Data
              </CardTitle>
              <CardDescription>
                Download Nifty50 futures data from Zerodha
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="syncDays">Days to Sync</Label>
                <Input
                  id="syncDays"
                  type="number"
                  value={syncDays}
                  onChange={(e) => setSyncDays(parseInt(e.target.value) || 365)}
                  min={1}
                  max={730}
                  placeholder="365"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Maximum 730 days (2 years) recommended
                </p>
              </div>

              <div className="p-3 bg-yellow-50 rounded-lg">
                <h4 className="font-medium text-yellow-900 mb-2">Sync Details:</h4>
                <ul className="text-sm text-yellow-800 space-y-1">
                  <li>• Nifty50 futures contracts (current & historical)</li>
                  <li>• 5-minute and daily timeframes</li>
                  <li>• OHLC + Volume data</li>
                  <li>• Estimated time: ~20 minutes for 1 year</li>
                </ul>
              </div>

              {lastSync && (
                <div className="text-xs text-gray-500">
                  Last updated: {new Date(lastSync).toLocaleString()}
                </div>
              )}

              <Button
                onClick={startSync}
                disabled={syncing}
                className="w-full bg-blue-600 hover:bg-blue-700"
              >
                {syncing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Syncing Data...
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4 mr-2" />
                    Start Sync
                  </>
                )}
              </Button>

              <div className="text-xs text-gray-500 text-center">
                Sync runs in background. Refresh page to see progress.
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}