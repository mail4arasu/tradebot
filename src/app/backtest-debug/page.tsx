'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default function BacktestDebug() {
  const [backtestId, setBacktestId] = useState('bt_1759574778009_3721hpGgw')
  const [result, setResult] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  const fetchResults = async () => {
    setLoading(true)
    setResult(null)
    
    try {
      console.log(`🔍 Manual fetch for: ${backtestId}`)
      
      const response = await fetch('/api/backtest/manual-result', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ backtestId })
      })
      
      const data = await response.json()
      console.log('Manual fetch result:', data)
      setResult(data)
      
    } catch (error) {
      console.error('Manual fetch error:', error)
      setResult({ success: false, error: error.message })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <Card>
        <CardHeader>
          <CardTitle>🔧 Backtest Debug Tool</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">
              Backtest ID (from console logs):
            </label>
            <Input
              value={backtestId}
              onChange={(e) => setBacktestId(e.target.value)}
              placeholder="bt_1759574778009_3721hpGgw"
            />
          </div>
          
          <Button 
            onClick={fetchResults}
            disabled={loading || !backtestId}
            className="w-full"
          >
            {loading ? 'Fetching Results...' : 'Manual Fetch Results'}
          </Button>
          
          {result && (
            <div className="mt-4">
              <h3 className="font-semibold mb-2">
                {result.success ? '✅ Results Found!' : '❌ No Results'}
              </h3>
              
              {result.success && result.result && (
                <div className="bg-green-50 p-4 rounded-lg space-y-2">
                  <div><strong>Source:</strong> {result.source}</div>
                  <div><strong>Total Return:</strong> ₹{result.result.totalReturn?.toLocaleString() || 'N/A'}</div>
                  <div><strong>Win Rate:</strong> {result.result.winRate?.toFixed(1) || 'N/A'}%</div>
                  <div><strong>Total Trades:</strong> {result.result.totalTrades || 'N/A'}</div>
                  <div><strong>Max Drawdown:</strong> {result.result.maxDrawdownPercent?.toFixed(1) || 'N/A'}%</div>
                </div>
              )}
              
              <details className="mt-4">
                <summary className="cursor-pointer font-medium">Raw Debug Data</summary>
                <pre className="bg-gray-100 p-4 rounded-lg text-xs overflow-auto mt-2">
                  {JSON.stringify(result, null, 2)}
                </pre>
              </details>
            </div>
          )}
          
          <div className="mt-6 p-4 bg-blue-50 rounded-lg">
            <h4 className="font-medium mb-2">🧪 Quick Test IDs from Console:</h4>
            <div className="space-y-1 text-sm">
              <div>• bt_1759574778009_3721hpGgw (latest completed)</div>
              <div>• bt_1759574439294_gzn1zasiy (earlier completed)</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}