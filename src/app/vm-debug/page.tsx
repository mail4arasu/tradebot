'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default function VMDebug() {
  const [backtestId, setBacktestId] = useState('bt_1759576225335_641wfzxv3')
  const [result, setResult] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  const testVM = async () => {
    setLoading(true)
    setResult(null)
    
    try {
      console.log(`🔍 Testing VM for: ${backtestId}`)
      
      const response = await fetch(`/api/backtest/vm-health?bypass=true&id=${backtestId}`)
      const data = await response.json()
      
      console.log('VM Debug result:', data)
      setResult(data)
      
    } catch (error) {
      console.error('VM Debug error:', error)
      setResult({ success: false, error: error.message })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <Card>
        <CardHeader>
          <CardTitle>🔧 VM Debug Tool</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">
              Backtest ID:
            </label>
            <Input
              value={backtestId}
              onChange={(e) => setBacktestId(e.target.value)}
              placeholder="bt_1759576225335_641wfzxv3"
            />
          </div>
          
          <Button 
            onClick={testVM}
            disabled={loading || !backtestId}
            className="w-full"
          >
            {loading ? 'Testing VM...' : 'Test VM Endpoints'}
          </Button>
          
          {result && (
            <div className="mt-4">
              <h3 className="font-semibold mb-2">
                VM Test Results: {result.success ? '✅' : '❌'}
              </h3>
              
              {result.results?.tests && (
                <div className="space-y-4">
                  {result.results.tests.map((test: any, index: number) => (
                    <div key={index} className={`p-4 rounded-lg ${test.success ? 'bg-green-50' : 'bg-red-50'}`}>
                      <div className="font-medium flex items-center gap-2">
                        {test.success ? '✅' : '❌'} {test.test}
                        {test.status && <span className="text-sm text-gray-500">({test.status})</span>}
                      </div>
                      
                      {test.url && (
                        <div className="text-xs text-gray-600 mt-1">{test.url}</div>
                      )}
                      
                      {test.success && test.data && (
                        <details className="mt-2">
                          <summary className="cursor-pointer text-sm">Show Response Data</summary>
                          <pre className="bg-white p-2 rounded text-xs overflow-auto mt-1">
                            {JSON.stringify(test.data, null, 2)}
                          </pre>
                        </details>
                      )}
                      
                      {!test.success && test.error && (
                        <div className="text-red-600 text-sm mt-1">Error: {test.error}</div>
                      )}
                    </div>
                  ))}
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
        </CardContent>
      </Card>
    </div>
  )
}