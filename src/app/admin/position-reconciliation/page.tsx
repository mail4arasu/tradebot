'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { AlertCircle, CheckCircle, XCircle, Download, RefreshCw } from 'lucide-react'

interface PositionReconciliationResult {
  positionId: string
  symbol: string
  exchange: string
  userId: string
  currentStatus: string
  zerodhaStatus: 'EXISTS' | 'NOT_EXISTS' | 'ERROR'
  tradeботQuantity: number
  zerodhaQuantity: number
  recommendedAction: 'KEEP_OPEN' | 'RECONCILE_CLOSED' | 'MANUAL_REVIEW'
  reconciliationReason: string
  zerodhaDetails?: any
}

export default function PositionReconciliationPage() {
  const [results, setResults] = useState<PositionReconciliationResult[]>([])
  const [loading, setLoading] = useState(false)
  const [summary, setSummary] = useState<any>(null)
  const [selectedPositions, setSelectedPositions] = useState<string[]>([])

  const checkPositions = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/admin/position-reconciliation?action=check')
      const data = await response.json()
      
      if (data.success) {
        setResults(data.results)
        setSummary(data.summary)
      } else {
        alert('Error checking positions: ' + data.error)
      }
    } catch (error) {
      console.error('Error:', error)
      alert('Error checking positions')
    } finally {
      setLoading(false)
    }
  }

  const downloadReport = async () => {
    try {
      const response = await fetch('/api/admin/position-reconciliation?action=report')
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `position_reconciliation_${new Date().toISOString().split('T')[0]}.txt`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (error) {
      console.error('Error downloading report:', error)
      alert('Error downloading report')
    }
  }

  const executeReconciliation = async (dryRun: boolean = true) => {
    if (!dryRun && !confirm('Are you sure you want to execute reconciliation? This will close positions in the database.')) {
      return
    }

    setLoading(true)
    try {
      const response = await fetch('/api/admin/position-reconciliation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          action: 'reconcile',
          dryRun,
          positions: results
        })
      })
      
      const data = await response.json()
      
      if (data.success) {
        alert(data.message)
        if (!dryRun) {
          // Refresh results after actual reconciliation
          await checkPositions()
        }
      } else {
        alert('Error: ' + data.error)
      }
    } catch (error) {
      console.error('Error:', error)
      alert('Error executing reconciliation')
    } finally {
      setLoading(false)
    }
  }

  const executeSpecificReconciliation = async (dryRun: boolean = true) => {
    if (selectedPositions.length === 0) {
      alert('Please select positions to reconcile')
      return
    }

    if (!dryRun && !confirm(`Are you sure you want to reconcile ${selectedPositions.length} selected positions?`)) {
      return
    }

    setLoading(true)
    try {
      const response = await fetch('/api/admin/position-reconciliation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          action: 'reconcile-specific',
          positionIds: selectedPositions,
          dryRun
        })
      })
      
      const data = await response.json()
      
      if (data.success) {
        alert(`${dryRun ? 'DRY RUN: ' : ''}Reconciled ${data.reconciled} positions`)
        if (!dryRun) {
          await checkPositions()
          setSelectedPositions([])
        }
      } else {
        alert('Error: ' + data.error)
      }
    } catch (error) {
      console.error('Error:', error)
      alert('Error executing specific reconciliation')
    } finally {
      setLoading(false)
    }
  }

  const togglePositionSelection = (positionId: string) => {
    setSelectedPositions(prev => 
      prev.includes(positionId) 
        ? prev.filter(id => id !== positionId)
        : [...prev, positionId]
    )
  }

  const getStatusBadge = (zerodhaStatus: string) => {
    switch (zerodhaStatus) {
      case 'EXISTS':
        return <Badge variant="default" className="bg-green-100 text-green-800">Exists</Badge>
      case 'NOT_EXISTS':
        return <Badge variant="destructive">Not Found</Badge>
      case 'ERROR':
        return <Badge variant="secondary">Error</Badge>
      default:
        return <Badge variant="outline">Unknown</Badge>
    }
  }

  const getActionBadge = (action: string) => {
    switch (action) {
      case 'KEEP_OPEN':
        return <Badge variant="default" className="bg-green-100 text-green-800">Keep Open</Badge>
      case 'RECONCILE_CLOSED':
        return <Badge variant="destructive">Reconcile Closed</Badge>
      case 'MANUAL_REVIEW':
        return <Badge variant="secondary">Manual Review</Badge>
      default:
        return <Badge variant="outline">Unknown</Badge>
    }
  }

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Position Reconciliation</h1>
        <p className="text-gray-600">Check and reconcile hanging positions with Zerodha</p>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center">
                <RefreshCw className="h-8 w-8 text-blue-600" />
                <div className="ml-3">
                  <p className="text-sm font-medium text-gray-500">Total Positions</p>
                  <p className="text-2xl font-bold">{summary.total}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center">
                <CheckCircle className="h-8 w-8 text-green-600" />
                <div className="ml-3">
                  <p className="text-sm font-medium text-gray-500">Keep Open</p>
                  <p className="text-2xl font-bold">{summary.keepOpen}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center">
                <XCircle className="h-8 w-8 text-red-600" />
                <div className="ml-3">
                  <p className="text-sm font-medium text-gray-500">Reconcile Closed</p>
                  <p className="text-2xl font-bold">{summary.reconcileClosed}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center">
                <AlertCircle className="h-8 w-8 text-yellow-600" />
                <div className="ml-3">
                  <p className="text-sm font-medium text-gray-500">Manual Review</p>
                  <p className="text-2xl font-bold">{summary.manualReview}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-3 mb-6">
        <Button onClick={checkPositions} disabled={loading}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Check Positions
        </Button>
        
        <Button onClick={downloadReport} variant="outline" disabled={!results.length}>
          <Download className="w-4 h-4 mr-2" />
          Download Report
        </Button>
        
        {summary && summary.reconcileClosed > 0 && (
          <>
            <Button onClick={() => executeReconciliation(true)} variant="outline" disabled={loading}>
              Dry Run Reconciliation
            </Button>
            
            <Button onClick={() => executeReconciliation(false)} variant="destructive" disabled={loading}>
              Execute Reconciliation
            </Button>
          </>
        )}
        
        {selectedPositions.length > 0 && (
          <>
            <Button onClick={() => executeSpecificReconciliation(true)} variant="outline" disabled={loading}>
              Dry Run Selected ({selectedPositions.length})
            </Button>
            
            <Button onClick={() => executeSpecificReconciliation(false)} variant="destructive" disabled={loading}>
              Execute Selected ({selectedPositions.length})
            </Button>
          </>
        )}
      </div>

      {/* Results Table */}
      {results.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Position Reconciliation Results</CardTitle>
            <CardDescription>
              Review each position and its recommended action
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full table-auto">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-2">Select</th>
                    <th className="text-left p-2">Position ID</th>
                    <th className="text-left p-2">Symbol</th>
                    <th className="text-left p-2">TradeBot Qty</th>
                    <th className="text-left p-2">Zerodha Qty</th>
                    <th className="text-left p-2">Zerodha Status</th>
                    <th className="text-left p-2">Recommended Action</th>
                    <th className="text-left p-2">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((result, index) => (
                    <tr key={index} className="border-b hover:bg-gray-50">
                      <td className="p-2">
                        <input
                          type="checkbox"
                          checked={selectedPositions.includes(result.positionId)}
                          onChange={() => togglePositionSelection(result.positionId)}
                          disabled={result.recommendedAction === 'KEEP_OPEN'}
                        />
                      </td>
                      <td className="p-2 font-mono text-sm">{result.positionId}</td>
                      <td className="p-2 font-medium">{result.symbol}</td>
                      <td className="p-2">{result.tradeботQuantity}</td>
                      <td className="p-2">{result.zerodhaQuantity}</td>
                      <td className="p-2">{getStatusBadge(result.zerodhaStatus)}</td>
                      <td className="p-2">{getActionBadge(result.recommendedAction)}</td>
                      <td className="p-2 text-sm text-gray-600">{result.reconciliationReason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {results.length === 0 && !loading && (
        <Card>
          <CardContent className="p-8 text-center">
            <p className="text-gray-500">Click "Check Positions" to start reconciliation</p>
          </CardContent>
        </Card>
      )}
      
      {loading && (
        <Card>
          <CardContent className="p-8 text-center">
            <RefreshCw className="w-8 h-8 mx-auto animate-spin mb-4" />
            <p className="text-gray-500">Checking positions with Zerodha...</p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}