'use client'

import { useSession } from 'next-auth/react'
import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, RefreshCw, Webhook, AlertCircle, CheckCircle, Clock, Copy } from 'lucide-react'
import Link from 'next/link'

interface WebhookLog {
  _id: string
  type: string
  payload: {
    symbol: string
    action: string
    price: number
    strategy: string
    timestamp: string
  }
  receivedAt: string
  processed: boolean
  processedAt?: string
  tradeResult?: any
}

interface WebhookStats {
  total: number
  processed: number
  pending: number
}

export default function WebhookDashboard() {
  const { data: session, status } = useSession()
  const [logs, setLogs] = useState<WebhookLog[]>([])
  const [stats, setStats] = useState<WebhookStats>({ total: 0, processed: 0, pending: 0 })
  const [loading, setLoading] = useState(true)
  const [webhookUrl, setWebhookUrl] = useState('')

  useEffect(() => {
    if (session) {
      setWebhookUrl(`${window.location.origin}/api/webhook/tradingview`)
      fetchWebhookLogs()
    }
  }, [session])

  const fetchWebhookLogs = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/webhook/logs?limit=20')
      if (response.ok) {
        const data = await response.json()
        setLogs(data.logs)
        setStats(data.statistics)
      }
    } catch (error) {
      console.error('Error fetching webhook logs:', error)
    } finally {
      setLoading(false)
    }
  }

  const testWebhook = async () => {
    try {
      const testPayload = {
        symbol: 'NIFTY50',
        action: 'BUY',
        price: 19500,
        quantity: 25,
        strategy: 'opening_breakout',
        timestamp: new Date().toISOString(),
        passphrase: 'test_passphrase'
      }

      const response = await fetch('/api/webhook/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testPayload)
      })

      if (response.ok) {
        alert('Test webhook sent successfully!')
        fetchWebhookLogs()
      } else {
        alert('Test webhook failed')
      }
    } catch (error) {
      console.error('Error testing webhook:', error)
      alert('Error testing webhook')
    }
  }

  const copyWebhookUrl = () => {
    navigator.clipboard.writeText(webhookUrl)
    alert('Webhook URL copied to clipboard!')
  }

  if (status === 'loading') {
    return <div className="flex justify-center items-center min-h-screen">Loading...</div>
  }

  if (!session) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Please sign in to view webhooks</h1>
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
          <Link href="/bots">
            <Button variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Bots
            </Button>
          </Link>
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-gray-900">TradingView Webhooks</h1>
            <p className="text-gray-600">Monitor and manage incoming TradingView alerts</p>
          </div>
          <Button onClick={fetchWebhookLogs} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Webhook URL Card */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Webhook className="h-5 w-5" />
            Webhook Configuration
          </CardTitle>
          <CardDescription>
            Use this URL in your TradingView alerts to send signals to your bots
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <code className="flex-1 p-2 bg-gray-100 rounded text-sm font-mono">
                {webhookUrl}
              </code>
              <Button size="sm" onClick={copyWebhookUrl}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex gap-2">
              <Button onClick={testWebhook} variant="outline" size="sm">
                Test Webhook
              </Button>
              <Link href="/bots/config">
                <Button size="sm">
                  Configure Bots
                </Button>
              </Link>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Alerts</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
            <p className="text-xs text-gray-500">All time</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Processed</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats.processed}</div>
            <p className="text-xs text-gray-500">Successfully handled</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Pending</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">{stats.pending}</div>
            <p className="text-xs text-gray-500">Awaiting processing</p>
          </CardContent>
        </Card>
      </div>

      {/* Webhook Logs */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Webhook Activity</CardTitle>
          <CardDescription>
            Latest TradingView alerts received by your bots
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8">
              <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4" />
              <p>Loading webhook logs...</p>
            </div>
          ) : logs.length === 0 ? (
            <div className="text-center py-8">
              <Webhook className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No webhook activity yet</h3>
              <p className="text-gray-500 mb-4">
                Configure your TradingView alerts to start receiving signals
              </p>
              <Button onClick={testWebhook}>
                Send Test Alert
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {logs.map((log) => (
                <div key={log._id} className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Badge variant={log.payload.action === 'BUY' ? 'default' : 'destructive'}>
                        {log.payload.action}
                      </Badge>
                      <span className="font-medium">{log.payload.symbol}</span>
                      <span className="text-gray-500">₹{log.payload.price}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {log.processed ? (
                        <CheckCircle className="h-4 w-4 text-green-500" />
                      ) : (
                        <Clock className="h-4 w-4 text-orange-500" />
                      )}
                      <span className="text-sm text-gray-500">
                        {new Date(log.receivedAt).toLocaleString()}
                      </span>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <span className="text-gray-500">Strategy:</span>
                      <div className="font-medium">{log.payload.strategy}</div>
                    </div>
                    <div>
                      <span className="text-gray-500">Status:</span>
                      <div className={log.processed ? 'text-green-600' : 'text-orange-600'}>
                        {log.processed ? 'Processed' : 'Pending'}
                      </div>
                    </div>
                    {log.tradeResult && (
                      <>
                        <div>
                          <span className="text-gray-500">Order ID:</span>
                          <div className="font-mono text-xs">{log.tradeResult.orderId}</div>
                        </div>
                        <div>
                          <span className="text-gray-500">Result:</span>
                          <div className={log.tradeResult.success ? 'text-green-600' : 'text-red-600'}>
                            {log.tradeResult.success ? 'Success' : 'Failed'}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}