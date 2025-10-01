'use client'

import { useSession } from 'next-auth/react'
import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ArrowLeft, RefreshCw, Clock, Shield, AlertTriangle, Play, Square, Settings } from 'lucide-react'
import Link from 'next/link'

interface SchedulerStatus {
  isInitialized: boolean
  scheduledExits: number
  scheduledPositions: string[]
}

interface SchedulerResponse {
  success: boolean
  scheduler: SchedulerStatus
  timestamp: string
}

export default function IntradaySchedulerAdmin() {
  const { data: session, status } = useSession()
  const [schedulerStatus, setSchedulerStatus] = useState<SchedulerStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionLoading, setActionLoading] = useState('')
  
  // Manual scheduling form
  const [positionId, setPositionId] = useState('')
  const [exitTime, setExitTime] = useState('15:15')

  useEffect(() => {
    if (session) {
      fetchSchedulerStatus()
      
      // Auto-refresh every 30 seconds
      const interval = setInterval(fetchSchedulerStatus, 30000)
      return () => clearInterval(interval)
    }
  }, [session])

  const fetchSchedulerStatus = async () => {
    try {
      setLoading(true)
      setError('')
      
      const response = await fetch('/api/admin/intraday-scheduler')
      
      if (response.ok) {
        const data: SchedulerResponse = await response.json()
        setSchedulerStatus(data.scheduler)
      } else {
        const errorData = await response.json()
        setError(errorData.error || 'Failed to fetch scheduler status')
      }
    } catch (error) {
      console.error('Error fetching scheduler status:', error)
      setError('Error connecting to server')
    } finally {
      setLoading(false)
    }
  }

  const performSchedulerAction = async (action: string, params: any = {}) => {
    try {
      setActionLoading(action)
      setError('')
      
      const response = await fetch('/api/admin/intraday-scheduler', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ action, ...params })
      })
      
      if (response.ok) {
        const data = await response.json()
        console.log(`${action} successful:`, data.message)
        
        // Refresh status after action
        setTimeout(fetchSchedulerStatus, 1000)
      } else {
        const errorData = await response.json()
        setError(errorData.error || `Failed to ${action}`)
      }
    } catch (error) {
      console.error(`Error performing ${action}:`, error)
      setError(`Error performing ${action}`)
    } finally {
      setActionLoading('')
    }
  }

  const handleManualSchedule = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!positionId.trim()) {
      setError('Position ID is required')
      return
    }
    
    await performSchedulerAction('schedule', {
      positionId: positionId.trim(),
      exitTime
    })
    
    // Clear form on success
    if (!error) {
      setPositionId('')
    }
  }

  const handleCancel = async (posId: string) => {
    await performSchedulerAction('cancel', { positionId: posId })
  }

  if (status === 'loading') {
    return <div className="flex justify-center items-center min-h-screen">Loading...</div>
  }

  if (!session) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Please sign in to access admin features</h1>
          <Link href="/signin">
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
          <Link href="/admin">
            <Button variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Admin
            </Button>
          </Link>
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-gray-900">Intraday Scheduler Management</h1>
            <p className="text-gray-600">Monitor and control automatic position square-off system</p>
          </div>
          <Button onClick={fetchSchedulerStatus} disabled={loading} variant="outline">
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <Card className="mb-6 border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <div className="flex items-center">
              <AlertTriangle className="h-5 w-5 text-red-600 mr-2" />
              <p className="text-red-800">{error}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Scheduler Status */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-600">Scheduler Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center">
              {schedulerStatus?.isInitialized ? (
                <>
                  <div className="w-3 h-3 bg-green-500 rounded-full mr-3"></div>
                  <span className="text-lg font-semibold text-green-700">Active</span>
                </>
              ) : (
                <>
                  <div className="w-3 h-3 bg-red-500 rounded-full mr-3"></div>
                  <span className="text-lg font-semibold text-red-700">Inactive</span>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-600">Scheduled Exits</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center">
              <Clock className="h-6 w-6 text-blue-600 mr-3" />
              <span className="text-2xl font-bold text-gray-900">
                {schedulerStatus?.scheduledExits || 0}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-600">Last Updated</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center">
              <RefreshCw className="h-6 w-6 text-gray-600 mr-3" />
              <span className="text-sm text-gray-700">
                {loading ? 'Updating...' : new Date().toLocaleTimeString()}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Control Actions */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Scheduler Controls
          </CardTitle>
          <CardDescription>
            Initialize, monitor, and control the intraday auto-exit scheduler
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Button
              onClick={() => performSchedulerAction('initialize')}
              disabled={actionLoading === 'initialize'}
              className="w-full"
            >
              <Play className="h-4 w-4 mr-2" />
              {actionLoading === 'initialize' ? 'Initializing...' : 'Initialize Scheduler'}
            </Button>

            <Button
              onClick={() => performSchedulerAction('emergency-stop')}
              disabled={actionLoading === 'emergency-stop'}
              variant="destructive"
              className="w-full"
            >
              <Square className="h-4 w-4 mr-2" />
              {actionLoading === 'emergency-stop' ? 'Stopping...' : 'Emergency Stop'}
            </Button>

            <Button
              onClick={fetchSchedulerStatus}
              disabled={loading}
              variant="outline"
              className="w-full"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh Status
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Manual Scheduling */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Manual Position Scheduling
          </CardTitle>
          <CardDescription>
            Manually schedule auto-exit for specific positions
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleManualSchedule} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label htmlFor="positionId">Position ID</Label>
                <Input
                  id="positionId"
                  type="text"
                  value={positionId}
                  onChange={(e) => setPositionId(e.target.value)}
                  placeholder="Enter position ID"
                  required
                />
              </div>
              
              <div>
                <Label htmlFor="exitTime">Exit Time</Label>
                <Input
                  id="exitTime"
                  type="time"
                  value={exitTime}
                  onChange={(e) => setExitTime(e.target.value)}
                  required
                />
              </div>
              
              <div className="flex items-end">
                <Button
                  type="submit"
                  disabled={actionLoading === 'schedule'}
                  className="w-full"
                >
                  {actionLoading === 'schedule' ? 'Scheduling...' : 'Schedule Exit'}
                </Button>
              </div>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Scheduled Positions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Currently Scheduled Positions
          </CardTitle>
          <CardDescription>
            Positions with pending auto-exit schedules
          </CardDescription>
        </CardHeader>
        <CardContent>
          {schedulerStatus?.scheduledPositions && schedulerStatus.scheduledPositions.length > 0 ? (
            <div className="space-y-3">
              {schedulerStatus.scheduledPositions.map((posId, index) => (
                <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center space-x-3">
                    <Shield className="h-4 w-4 text-blue-600" />
                    <span className="font-mono text-sm">{posId}</span>
                    <Badge variant="secondary">Scheduled</Badge>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleCancel(posId)}
                    disabled={actionLoading === 'cancel'}
                  >
                    Cancel
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <Clock className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No Scheduled Exits</h3>
              <p className="text-gray-600">
                No positions are currently scheduled for automatic exit.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}