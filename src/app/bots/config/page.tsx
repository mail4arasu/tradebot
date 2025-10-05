'use client'

import { useSession } from 'next-auth/react'
import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, Save, Settings, Plus, Eye, EyeOff } from 'lucide-react'
import Link from 'next/link'

interface BotConfig {
  _id: string
  name: string
  strategy: string
  isActive: boolean
  riskLevel: string
  maxTradesPerDay: number
  webhook: {
    url: string
    passphrase: string
    isEnabled: boolean
  }
  tradingConfig: {
    symbol: string
    exchange: string
    lotSize: number
    maxPositionSize: number
  }
  createdAt: string
}

export default function BotConfiguration() {
  const { data: session, status } = useSession()
  const [configs, setConfigs] = useState<BotConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showPassphrase, setShowPassphrase] = useState<{ [key: string]: boolean }>({})
  const [newConfig, setNewConfig] = useState({
    name: 'Nifty50 Futures Bot',
    strategy: 'opening_breakout',
    isActive: false,
    riskLevel: '1 contract per 3 Lakhs capital',
    maxTradesPerDay: 1,
    webhook: {
      url: '',
      passphrase: '',
      isEnabled: false
    },
    tradingConfig: {
      symbol: 'NIFTY',
      exchange: 'NFO',
      lotSize: 25,
      maxPositionSize: 100
    }
  })

  useEffect(() => {
    if (session) {
      fetchConfigs()
      setNewConfig(prev => ({
        ...prev,
        webhook: {
          ...prev.webhook,
          url: `${window.location.origin}/api/webhook/tradingview`
        }
      }))
    }
  }, [session])

  const fetchConfigs = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/bots/config')
      if (response.ok) {
        const data = await response.json()
        setConfigs(data.configs)
      }
    } catch (error) {
      console.error('Error fetching bot configs:', error)
    } finally {
      setLoading(false)
    }
  }

  const saveConfig = async () => {
    try {
      setSaving(true)
      const response = await fetch('/api/bots/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newConfig)
      })

      if (response.ok) {
        alert('Bot configuration saved successfully!')
        fetchConfigs()
        // Reset form
        setNewConfig({
          ...newConfig,
          name: '',
          strategy: '',
          webhook: { ...newConfig.webhook, passphrase: '' }
        })
      } else {
        const error = await response.json()
        alert(`Error: ${error.error}`)
      }
    } catch (error) {
      console.error('Error saving config:', error)
      alert('Error saving configuration')
    } finally {
      setSaving(false)
    }
  }

  const updateConfig = async (configId: string, updates: Partial<BotConfig>) => {
    try {
      const response = await fetch('/api/bots/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ configId, ...updates })
      })

      if (response.ok) {
        alert('Configuration updated successfully!')
        fetchConfigs()
      } else {
        const error = await response.json()
        alert(`Error: ${error.error}`)
      }
    } catch (error) {
      console.error('Error updating config:', error)
      alert('Error updating configuration')
    }
  }

  const togglePassphraseVisibility = (configId: string) => {
    setShowPassphrase(prev => ({
      ...prev,
      [configId]: !prev[configId]
    }))
  }

  const generatePassphrase = () => {
    const passphrase = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
    setNewConfig(prev => ({
      ...prev,
      webhook: { ...prev.webhook, passphrase }
    }))
  }

  if (status === 'loading') {
    return <div className="flex justify-center items-center min-h-screen">Loading...</div>
  }

  if (!session) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Please sign in to configure bots</h1>
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
            <h1 className="text-3xl font-bold text-gray-900">Bot Configuration</h1>
            <p className="text-gray-600">Configure webhooks and trading parameters for your bots</p>
          </div>
        </div>
      </div>

      {/* New Configuration Form */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            Create New Bot Configuration
          </CardTitle>
          <CardDescription>
            Set up webhook and trading parameters for a new trading bot
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <Label htmlFor="name">Bot Name</Label>
                <Input
                  id="name"
                  value={newConfig.name}
                  onChange={(e) => setNewConfig(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Enter bot name"
                />
              </div>
              
              <div>
                <Label htmlFor="strategy">Strategy</Label>
                <Input
                  id="strategy"
                  value={newConfig.strategy}
                  onChange={(e) => setNewConfig(prev => ({ ...prev, strategy: e.target.value }))}
                  placeholder="e.g., opening_breakout"
                />
              </div>
              
              <div>
                <Label htmlFor="maxTrades">Max Trades per Day</Label>
                <Input
                  id="maxTrades"
                  type="number"
                  value={newConfig.maxTradesPerDay}
                  onChange={(e) => setNewConfig(prev => ({ ...prev, maxTradesPerDay: parseInt(e.target.value) }))}
                />
              </div>
              
              <div>
                <Label htmlFor="symbol">Trading Symbol</Label>
                <Input
                  id="symbol"
                  value={newConfig.tradingConfig.symbol}
                  onChange={(e) => setNewConfig(prev => ({
                    ...prev,
                    tradingConfig: { ...prev.tradingConfig, symbol: e.target.value }
                  }))}
                  placeholder="e.g., NIFTY"
                />
              </div>
            </div>
            
            <div className="space-y-4">
              <div>
                <Label htmlFor="webhookUrl">Webhook URL</Label>
                <Input
                  id="webhookUrl"
                  value={newConfig.webhook.url}
                  onChange={(e) => setNewConfig(prev => ({
                    ...prev,
                    webhook: { ...prev.webhook, url: e.target.value }
                  }))}
                  readOnly
                  className="bg-gray-50"
                />
              </div>
              
              <div>
                <Label htmlFor="passphrase">Webhook Passphrase</Label>
                <div className="flex gap-2">
                  <Input
                    id="passphrase"
                    type={showPassphrase['new'] ? 'text' : 'password'}
                    value={newConfig.webhook.passphrase}
                    onChange={(e) => setNewConfig(prev => ({
                      ...prev,
                      webhook: { ...prev.webhook, passphrase: e.target.value }
                    }))}
                    placeholder="Enter secure passphrase"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => togglePassphraseVisibility('new')}
                  >
                    {showPassphrase['new'] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={generatePassphrase}
                  >
                    Generate
                  </Button>
                </div>
              </div>
              
              <div>
                <Label htmlFor="exchange">Exchange</Label>
                <Input
                  id="exchange"
                  value={newConfig.tradingConfig.exchange}
                  onChange={(e) => setNewConfig(prev => ({
                    ...prev,
                    tradingConfig: { ...prev.tradingConfig, exchange: e.target.value }
                  }))}
                  placeholder="e.g., NFO"
                />
              </div>
              
              <div>
                <Label htmlFor="lotSize">Lot Size</Label>
                <Input
                  id="lotSize"
                  type="number"
                  value={newConfig.tradingConfig.lotSize}
                  onChange={(e) => setNewConfig(prev => ({
                    ...prev,
                    tradingConfig: { ...prev.tradingConfig, lotSize: parseInt(e.target.value) }
                  }))}
                />
              </div>
            </div>
          </div>
          
          <div className="mt-6">
            <Button onClick={saveConfig} disabled={saving || !newConfig.name || !newConfig.strategy}>
              <Save className="h-4 w-4 mr-2" />
              {saving ? 'Saving...' : 'Save Configuration'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Existing Configurations */}
      <div className="space-y-6">
        <h2 className="text-2xl font-bold">Existing Configurations</h2>
        
        {loading ? (
          <Card>
            <CardContent className="py-8 text-center">
              Loading configurations...
            </CardContent>
          </Card>
        ) : configs.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center">
              <Settings className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No configurations yet</h3>
              <p className="text-gray-500">Create your first bot configuration above</p>
            </CardContent>
          </Card>
        ) : (
          configs.map((config) => (
            <Card key={config._id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <Settings className="h-5 w-5" />
                    {config.name}
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <Badge variant={config.isActive ? 'default' : 'secondary'}>
                      {config.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                    <Badge variant={config.webhook.isEnabled ? 'default' : 'outline'}>
                      Webhook {config.webhook.isEnabled ? 'Enabled' : 'Disabled'}
                    </Badge>
                  </div>
                </div>
                <CardDescription>
                  Strategy: {config.strategy} | Max trades: {config.maxTradesPerDay}/day
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-500">Symbol:</span>
                    <div className="font-medium">{config.tradingConfig.symbol}</div>
                  </div>
                  <div>
                    <span className="text-gray-500">Exchange:</span>
                    <div className="font-medium">{config.tradingConfig.exchange}</div>
                  </div>
                  <div>
                    <span className="text-gray-500">Lot Size:</span>
                    <div className="font-medium">{config.tradingConfig.lotSize}</div>
                  </div>
                  <div>
                    <span className="text-gray-500">Risk Level:</span>
                    <div className="font-medium">{config.riskLevel}</div>
                  </div>
                  <div className="md:col-span-2">
                    <span className="text-gray-500">Webhook Passphrase:</span>
                    <div className="flex items-center gap-2 mt-1">
                      <code className="font-mono text-xs bg-gray-100 px-2 py-1 rounded">
                        {showPassphrase[config._id] ? config.webhook.passphrase : '••••••••••••'}
                      </code>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => togglePassphraseVisibility(config._id)}
                      >
                        {showPassphrase[config._id] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                </div>
                
                <div className="mt-4 flex gap-2">
                  <Button
                    size="sm"
                    variant={config.isActive ? 'destructive' : 'default'}
                    onClick={() => updateConfig(config._id, { isActive: !config.isActive })}
                  >
                    {config.isActive ? 'Deactivate' : 'Activate'}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => updateConfig(config._id, { 
                      webhook: { ...config.webhook, isEnabled: !config.webhook.isEnabled }
                    })}
                  >
                    {config.webhook.isEnabled ? 'Disable Webhook' : 'Enable Webhook'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  )
}