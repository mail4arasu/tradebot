'use client'

import { useSession } from 'next-auth/react'
import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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
}

interface AvailableBot {
  _id: string
  name: string
  description: string
  strategy: string
  riskLevel: string
  isActive: boolean
  emergencyStop: boolean
  tradingType: 'INTRADAY' | 'POSITIONAL'
}

export default function SimpleBotManagement() {
  const { data: session, status } = useSession()
  const [allocations, setAllocations] = useState<BotAllocation[]>([])
  const [availableBots, setAvailableBots] = useState<AvailableBot[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (session) {
      fetchData()
    }
  }, [session])

  const fetchData = async () => {
    try {
      setLoading(true)
      
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
              ← Back to Bots
            </Button>
          </Link>
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-gray-900">Simple Bot Management</h1>
            <p className="text-gray-600">Simplified version to test React rendering</p>
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
                      <CardTitle>
                        {String(allocation.botName) || 'Unknown Bot'}
                      </CardTitle>
                      <CardDescription>
                        Strategy: {String(allocation.botStrategy) || 'Unknown Strategy'}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        <p>Quantity: {String(allocation.quantity || 1)}</p>
                        <p>Max Trades/Day: {String(allocation.maxTradesPerDay || 1)}</p>
                        <p>Today's Trades: {String(allocation.currentDayTrades || 0)}</p>
                        <p>Status: {allocation.isActive ? 'Active' : 'Inactive'}</p>
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
              {availableBots.map((bot) => (
                <Card key={bot._id}>
                  <CardHeader>
                    <CardTitle>{String(bot.name) || 'Unknown Bot'}</CardTitle>
                    <CardDescription>{String(bot.description) || 'No description available'}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-500">Strategy:</span>
                        <span className="text-sm font-medium">{String(bot.strategy) || 'Unknown Strategy'}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-500">Trading Type:</span>
                        <Badge variant="default">
                          {String(bot.tradingType) || 'INTRADAY'}
                        </Badge>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-500">Status:</span>
                        <Badge variant={Boolean(bot.isActive) ? 'default' : 'secondary'}>
                          {Boolean(bot.isActive) ? 'Active' : 'Inactive'}
                        </Badge>
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