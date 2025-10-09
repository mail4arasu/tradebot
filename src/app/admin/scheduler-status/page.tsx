'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AlertCircle, Clock, CheckCircle, XCircle, RefreshCw, User, Bot, Timer } from 'lucide-react'

interface SchedulerData {
  currentTime: {
    server: string
    ist: string
    istString: string
  }
  scheduler: {
    isInitialized: boolean
    scheduledExits: number
    scheduledPositions: string[]
    scheduledPositionDetails: Array<{
      positionId: string
      symbol: string
      scheduledExitTime: string
      autoSquareOffScheduled: boolean
    }>
  }
  positions: {
    total: number
    withScheduledExit: number
    alreadyScheduled: number
    details: Array<{
      _id: string
      symbol: string
      status: string
      userEmail: string
      scheduledExitTime: string
      autoSquareOffScheduled: boolean
      currentQuantity: number
      exitTimePassed: boolean
      createdAt: string
      botName?: string
      timeUntilExit?: string
      exitStatus?: string
      exitReason?: string
    }>
  }
}

export default function SchedulerStatusPage() {
  const [data, setData] = useState<SchedulerData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [autoRefresh, setAutoRefresh] = useState(false)
  const [refreshInterval, setRefreshInterval] = useState<NodeJS.Timeout | null>(null)
  
  // Filters
  const [userFilter, setUserFilter] = useState('')
  const [botFilter, setBotFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  
  const fetchData = async () => {
    try {
      setLoading(true)
      
      // Fetch both legacy and new scheduler data
      const [legacyResponse, newResponse] = await Promise.all([
        fetch('/api/debug/scheduler-status'),
        fetch('/api/admin/scheduler-v2?action=status')
      ])
      
      const legacyResult = await legacyResponse.json()
      const newResult = newResponse.ok ? await newResponse.json() : null
      
      // Combine the results
      const result = {
        ...legacyResult,
        newScheduler: newResult
      }
      
      // Enhance position data with additional calculations
      if (result.positions?.details) {
        result.positions.details = result.positions.details.map((position: any) => {
          const enhanced = { ...position }
          
          // Calculate time until exit
          if (position.scheduledExitTime && !position.exitTimePassed) {
            const now = new Date(result.currentTime.ist)
            const [hours, minutes] = position.scheduledExitTime.split(':').map(Number)
            const exitTime = new Date(now)
            exitTime.setHours(hours, minutes, 0, 0)
            
            const diffMs = exitTime.getTime() - now.getTime()
            if (diffMs > 0) {
              const diffMins = Math.floor(diffMs / 60000)
              const diffHours = Math.floor(diffMins / 60)
              const remainingMins = diffMins % 60
              enhanced.timeUntilExit = diffHours > 0 ? `${diffHours}h ${remainingMins}m` : `${remainingMins}m`
            }
          }
          
          // Determine exit status and reason
          if (position.autoSquareOffScheduled) {
            enhanced.exitStatus = 'SCHEDULED'
            enhanced.exitReason = 'Auto-exit scheduled in system'
          } else if (position.exitTimePassed) {
            enhanced.exitStatus = 'OVERDUE'
            enhanced.exitReason = 'Exit time passed, should have been executed'
          } else if (!position.scheduledExitTime) {
            enhanced.exitStatus = 'NO_TIME'
            enhanced.exitReason = 'No scheduled exit time set'
          } else {
            enhanced.exitStatus = 'PENDING'
            enhanced.exitReason = 'Waiting to be scheduled'
          }
          
          // Extract bot name from symbol or set default
          enhanced.botName = position.symbol?.includes('NIFTY') ? 'Nifty50 Options Bot' : 
                            position.symbol?.includes('BANKNIFTY') ? 'Bank Nifty Options Bot' : 
                            'Unknown Bot'
          
          return enhanced
        })
      }
      
      setData(result)
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  useEffect(() => {
    if (autoRefresh) {
      const interval = setInterval(fetchData, 30000) // Refresh every 30 seconds
      setRefreshInterval(interval)
    } else if (refreshInterval) {
      clearInterval(refreshInterval)
      setRefreshInterval(null)
    }

    return () => {
      if (refreshInterval) clearInterval(refreshInterval)
    }
  }, [autoRefresh])

  // Get unique users and bots for filters
  const uniqueUsers = data ? [...new Set(data.positions.details.map(p => p.userEmail))].sort() : []
  const uniqueBots = data ? [...new Set(data.positions.details.map(p => p.botName))].sort() : []

  // Filter positions
  const filteredPositions = data?.positions.details.filter(position => {
    if (userFilter && !position.userEmail.toLowerCase().includes(userFilter.toLowerCase())) return false
    if (botFilter && botFilter !== 'all' && position.botName !== botFilter) return false
    if (statusFilter && statusFilter !== 'all' && position.exitStatus !== statusFilter) return false
    return true
  }) || []

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'SCHEDULED': return 'bg-green-500'
      case 'PENDING': return 'bg-yellow-500'
      case 'OVERDUE': return 'bg-red-500'
      case 'NO_TIME': return 'bg-gray-500'
      default: return 'bg-blue-500'
    }
  }

  const formatTime = (timeString: string) => {
    try {
      return new Date(timeString).toLocaleString('en-IN', { 
        timeZone: 'Asia/Kolkata',
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      })
    } catch {
      return timeString
    }
  }

  if (loading && !data) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <RefreshCw className="animate-spin h-8 w-8 mr-2" />
          <span>Loading scheduler status...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Scheduler Status</h1>
          <p className="text-muted-foreground">Monitor intraday auto-exit scheduler and open positions</p>
        </div>
        <div className="flex items-center space-x-2">
          <Button 
            onClick={fetchData} 
            disabled={loading}
            variant="outline"
            size="sm"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button
            onClick={() => setAutoRefresh(!autoRefresh)}
            variant={autoRefresh ? "default" : "outline"}
            size="sm"
          >
            <Timer className="h-4 w-4 mr-2" />
            {autoRefresh ? 'Stop Auto-Refresh' : 'Auto-Refresh'}
          </Button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center">
            <AlertCircle className="h-5 w-5 text-red-500 mr-2" />
            <span className="text-red-700">{error}</span>
          </div>
        </div>
      )}

      {data && (
        <>
          {/* New Scheduler Status Alert */}
          {data?.newScheduler && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
              <div className="flex items-center">
                <CheckCircle className="h-5 w-5 text-blue-500 mr-2" />
                <span className="font-medium text-blue-900">Restart-Resistant Scheduler v2.0 Active</span>
              </div>
              <p className="text-sm text-blue-700 mt-1">
                Database-backed scheduling with automatic restart recovery
              </p>
              <div className="mt-2 text-xs text-blue-600">
                Process ID: {data.newScheduler.restartResistantScheduler?.status?.processId} | 
                Version: {data.newScheduler.restartResistantScheduler?.status?.schedulerVersion} |
                Pending DB Exits: {data.newScheduler.restartResistantScheduler?.pendingExitsCount || 0}
              </div>
            </div>
          )}

          {/* Overview Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Current Time (IST)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatTime(data.currentTime.ist)}</div>
                <p className="text-xs text-muted-foreground mt-1">Server: {formatTime(data.currentTime.server)}</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center">
                  <CheckCircle className="h-4 w-4 mr-1" />
                  Scheduler Status
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {data.scheduler.isInitialized ? (
                    <span className="text-green-600">Active</span>
                  ) : (
                    <span className="text-red-600">Inactive</span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {data.scheduler.scheduledExits} scheduled exits
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Open Positions</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{data.positions.total}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {data.positions.withScheduledExit} with exit times
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Auto-Exit Coverage</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {data.positions.total > 0 ? 
                    Math.round((data.positions.alreadyScheduled / data.positions.total) * 100) : 0}%
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {data.positions.alreadyScheduled} of {data.positions.total} scheduled
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Filters */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Filters</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="user-filter">Filter by User</Label>
                  <Input
                    id="user-filter"
                    placeholder="Enter user email..."
                    value={userFilter}
                    onChange={(e) => setUserFilter(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="bot-filter">Filter by Bot</Label>
                  <Select value={botFilter} onValueChange={setBotFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select bot..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Bots</SelectItem>
                      {uniqueBots.map(bot => (
                        <SelectItem key={bot} value={bot}>{bot}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="status-filter">Filter by Exit Status</Label>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select status..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Statuses</SelectItem>
                      <SelectItem value="SCHEDULED">Scheduled</SelectItem>
                      <SelectItem value="PENDING">Pending</SelectItem>
                      <SelectItem value="OVERDUE">Overdue</SelectItem>
                      <SelectItem value="NO_TIME">No Exit Time</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="mt-4 text-sm text-muted-foreground">
                Showing {filteredPositions.length} of {data.positions.total} positions
              </div>
            </CardContent>
          </Card>

          {/* Positions Table */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Open Positions Details</CardTitle>
              <CardDescription>
                Detailed view of all open positions and their auto-exit status
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-2">Symbol</th>
                      <th className="text-left p-2">User</th>
                      <th className="text-left p-2">Bot</th>
                      <th className="text-left p-2">Quantity</th>
                      <th className="text-left p-2">Status</th>
                      <th className="text-left p-2">Exit Time</th>
                      <th className="text-left p-2">Time Left</th>
                      <th className="text-left p-2">Exit Status</th>
                      <th className="text-left p-2">Reason</th>
                      <th className="text-left p-2">Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPositions.map((position) => (
                      <tr key={position._id} className="border-b hover:bg-gray-50">
                        <td className="p-2 font-medium">{position.symbol}</td>
                        <td className="p-2">
                          <div className="flex items-center">
                            <User className="h-3 w-3 mr-1" />
                            {position.userEmail}
                          </div>
                        </td>
                        <td className="p-2">
                          <div className="flex items-center">
                            <Bot className="h-3 w-3 mr-1" />
                            {position.botName}
                          </div>
                        </td>
                        <td className="p-2">{position.currentQuantity}</td>
                        <td className="p-2">
                          <Badge variant={position.status === 'OPEN' ? 'default' : 'secondary'}>
                            {position.status}
                          </Badge>
                        </td>
                        <td className="p-2">
                          {position.scheduledExitTime || (
                            <span className="text-gray-400">Not set</span>
                          )}
                        </td>
                        <td className="p-2">
                          {position.timeUntilExit ? (
                            <div className="flex items-center">
                              <Clock className="h-3 w-3 mr-1" />
                              {position.timeUntilExit}
                            </div>
                          ) : position.exitTimePassed ? (
                            <span className="text-red-500">Overdue</span>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </td>
                        <td className="p-2">
                          <Badge 
                            className={`${getStatusColor(position.exitStatus || '')} text-white`}
                          >
                            {position.exitStatus}
                          </Badge>
                        </td>
                        <td className="p-2 text-xs max-w-48">
                          {position.exitReason}
                        </td>
                        <td className="p-2 text-xs">
                          {formatTime(position.createdAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                
                {filteredPositions.length === 0 && (
                  <div className="text-center py-8 text-gray-500">
                    No positions found matching the current filters
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Scheduler Details */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Scheduled Exits Details</CardTitle>
            </CardHeader>
            <CardContent>
              {data.scheduler.scheduledPositionDetails.length > 0 ? (
                <div className="space-y-2">
                  {data.scheduler.scheduledPositionDetails.map((scheduled) => (
                    <div key={scheduled.positionId} className="flex items-center justify-between p-3 bg-gray-50 rounded">
                      <div>
                        <span className="font-medium">{scheduled.symbol}</span>
                        <span className="text-sm text-gray-500 ml-2">({scheduled.positionId.substring(0, 8)}...)</span>
                      </div>
                      <div className="text-sm">
                        <span className="text-gray-600">Exit: </span>
                        <span className="font-medium">{scheduled.scheduledExitTime}</span>
                        {scheduled.autoSquareOffScheduled && (
                          <Badge className="ml-2" variant="outline">Scheduled</Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-4 text-gray-500">
                  No exits currently scheduled in the system
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}