'use client'

import { useSession } from 'next-auth/react'
import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Bot, Plus, Settings, TrendingUp, Webhook, Monitor, Users } from 'lucide-react'
import Link from 'next/link'

export default function Bots() {
  const { data: session, status } = useSession()
  const [setupLoading, setSetupLoading] = useState(false)
  
  // Check if current user is admin
  const isAdmin = session?.user?.email === 'mail4arasu@gmail.com'

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
          <Link href="/auth/signin">
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

      {/* Main Action Card */}
      <Card className="mb-8 border-blue-200 bg-blue-50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-blue-900">
            <Users className="h-6 w-6" />
            Manage Your Trading Bots
          </CardTitle>
          <CardDescription className="text-blue-700">
            {isAdmin 
              ? "Enable/disable bots, set position sizes, configure trading hours, and monitor performance"
              : "Enable or disable trading bots and configure your position sizes and trading preferences"
            }
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
            <div className="flex-1">
              <p className="text-sm text-blue-800 mb-2">
                • Enable or disable any available trading bot
              </p>
              <p className="text-sm text-blue-800 mb-2">
                • Set your position quantities and daily trade limits
              </p>
              <p className="text-sm text-blue-800 mb-2">
                • Configure your trading hours and monitor performance
              </p>
            </div>
            <Link href="/bots/manage">
              <Button size="lg" className="bg-blue-600 hover:bg-blue-700">
                <Users className="h-5 w-5 mr-2" />
                Manage Your Bots
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>

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
                  <span>Trade Method:</span>
                  <span className="text-gray-700">TradingView Webhook</span>
                </div>
                <Link href="/bots/manage">
                  <Button className="w-full">
                    <Users className="h-4 w-4 mr-2" />
                    Enable/Configure
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}