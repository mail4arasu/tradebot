'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, Trash2, RefreshCw, AlertTriangle, CheckCircle } from 'lucide-react'
import Link from 'next/link'

export default function AdminCleanup() {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState('')

  const runCleanup = async () => {
    try {
      setLoading(true)
      setError('')
      setResult(null)

      const response = await fetch('/api/admin/cleanup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      const data = await response.json()

      if (response.ok) {
        setResult(data)
      } else {
        setError(data.error || 'Cleanup failed')
      }
    } catch (error) {
      console.error('Cleanup error:', error)
      setError('Failed to run cleanup')
    } finally {
      setLoading(false)
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
            <h1 className="text-3xl font-bold text-gray-900">Database Cleanup</h1>
            <p className="text-gray-600">Remove simulated and test data from the database</p>
          </div>
        </div>
      </div>

      {/* Cleanup Card */}
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trash2 className="h-5 w-5 text-red-600" />
            Remove Simulated Trades
          </CardTitle>
          <CardDescription>
            This will remove all trades and executions with simulated order IDs (starting with "SIM_").
            This action cannot be undone.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Warning */}
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <div className="flex items-start">
              <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5 mr-3" />
              <div>
                <h3 className="text-sm font-medium text-yellow-800">Warning</h3>
                <p className="text-sm text-yellow-700 mt-1">
                  This will permanently delete simulated trades including the one with Order ID: SIM_1759121208736_5yetjz4l6
                </p>
              </div>
            </div>
          </div>

          {/* Action Button */}
          <div className="flex gap-4">
            <Button 
              onClick={runCleanup} 
              disabled={loading}
              variant="destructive"
              className="min-w-32"
            >
              {loading ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Cleaning...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Run Cleanup
                </>
              )}
            </Button>
          </div>

          {/* Results */}
          {result && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <div className="flex items-start">
                <CheckCircle className="h-5 w-5 text-green-600 mt-0.5 mr-3" />
                <div>
                  <h3 className="text-sm font-medium text-green-800">Cleanup Completed</h3>
                  <div className="text-sm text-green-700 mt-2 space-y-1">
                    <p>✅ Simulated trades removed: <Badge variant="secondary">{result.removed?.simulatedTrades || 0}</Badge></p>
                    <p>✅ Simulated executions removed: <Badge variant="secondary">{result.removed?.simulatedExecutions || 0}</Badge></p>
                  </div>
                  <p className="text-sm text-green-600 mt-3 font-medium">
                    Go back to <Link href="/trades" className="underline">Trade History</Link> to see the cleaned data.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="flex items-start">
                <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5 mr-3" />
                <div>
                  <h3 className="text-sm font-medium text-red-800">Error</h3>
                  <p className="text-sm text-red-700 mt-1">{error}</p>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}