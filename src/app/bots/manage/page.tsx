'use client'

import { useSession } from 'next-auth/react'
import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { ArrowLeft, Save, Bot, TrendingUp, AlertTriangle, Settings } from 'lucide-react'
import Link from 'next/link'

interface BotAllocation {
  _id: string
  botId: string
  botName: string
  botStrategy: string
  botRiskLevel: string
  isActive: boolean
  quantity: number
  maxTradesPerDay: number
  currentDayTrades: number
  enabledHours: {
    start: string
    end: string
  }
  totalTrades: number
  successfulTrades: number
  totalPnl: number
  allocatedAmount: number
  riskPercentage: number
}

interface AvailableBot {
  _id: string
  name: string
  description: string
  strategy: string
  riskLevel: string
  symbol: string
  exchange: string
  instrumentType: string
  isActive: boolean
  emergencyStop: boolean
  // Trading type configuration
  tradingType: 'INTRADAY' | 'POSITIONAL'
  intradayExitTime: string
  autoSquareOff: boolean
  allowMultiplePositions: boolean
  maxPositionHoldDays: number
}

export default function BotManagement() {
  const { data: session, status } = useSession()
  const [allocations, setAllocations] = useState<BotAllocation[]>([])
  const [availableBots, setAvailableBots] = useState<AvailableBot[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)

  useEffect(() => {
    if (session) {
      fetchData()
    }
  }, [session])

  const fetchData = async () => {
    try {
      setLoading(true)
      
      // Fetch user's bot allocations and available bots
      const [allocationsRes, botsRes] = await Promise.all([
        fetch('/api/bots/allocations'),
        fetch('/api/bots/available')
      ])

      if (allocationsRes.ok) {
        const allocationsData = await allocationsRes.json()
        setAllocations(allocationsData.allocations || [])
      }

      if (botsRes.ok) {
        const botsData = await botsRes.json()
        setAvailableBots(botsData.bots || [])
      }
    } catch (error) {
      console.error('Error fetching bot data:', error)
    } finally {
      setLoading(false)
    }
  }

  const updateAllocation = async (allocationId: string, updates: Partial<BotAllocation>) => {
    try {
      setSaving(allocationId)
      
      const response = await fetch('/api/bots/allocations', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ allocationId, ...updates })
      })

      if (response.ok) {
        await fetchData() // Refresh data
      } else {
        const error = await response.json()
        console.error('Error updating allocation:', error)
        alert('Error updating allocation: ' + error.message)
      }
    } catch (error) {
      console.error('Error updating allocation:', error)
      alert('Error updating allocation')
    } finally {
      setSaving(null)
    }
  }

  const updateBotConfig = async (botId: string, updates: Partial<AvailableBot>) => {
    try {
      setSaving(botId)
      
      const response = await fetch('/api/admin/bots', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ botId, ...updates })
      })

      if (response.ok) {
        await fetchData() // Refresh data
      } else {
        const error = await response.json()
        console.error('Error updating bot config:', error)
        alert('Error updating bot configuration: ' + error.error)
      }
    } catch (error) {
      console.error('Error updating bot config:', error)
      alert('Error updating bot configuration')
    } finally {
      setSaving(null)
    }
  }

  const enableBot = async (botId: string) => {
    try {
      setSaving(botId)
      
      const response = await fetch('/api/bots/allocations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          botId,
          quantity: 1, // Default quantity
          maxTradesPerDay: 1,
          allocatedAmount: 300000, // Default 3 Lakh allocation
          riskPercentage: 2 // Default 2% risk per trade
        })
      })

      if (response.ok) {
        await fetchData() // Refresh data
      } else {
        const error = await response.json()
        alert(`Error: ${error.error}`)
      }
    } catch (error) {
      console.error('Error enabling bot:', error)
      alert('Error enabling bot')
    } finally {
      setSaving(null)
    }
  }

  const getRiskColor = (risk: string) => {
    // Add null/undefined check
    if (!risk) return 'bg-gray-100 text-gray-800'
    
    switch (risk.toUpperCase()) {
      case 'LOW': return 'bg-green-100 text-green-800'
      case 'MEDIUM': return 'bg-yellow-100 text-yellow-800'
      case 'HIGH': return 'bg-red-100 text-red-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const getSuccessRate = (total: number, successful: number) => {
    if (total === 0) return 0
    return Math.round((successful / total) * 100)
  }

  if (status === 'loading') {
    return <div className="flex justify-center items-center min-h-screen">Loading...</div>
  }

  if (!session) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Please sign in to manage bots</h1>
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
            <h1 className="text-3xl font-bold text-gray-900">Bot Management</h1>
            <p className="text-gray-600">Configure your trading bot preferences and position sizes</p>
          </div>
        </div>
      </div>

      {loading ? (
        <Card>
          <CardContent className="py-8 text-center">
            Loading bot configurations...
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {/* Active Bot Allocations */}
          {allocations.length > 0 && (
            <div>
              <h2 className="text-2xl font-bold mb-4">Your Active Bots</h2>
              <div className="space-y-4">
                {allocations.map((allocation) => (
                  <Card key={allocation._id}>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <CardTitle className="flex items-center gap-2">
                          <Bot className="h-5 w-5" />
                          {allocation.botName || 'Unknown Bot'}
                        </CardTitle>
                        <div className="flex items-center gap-2">
                          <Badge className={getRiskColor(allocation.botRiskLevel)}>
                            {allocation.botRiskLevel || 'Unknown'} Risk
                          </Badge>
                          <div className="flex items-center gap-3">
                            <Switch
                              checked={allocation.isActive}
                              onCheckedChange={(checked) => 
                                updateAllocation(allocation._id, { isActive: checked })
                              }
                              disabled={saving === allocation._id}
                              className="data-[state=checked]:bg-green-600 data-[state=unchecked]:bg-gray-300"
                            />
                            <Button
                              size="sm"
                              variant={allocation.isActive ? "destructive" : "default"}
                              onClick={() => updateAllocation(allocation._id, { isActive: !allocation.isActive })}
                              disabled={saving === allocation._id}
                              className="min-w-[80px]"
                            >
                              {saving === allocation._id ? 'Saving...' : allocation.isActive ? 'Disable' : 'Enable'}
                            </Button>
                          </div>
                        </div>
                      </div>
                      <CardDescription>
                        Strategy: {allocation.botStrategy || 'Unknown Strategy'}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {/* Trading Configuration */}
                        <div className="space-y-4">
                          <h4 className="font-medium text-gray-900">Trading Configuration</h4>
                          
                          <div>
                            <Label htmlFor={`quantity-${allocation._id}`}>Position Quantity</Label>
                            <Input
                              id={`quantity-${allocation._id}`}
                              type="number"
                              min="1"
                              value={allocation.quantity}
                              onChange={(e) => {
                                const quantity = parseInt(e.target.value)
                                if (quantity > 0) {
                                  updateAllocation(allocation._id, { quantity })
                                }
                              }}
                              disabled={saving === allocation._id}
                            />
                            <p className="text-xs text-gray-500 mt-1">
                              Number of lots/contracts per trade
                            </p>
                          </div>

                          <div>
                            <Label htmlFor={`maxTrades-${allocation._id}`}>Max Trades/Day</Label>
                            <Input
                              id={`maxTrades-${allocation._id}`}
                              type="number"
                              min="1"
                              max="10"
                              value={allocation.maxTradesPerDay}
                              onChange={(e) => {
                                const maxTrades = parseInt(e.target.value)
                                if (maxTrades > 0 && maxTrades <= 10) {
                                  updateAllocation(allocation._id, { maxTradesPerDay: maxTrades })
                                }
                              }}
                              disabled={saving === allocation._id}
                            />
                            <p className="text-xs text-gray-500 mt-1">
                              Daily trade limit for risk management
                            </p>
                          </div>

                          <div>
                            <Label htmlFor={`riskPercentage-${allocation._id}`}>Risk Per Trade (%)</Label>
                            <Input
                              id={`riskPercentage-${allocation._id}`}
                              type="number"
                              min="0.1"
                              max="50"
                              step="0.1"
                              value={allocation.riskPercentage}
                              onChange={(e) => {
                                const riskPercentage = parseFloat(e.target.value)
                                if (riskPercentage > 0 && riskPercentage <= 50) {
                                  updateAllocation(allocation._id, { riskPercentage })
                                }
                              }}
                              disabled={saving === allocation._id}
                            />
                            <p className="text-xs text-gray-500 mt-1">
                              Percentage of allocated amount to risk per trade
                            </p>
                          </div>
                        </div>

                        {/* Trading Hours */}
                        <div className="space-y-4">
                          <h4 className="font-medium text-gray-900">Trading Hours</h4>
                          
                          <div>
                            <Label htmlFor={`startTime-${allocation._id}`}>Start Time</Label>
                            <Input
                              id={`startTime-${allocation._id}`}
                              type="time"
                              value={allocation.enabledHours?.start || '09:15'}
                              onChange={(e) => {
                                updateAllocation(allocation._id, {
                                  enabledHours: {
                                    ...(allocation.enabledHours || { start: '09:15', end: '15:30' }),
                                    start: e.target.value
                                  }
                                })
                              }}
                              disabled={saving === allocation._id}
                            />
                          </div>

                          <div>
                            <Label htmlFor={`endTime-${allocation._id}`}>End Time</Label>
                            <Input
                              id={`endTime-${allocation._id}`}
                              type="time"
                              value={allocation.enabledHours?.end || '15:30'}
                              onChange={(e) => {
                                updateAllocation(allocation._id, {
                                  enabledHours: {
                                    ...(allocation.enabledHours || { start: '09:15', end: '15:30' }),
                                    end: e.target.value
                                  }
                                })
                              }}
                              disabled={saving === allocation._id}
                            />
                          </div>
                        </div>

                        {/* Performance Stats */}
                        <div className="space-y-4">
                          <h4 className="font-medium text-gray-900">Performance</h4>
                          
                          <div className="space-y-2">
                            <div className="flex justify-between text-sm">
                              <span className="text-gray-500">Today's Trades:</span>
                              <span className="font-medium">
                                {allocation.currentDayTrades || 0}/{allocation.maxTradesPerDay || 0}
                              </span>
                            </div>
                            
                            <div className="flex justify-between text-sm">
                              <span className="text-gray-500">Total Trades:</span>
                              <span className="font-medium">{allocation.totalTrades || 0}</span>
                            </div>
                            
                            <div className="flex justify-between text-sm">
                              <span className="text-gray-500">Success Rate:</span>
                              <span className="font-medium">
                                {getSuccessRate(allocation.totalTrades || 0, allocation.successfulTrades || 0)}%
                              </span>
                            </div>
                            
                            <div className="flex justify-between text-sm">
                              <span className="text-gray-500">Total P&L:</span>
                              <span className={`font-medium ${(allocation.totalPnl || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                ₹{(allocation.totalPnl || 0).toLocaleString('en-IN')}
                              </span>
                            </div>
                            
                            <div className="flex justify-between text-sm">
                              <span className="text-gray-500">Allocated Amount:</span>
                              <span className="font-medium">
                                ₹{(allocation.allocatedAmount || 0).toLocaleString('en-IN')}
                              </span>
                            </div>
                            
                            <div className="flex justify-between text-sm">
                              <span className="text-gray-500">Risk Per Trade:</span>
                              <span className="font-medium">
                                {allocation.riskPercentage || 0}%
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Available Bots */}
          <div>
            <h2 className="text-2xl font-bold mb-4">Available Bots</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {availableBots
                .filter(bot => !allocations.some(alloc => alloc.botId === bot._id))
                .map((bot) => (
                  <Card key={bot._id}>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Bot className="h-5 w-5" />
                        {bot.name || 'Unknown Bot'}
                      </CardTitle>
                      <CardDescription>
                        {bot.description || 'No description available'}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-gray-500">Strategy:</span>
                          <span className="text-sm font-medium">{bot.strategy || 'Unknown Strategy'}</span>
                        </div>
                        
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-gray-500">Risk Level:</span>
                          <Badge className={getRiskColor(bot.riskLevel)}>
                            {bot.riskLevel || 'Unknown'}
                          </Badge>
                        </div>
                        
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-gray-500">Market:</span>
                          <span className="text-sm font-medium">{bot.symbol || 'Unknown'} ({bot.exchange || 'Unknown'})</span>
                        </div>

                        <div className="flex justify-between items-center">
                          <span className="text-sm text-gray-500">Status:</span>
                          <div className="flex items-center gap-1">
                            {bot.emergencyStop && (
                              <AlertTriangle className="h-4 w-4 text-red-500" />
                            )}
                            <Badge variant={bot.isActive && !bot.emergencyStop ? 'default' : 'secondary'}>
                              {bot.emergencyStop ? 'Emergency Stop' : bot.isActive ? 'Active' : 'Inactive'}
                            </Badge>
                          </div>
                        </div>

                        <Button
                          className="w-full mt-4"
                          onClick={() => enableBot(bot._id)}
                          disabled={!bot.isActive || bot.emergencyStop || saving === bot._id}
                        >
                          <TrendingUp className="h-4 w-4 mr-2" />
                          {saving === bot._id ? 'Enabling...' : 'Enable Bot'}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
            </div>

            {availableBots.filter(bot => !allocations.some(alloc => alloc.botId === bot._id)).length === 0 && (
              <Card>
                <CardContent className="py-8 text-center">
                  <Settings className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No additional bots available</h3>
                  <p className="text-gray-500">All available bots are already configured</p>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Bot Configuration (Admin View) */}
          <div className="mt-8">
            <h2 className="text-2xl font-bold mb-4">Bot Configuration (Admin)</h2>
            <div className="space-y-4">
              {availableBots.map((bot) => (
                <Card key={`config-${bot._id}`}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="flex items-center gap-2">
                        <Settings className="h-5 w-5" />
                        {bot.name || 'Unknown Bot'} Configuration
                      </CardTitle>
                      <Badge className={getRiskColor(bot.riskLevel)}>
                        {bot.riskLevel || 'Unknown'} Risk
                      </Badge>
                    </div>
                    <CardDescription>
                      Configure trading type and auto-exit settings for {bot.strategy || 'this strategy'}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      {/* Trading Type Configuration */}
                      <div className="space-y-4">
                        <h4 className="font-medium text-gray-900">Trading Type</h4>
                        
                        <div>
                          <Label htmlFor={`tradingType-${bot._id}`}>Trading Type</Label>
                          <select
                            id={`tradingType-${bot._id}`}
                            value={bot.tradingType || 'INTRADAY'}
                            onChange={(e) => {
                              updateBotConfig(bot._id, { 
                                tradingType: e.target.value as 'INTRADAY' | 'POSITIONAL'
                              })
                            }}
                            disabled={saving === bot._id}
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                          >
                            <option value="INTRADAY">Intraday</option>
                            <option value="POSITIONAL">Positional</option>
                          </select>
                          <p className="text-xs text-gray-500 mt-1">
                            Intraday: Positions auto-close same day | Positional: Hold for multiple days
                          </p>
                        </div>

                        <div>
                          <Label>
                            <input
                              type="checkbox"
                              checked={bot.autoSquareOff || false}
                              onChange={(e) => {
                                updateBotConfig(bot._id, { autoSquareOff: e.target.checked })
                              }}
                              disabled={saving === bot._id}
                              className="mr-2"
                            />
                            Auto Square-off
                          </Label>
                          <p className="text-xs text-gray-500 mt-1">
                            Automatically close positions at scheduled time
                          </p>
                        </div>

                        <div>
                          <Label>
                            <input
                              type="checkbox"
                              checked={bot.allowMultiplePositions || false}
                              onChange={(e) => {
                                updateBotConfig(bot._id, { allowMultiplePositions: e.target.checked })
                              }}
                              disabled={saving === bot._id}
                              className="mr-2"
                            />
                            Allow Multiple Positions
                          </Label>
                          <p className="text-xs text-gray-500 mt-1">
                            Allow multiple open positions simultaneously
                          </p>
                        </div>
                      </div>

                      {/* Timing Configuration */}
                      <div className="space-y-4">
                        <h4 className="font-medium text-gray-900">Timing Settings</h4>
                        
                        <div>
                          <Label htmlFor={`exitTime-${bot._id}`}>
                            Intraday Exit Time
                          </Label>
                          <Input
                            id={`exitTime-${bot._id}`}
                            type="time"
                            value={bot.intradayExitTime || '15:15'}
                            onChange={(e) => {
                              updateBotConfig(bot._id, { intradayExitTime: e.target.value })
                            }}
                            disabled={saving === bot._id || bot.tradingType !== 'INTRADAY'}
                          />
                          <p className="text-xs text-gray-500 mt-1">
                            Time to auto-close intraday positions (24hr format)
                          </p>
                        </div>

                        <div>
                          <Label htmlFor={`holdDays-${bot._id}`}>
                            Max Position Hold Days
                          </Label>
                          <Input
                            id={`holdDays-${bot._id}`}
                            type="number"
                            min="1"
                            max="30"
                            value={bot.maxPositionHoldDays || 5}
                            onChange={(e) => {
                              const days = parseInt(e.target.value)
                              if (days > 0 && days <= 30) {
                                updateBotConfig(bot._id, { maxPositionHoldDays: days })
                              }
                            }}
                            disabled={saving === bot._id || bot.tradingType !== 'POSITIONAL'}
                          />
                          <p className="text-xs text-gray-500 mt-1">
                            Maximum days to hold positional trades
                          </p>
                        </div>
                      </div>

                      {/* Current Status */}
                      <div className="space-y-4">
                        <h4 className="font-medium text-gray-900">Current Settings</h4>
                        
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-gray-500">Type:</span>
                            <Badge variant={bot.tradingType === 'INTRADAY' ? 'default' : 'secondary'}>
                              {bot.tradingType}
                            </Badge>
                          </div>
                          
                          <div className="flex justify-between">
                            <span className="text-gray-500">Auto Exit:</span>
                            <span className={bot.autoSquareOff ? 'text-green-600' : 'text-gray-400'}>
                              {bot.autoSquareOff ? 'Enabled' : 'Disabled'}
                            </span>
                          </div>
                          
                          <div className="flex justify-between">
                            <span className="text-gray-500">Exit Time:</span>
                            <span className="font-medium">
                              {(bot.tradingType || 'INTRADAY') === 'INTRADAY' ? (bot.intradayExitTime || '15:15') : 'N/A'}
                            </span>
                          </div>
                          
                          <div className="flex justify-between">
                            <span className="text-gray-500">Multiple Positions:</span>
                            <span className={bot.allowMultiplePositions ? 'text-blue-600' : 'text-gray-400'}>
                              {bot.allowMultiplePositions ? 'Allowed' : 'Single Only'}
                            </span>
                          </div>
                          
                          <div className="flex justify-between">
                            <span className="text-gray-500">Max Hold:</span>
                            <span className="font-medium">
                              {(bot.tradingType || 'INTRADAY') === 'POSITIONAL' ? `${bot.maxPositionHoldDays || 5} days` : '1 day'}
                            </span>
                          </div>
                        </div>

                        {saving === bot._id && (
                          <div className="text-blue-600 text-sm">
                            Saving configuration...
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}