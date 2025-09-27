'use client'

import { useSession } from 'next-auth/react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Bot, Plus, Settings, TrendingUp, Webhook, Monitor } from 'lucide-react'
import Link from 'next/link'

export default function Bots() {
  const { data: session, status } = useSession()

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
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Create Bot
            </Button>
          </div>
        </div>
      </div>

      {/* Bot Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Nifty50 Futures Bot - New Active Bot */}
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
                <span className="text-gray-700">1 contract per 3 Lakhs capital</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Trades per day:</span>
                <span className="text-gray-700">1</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Trade Method:</span>
                <span className="text-gray-700">Tradingview Webhook</span>
              </div>
              <Link href="/bots/config">
                <Button className="w-full">
                  <Settings className="h-4 w-4 mr-2" />
                  Configure
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>

        <Card className="opacity-60">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Momentum Bot
            </CardTitle>
            <CardDescription>
              Automated momentum-based trading strategy
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span>Status:</span>
                <span className="text-gray-500">Development</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Strategy:</span>
                <span className="text-gray-500">Momentum</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Risk Level:</span>
                <span className="text-gray-500">Medium</span>
              </div>
              <Button className="w-full" disabled>
                <Settings className="h-4 w-4 mr-2" />
                Configure
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="opacity-60">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bot className="h-5 w-5" />
              Scalping Bot
            </CardTitle>
            <CardDescription>
              High-frequency scalping strategy
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span>Status:</span>
                <span className="text-gray-500">Development</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Strategy:</span>
                <span className="text-gray-500">Scalping</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Risk Level:</span>
                <span className="text-gray-500">High</span>
              </div>
              <Button className="w-full" disabled>
                <Settings className="h-4 w-4 mr-2" />
                Configure
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="opacity-60">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Mean Reversion Bot
            </CardTitle>
            <CardDescription>
              Counter-trend mean reversion strategy
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span>Status:</span>
                <span className="text-gray-500">Development</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Strategy:</span>
                <span className="text-gray-500">Mean Reversion</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Risk Level:</span>
                <span className="text-gray-500">Low</span>
              </div>
              <Button className="w-full" disabled>
                <Settings className="h-4 w-4 mr-2" />
                Configure
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Feature Request */}
      <Card className="mt-8">
        <CardHeader>
          <CardTitle>Request a Feature</CardTitle>
          <CardDescription>
            Have a specific trading strategy in mind? Let us know what you&apos;d like to see!
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-600 mb-4">
            We&apos;re building this platform based on trader feedback. Your input helps us prioritize which features to develop first.
          </p>
          <Button variant="outline">
            Submit Feature Request
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}