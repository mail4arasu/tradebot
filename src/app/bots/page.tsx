'use client'

import { useSession } from 'next-auth/react'
import { useState } from 'react'
import { useAdmin } from '@/hooks/useAdmin'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Bot, Plus, Settings, TrendingUp, Webhook, Monitor, Users, Target, Percent } from 'lucide-react'
import Link from 'next/link'

export default function Bots() {
  const { data: session, status } = useSession()
  const { isAdmin } = useAdmin()
  const [setupLoading, setSetupLoading] = useState(false)

  const handleSetup = async () => {
    setSetupLoading(true)
    try {
      const response = await fetch('/api/setup')
      const data = await response.json()
      
      if (response.ok) {
        alert(`Setup complete: ${data.message}`)
        window.location.reload()
      } else {
        alert(`Setup error: ${data.error}`)
      }
    } catch (error) {
      alert('Setup failed. Please try again.')
    } finally {
      setSetupLoading(false)
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
          <Link href="/dashboard">
            <Button variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Dashboard
            </Button>
          </Link>
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-gray-900">Trading Bots</h1>
            <p className="text-gray-600">Manage your automated trading strategies</p>
          </div>
          <div className="flex gap-2">
            <Link href="/bots/manage">
              <Button>
                <Users className="h-4 w-4 mr-2" />
                Manage Your Bots
              </Button>
            </Link>
            {isAdmin && (
              <>
                <Link href="/bots/webhooks">
                  <Button variant="outline">
                    <Webhook className="h-4 w-4 mr-2" />
                    Webhooks
                  </Button>
                </Link>
                <Link href="/bots/config">
                  <Button variant="outline">
                    <Settings className="h-4 w-4 mr-2" />
                    Configure
                  </Button>
                </Link>
                <Button 
                  variant="outline" 
                  onClick={handleSetup}
                  disabled={setupLoading}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  {setupLoading ? 'Setting up...' : 'Setup Bots'}
                </Button>
              </>
            )}
          </div>
        </div>
      </div>


      {/* Available Bots */}
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">Available Trading Bots</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Nifty50 Futures Bot - Active Bot */}
          <Card className="border-green-200 bg-green-50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-green-600" />
                Nifty50 Futures Bot
              </CardTitle>
              <CardDescription>
                Opening breakout strategy for Nifty50 futures
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span>Status:</span>
                  <span className="text-green-600 font-medium">Available</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Strategy:</span>
                  <span className="text-gray-700">Opening Breakout</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Risk Level:</span>
                  <span className="text-gray-700">Medium</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Market:</span>
                  <span className="text-gray-700">Nifty50 Futures</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Position Type:</span>
                  <span className="text-gray-700">Fixed Quantity</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Trade Method:</span>
                  <span className="text-gray-700">TradingView Webhook</span>
                </div>
                <Link href="/bots/manage">
                  <Button className="w-full bg-green-600 hover:bg-green-700">
                    <Users className="h-4 w-4 mr-2" />
                    Enable/Configure
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>

          {/* Nifty50 Options Bot - NEW */}
          <Card className="border-purple-200 bg-purple-50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Target className="h-5 w-5 text-purple-600" />
                Nifty50 Options Bot
                <span className="ml-auto">
                  <span className="bg-purple-600 text-white text-xs px-2 py-1 rounded-full">NEW</span>
                </span>
              </CardTitle>
              <CardDescription>
                Advanced options trading with dynamic strike selection
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span>Status:</span>
                  <span className="text-purple-600 font-medium">Available</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Strategy:</span>
                  <span className="text-gray-700">Options Delta Strategy</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Risk Level:</span>
                  <span className="text-gray-700">High</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Market:</span>
                  <span className="text-gray-700">Nifty Options</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Position Type:</span>
                  <span className="text-gray-700 flex items-center">
                    <Percent className="h-3 w-3 mr-1" />
                    Risk % Based
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Trade Method:</span>
                  <span className="text-gray-700">TradingView Webhook</span>
                </div>
                <div className="bg-purple-100 border border-purple-200 rounded-lg p-3 mb-3">
                  <p className="text-xs text-purple-700 font-medium mb-1">Advanced Features:</p>
                  <ul className="text-xs text-purple-600 space-y-1">
                    <li>• Dynamic strike selection</li>
                    <li>• Delta & OI analysis</li>
                    <li>• Smart expiry selection</li>
                    <li>• Risk % position sizing</li>
                  </ul>
                </div>
                <Link href="/bots/manage">
                  <Button className="w-full bg-purple-600 hover:bg-purple-700">
                    <Users className="h-4 w-4 mr-2" />
                    Enable/Configure
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Admin Quick Navigation */}
      {isAdmin && (
        <div className="grid grid-cols-1 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Webhook className="h-5 w-5" />
                Webhook Configuration
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-600 mb-4">
                Set up TradingView webhook integrations for automated trading
              </p>
              <Link href="/bots/webhooks">
                <Button className="w-full" variant="outline">Configure Webhooks</Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}