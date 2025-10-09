'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'

interface CollectorStatus {
  isRunning: boolean
  schedulerActive: boolean
  lastRun: string | null
  nextScheduled: string | null
  totalSnapshots: number
  lastSnapshot: {
    date: string
    snapshotTime: string
    totalDayPnL: number
  } | null
  recentSnapshots: any[]
  todaySnapshots: number
}

interface CollectionResult {
  success: number
  failed: number
  errors: string[]
}

export default function DailyPnLCollectorPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  
  const [status_, setStatus] = useState<CollectorStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string>('')
  const [lastResult, setLastResult] = useState<CollectionResult | null>(null)
  const [selectedDate, setSelectedDate] = useState('')

  useEffect(() => {
    if (status === 'loading') return
    if (!session) {
      router.push('/signin')
      return
    }
    loadStatus()
  }, [session, status, router])

  const loadStatus = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/admin/daily-pnl-collector?action=status')
      const data = await response.json()
      
      if (data.success) {
        setStatus(data.status)
      } else {
        console.error('Failed to load status:', data.error)
      }
    } catch (error) {
      console.error('Error loading status:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleAction = async (action: string, additionalData: any = {}) => {
    try {
      setActionLoading(action)
      
      const response = await fetch('/api/admin/daily-pnl-collector', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...additionalData })
      })

      const result = await response.json()
      
      if (result.success) {
        setLastResult(result.results || null)
        alert(result.message)
        await loadStatus() // Refresh status
      } else {
        alert(`Error: ${result.error}`)
      }
    } catch (error) {
      console.error(`Error in ${action}:`, error)
      alert(`Error executing ${action}`)
    } finally {
      setActionLoading('')
    }
  }

  const handleCleanup = async () => {
    if (!confirm('Are you sure you want to remove duplicate P&L snapshots? This will keep only the latest snapshot for each date.')) {
      return
    }

    try {
      setActionLoading('cleanup')
      
      const response = await fetch('/api/admin/cleanup-pnl-snapshots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'remove_duplicates' })
      })

      const result = await response.json()
      
      if (result.success) {
        alert(result.message)
        await loadStatus() // Refresh status
      } else {
        alert(`Error: ${result.error}`)
      }
    } catch (error) {
      console.error('Error cleaning duplicates:', error)
      alert('Error cleaning duplicates')
    } finally {
      setActionLoading('')
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-lg font-medium text-gray-900">Loading Daily P&L Collector...</div>
          <div className="text-sm text-gray-500 mt-2">Please wait</div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Daily P&L Collector</h1>
          <p className="mt-2 text-gray-600">
            Automated daily P&L snapshot collection for all users with Zerodha connections
          </p>
        </div>

        {/* Status Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-500">Collector Status</p>
                  <p className={`text-lg font-semibold ${status_?.isRunning ? 'text-green-600' : 'text-gray-900'}`}>
                    {status_?.isRunning ? 'Running' : 'Idle'}
                  </p>
                  <p className={`text-xs ${status_?.schedulerActive ? 'text-green-600' : 'text-orange-600'}`}>
                    Scheduler: {status_?.schedulerActive ? 'Active' : 'Inactive'}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-500">Total Snapshots</p>
                  <p className="text-lg font-semibold text-gray-900">
                    {status_?.totalSnapshots || 0}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-500">Today's Snapshots</p>
                  <p className="text-lg font-semibold text-blue-600">
                    {status_?.todaySnapshots || 0}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-500">Last Snapshot</p>
                  <p className="text-sm font-semibold text-gray-900">
                    {status_?.lastSnapshot ? formatDate(status_.lastSnapshot.snapshotTime) : 'None'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="bg-white shadow rounded-lg mb-8">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-medium text-gray-900">Collection Actions</h2>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Collect All Users */}
              <div className="border border-gray-200 rounded-lg p-4">
                <h3 className="text-sm font-medium text-gray-900 mb-2">Collect All Users</h3>
                <p className="text-xs text-gray-600 mb-3">
                  Manually trigger P&L collection for all users with Zerodha connections
                </p>
                <button
                  onClick={() => handleAction('collect_all')}
                  disabled={actionLoading === 'collect_all'}
                  className="w-full px-3 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:opacity-50"
                >
                  {actionLoading === 'collect_all' ? 'Collecting...' : 'Collect Now'}
                </button>
              </div>

              {/* Collect Specific Date */}
              <div className="border border-gray-200 rounded-lg p-4">
                <h3 className="text-sm font-medium text-gray-900 mb-2">Collect Specific Date</h3>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="w-full mb-2 px-3 py-1 border border-gray-300 rounded-md text-sm"
                />
                <button
                  onClick={() => handleAction('collect_date', { date: selectedDate })}
                  disabled={actionLoading === 'collect_date' || !selectedDate}
                  className="w-full px-3 py-2 bg-green-600 text-white text-sm rounded-md hover:bg-green-700 disabled:opacity-50"
                >
                  {actionLoading === 'collect_date' ? 'Collecting...' : 'Collect Date'}
                </button>
              </div>

              {/* Enable/Disable Scheduler */}
              <div className="border border-gray-200 rounded-lg p-4">
                <h3 className="text-sm font-medium text-gray-900 mb-2">Daily Scheduler</h3>
                <p className="text-xs text-gray-600 mb-2">
                  Automated daily collection at 4:30 PM IST
                </p>
                <p className={`text-xs mb-3 ${status_?.schedulerActive ? 'text-green-600' : 'text-gray-500'}`}>
                  Status: {status_?.schedulerActive ? 'Active' : 'Inactive'}
                </p>
                <button
                  onClick={() => handleAction('schedule', { enable: !status_?.schedulerActive })}
                  disabled={actionLoading === 'schedule'}
                  className={`w-full px-3 py-2 text-white text-sm rounded-md disabled:opacity-50 ${
                    status_?.schedulerActive 
                      ? 'bg-red-600 hover:bg-red-700' 
                      : 'bg-purple-600 hover:bg-purple-700'
                  }`}
                >
                  {actionLoading === 'schedule' 
                    ? (status_?.schedulerActive ? 'Disabling...' : 'Enabling...')
                    : (status_?.schedulerActive ? 'Disable Scheduler' : 'Enable Scheduler')
                  }
                </button>
              </div>

              {/* Cleanup Duplicates */}
              <div className="border border-gray-200 rounded-lg p-4">
                <h3 className="text-sm font-medium text-gray-900 mb-2">Cleanup Duplicates</h3>
                <p className="text-xs text-gray-600 mb-3">
                  Remove duplicate snapshots for the same date
                </p>
                <button
                  onClick={() => handleCleanup()}
                  disabled={actionLoading === 'cleanup'}
                  className="w-full px-3 py-2 bg-red-600 text-white text-sm rounded-md hover:bg-red-700 disabled:opacity-50"
                >
                  {actionLoading === 'cleanup' ? 'Cleaning...' : 'Clean Duplicates'}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Last Collection Result */}
        {lastResult && (
          <div className="bg-white shadow rounded-lg mb-8">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-medium text-gray-900">Last Collection Result</h2>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <div className="text-sm text-gray-600 mb-2">Summary</div>
                  <div className="space-y-1">
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Successful:</span>
                      <span className="text-sm font-medium text-green-600">{lastResult.success}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Failed:</span>
                      <span className="text-sm font-medium text-red-600">{lastResult.failed}</span>
                    </div>
                  </div>
                </div>
                
                {lastResult.errors.length > 0 && (
                  <div>
                    <div className="text-sm text-gray-600 mb-2">Errors</div>
                    <div className="bg-red-50 border border-red-200 rounded-md p-3 max-h-32 overflow-y-auto">
                      {lastResult.errors.map((error, index) => (
                        <div key={index} className="text-xs text-red-700 mb-1">{error}</div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Recent Snapshots */}
        {status_?.recentSnapshots && status_.recentSnapshots.length > 0 && (
          <div className="bg-white shadow rounded-lg">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-medium text-gray-900">Recent Snapshots</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      User
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Date
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Day P&L
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Total P&L
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Source
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Time
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {status_.recentSnapshots.map((snapshot, index) => (
                    <tr key={index} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {snapshot.userId?.name || 'Unknown'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {snapshot.date}
                      </td>
                      <td className={`px-6 py-4 whitespace-nowrap text-sm font-medium ${
                        snapshot.totalDayPnL >= 0 ? 'text-green-600' : 'text-red-600'
                      }`}>
                        ₹{snapshot.totalDayPnL?.toFixed(2) || '0.00'}
                      </td>
                      <td className={`px-6 py-4 whitespace-nowrap text-sm font-medium ${
                        snapshot.totalPortfolioPnL >= 0 ? 'text-green-600' : 'text-red-600'
                      }`}>
                        ₹{snapshot.totalPortfolioPnL?.toFixed(2) || '0.00'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 text-xs rounded ${
                          snapshot.dataSource === 'AUTO' 
                            ? 'bg-green-100 text-green-800' 
                            : 'bg-blue-100 text-blue-800'
                        }`}>
                          {snapshot.dataSource}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {formatDate(snapshot.snapshotTime)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Back to Admin */}
        <div className="mt-8">
          <button
            onClick={() => router.push('/admin')}
            className="text-blue-600 hover:text-blue-800 text-sm font-medium"
          >
            ← Back to Admin Panel
          </button>
        </div>
      </div>
    </div>
  )
}