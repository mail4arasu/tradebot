'use client'

import { useSession } from 'next-auth/react'
import { useAdmin } from '@/hooks/useAdmin'
import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { 
  Copy, 
  ExternalLink, 
  Bot, 
  Code, 
  Zap, 
  AlertCircle,
  CheckCircle,
  Settings
} from 'lucide-react'
import Link from 'next/link'

interface BotInfo {
  _id: string
  name: string
  strategy: string
  symbol: string
  exchange: string
  instrumentType: string
  isActive: boolean
  emergencyStop: boolean
  webhookUrl: string
  tradingViewPayloads: {
    withBotId: any
    withoutBotId: any
  }
}

export default function WebhookConfigPage() {
  const { data: session, status } = useSession()
  const { isAdmin, loading: adminLoading } = useAdmin()
  const [bots, setBots] = useState<BotInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedBot, setSelectedBot] = useState<BotInfo | null>(null)
  const [payloadType, setPayloadType] = useState<'withBotId' | 'withoutBotId'>('withBotId')

  useEffect(() => {
    if (session) {
      fetchBots()
    }
  }, [session])

  const fetchBots = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/bots/list')
      if (response.ok) {
        const data = await response.json()
        setBots(data.bots || [])
        if (data.bots?.length > 0) {
          setSelectedBot(data.bots[0])
        }
      }
    } catch (error) {
      console.error('Error fetching bots:', error)
    } finally {
      setLoading(false)
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    alert('Copied to clipboard!')
  }

  const generateTradingViewPayload = (bot: BotInfo, action: string) => {
    const payload = payloadType === 'withBotId' 
      ? { ...bot.tradingViewPayloads.withBotId, action }
      : { ...bot.tradingViewPayloads.withoutBotId, action }
    
    return JSON.stringify(payload, null, 2)
      .replace('"18500"', '{{close}}')
      .replace('18500', '{{close}}')
  }

  const generatePineScriptAlert = (bot: BotInfo) => {
    const basePayload = payloadType === 'withBotId' 
      ? bot.tradingViewPayloads.withBotId 
      : bot.tradingViewPayloads.withoutBotId

    return `{
  ${payloadType === 'withBotId' ? `"botId": "${bot._id}",` : ''}
  "symbol": "${bot.symbol}",
  "action": "{{strategy.order.action}}",
  "price": {{close}},
  "strategy": "${bot.strategy}",
  "exchange": "${bot.exchange}",
  "instrumentType": "${bot.instrumentType}",
  "timestamp": "{{time}}",
  "comment": "{{strategy.order.comment}}"
}`
  }

  if (status === 'loading' || adminLoading) {
    return <div className="flex justify-center items-center min-h-screen">Loading...</div>
  }

  if (!session || !isAdmin) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Admin Access Required</h1>
          <Link href="/admin">
            <Button>Go to Admin Dashboard</Button>
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">TradingView Webhook Configuration</h1>
            <p className="text-gray-600">Configure TradingView alerts for each trading bot</p>
          </div>
          <div className="flex gap-2">
            <Link href="/admin/trading">
              <Button variant="outline">Trading Control</Button>
            </Link>
            <Link href="/admin">
              <Button variant="outline">Back to Admin</Button>
            </Link>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-8">Loading bot configurations...</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Bot Selection */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bot className="h-5 w-5" />
                Select Bot
              </CardTitle>
              <CardDescription>
                Choose the trading bot to configure
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {bots.map((bot) => (
                  <div 
                    key={bot._id}
                    className={`p-3 border rounded cursor-pointer transition-colors ${
                      selectedBot?._id === bot._id ? 'border-blue-500 bg-blue-50' : 'hover:bg-gray-50'
                    }`}
                    onClick={() => setSelectedBot(bot)}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium">{bot.name}</div>
                        <div className="text-sm text-gray-600">{bot.symbol} - {bot.strategy}</div>
                      </div>
                      <div className="flex gap-1">
                        <Badge variant={bot.isActive && !bot.emergencyStop ? 'default' : 'secondary'}>
                          {bot.emergencyStop ? 'Stopped' : bot.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Configuration Method */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                Configuration Method
              </CardTitle>
              <CardDescription>
                Choose how TradingView identifies this bot
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <Label className="text-base font-medium">Targeting Method:</Label>
                  <div className="mt-2 space-y-2">
                    <label className="flex items-center space-x-2">
                      <input
                        type="radio"
                        checked={payloadType === 'withBotId'}
                        onChange={() => setPayloadType('withBotId')}
                        className="text-blue-600"
                      />
                      <span className="text-sm">
                        <strong>Bot ID</strong> (Recommended) - Precise targeting
                      </span>
                    </label>
                    <label className="flex items-center space-x-2">
                      <input
                        type="radio"
                        checked={payloadType === 'withoutBotId'}
                        onChange={() => setPayloadType('withoutBotId')}
                        className="text-blue-600"
                      />
                      <span className="text-sm">
                        <strong>Symbol + Strategy</strong> - Legacy matching
                      </span>
                    </label>
                  </div>
                </div>

                {selectedBot && (
                  <div className="mt-4 p-3 bg-gray-50 rounded">
                    <div className="text-sm">
                      <div><strong>Bot ID:</strong> {selectedBot._id}</div>
                      <div><strong>Symbol:</strong> {selectedBot.symbol}</div>
                      <div><strong>Strategy:</strong> {selectedBot.strategy}</div>
                      <div><strong>Exchange:</strong> {selectedBot.exchange}</div>
                    </div>
                  </div>
                )}

                <div className="mt-4">
                  <div className="flex items-center gap-2 text-sm text-green-600">
                    <CheckCircle className="h-4 w-4" />
                    <span>Bot ID method ensures signals reach only this specific bot</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-orange-600 mt-1">
                    <AlertCircle className="h-4 w-4" />
                    <span>Symbol method may match multiple bots with same symbol</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* TradingView Configuration */}
          <Card className="lg:col-span-1">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Code className="h-5 w-5" />
                TradingView Setup
              </CardTitle>
              <CardDescription>
                Copy these configurations to TradingView
              </CardDescription>
            </CardHeader>
            <CardContent>
              {selectedBot ? (
                <div className="space-y-4">
                  {/* Webhook URL */}
                  <div>
                    <Label htmlFor="webhookUrl">Webhook URL</Label>
                    <div className="flex gap-2 mt-1">
                      <Input
                        id="webhookUrl"
                        value={selectedBot.webhookUrl}
                        readOnly
                        className="font-mono text-xs"
                      />
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => copyToClipboard(selectedBot.webhookUrl)}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {/* Alert Message for Pine Script */}
                  <div>
                    <Label htmlFor="pineScript">Alert Message (Pine Script)</Label>
                    <div className="mt-1">
                      <Textarea
                        id="pineScript"
                        value={generatePineScriptAlert(selectedBot)}
                        readOnly
                        className="font-mono text-xs min-h-[150px]"
                      />
                      <Button 
                        size="sm" 
                        variant="outline" 
                        className="mt-2"
                        onClick={() => copyToClipboard(generatePineScriptAlert(selectedBot))}
                      >
                        <Copy className="h-4 w-4 mr-2" />
                        Copy Pine Script Alert
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  Select a bot to see configuration
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Sample Payloads */}
      {selectedBot && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5" />
              Sample Webhook Payloads
            </CardTitle>
            <CardDescription>
              Test these payloads manually or use in custom alerts
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {['BUY', 'SELL', 'EXIT'].map((action) => (
                <div key={action}>
                  <Label className="text-sm font-medium text-gray-700">
                    {action} Signal
                  </Label>
                  <Textarea
                    value={generateTradingViewPayload(selectedBot, action)}
                    readOnly
                    className="font-mono text-xs mt-1 min-h-[120px]"
                  />
                  <Button 
                    size="sm" 
                    variant="outline" 
                    className="mt-2 w-full"
                    onClick={() => copyToClipboard(generateTradingViewPayload(selectedBot, action))}
                  >
                    <Copy className="h-4 w-4 mr-2" />
                    Copy {action}
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Instructions */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Setup Instructions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="prose prose-sm max-w-none">
            <ol className="space-y-3">
              <li>
                <strong>In TradingView:</strong>
                <ul className="mt-1 space-y-1">
                  <li>• Right-click chart → Add Alert</li>
                  <li>• Set Condition to your strategy/indicator</li>
                  <li>• Enable "Webhook URL" option</li>
                  <li>• Paste the Webhook URL above</li>
                  <li>• Copy the Alert Message for your chosen method</li>
                  <li>• Set alert frequency (Once Per Bar Close recommended)</li>
                </ul>
              </li>
              <li>
                <strong>For Multiple Bots:</strong>
                <ul className="mt-1 space-y-1">
                  <li>• Use Bot ID method for precise targeting</li>
                  <li>• Create separate alerts for each bot</li>
                  <li>• Test each configuration using Admin Trading Control</li>
                </ul>
              </li>
              <li>
                <strong>Safety:</strong>
                <ul className="mt-1 space-y-1">
                  <li>• Emergency stops override all signals</li>
                  <li>• Users must enable bots individually</li>
                  <li>• Daily trade limits are enforced per user</li>
                </ul>
              </li>
            </ol>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}