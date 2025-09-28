'use client'

import { useSession } from 'next-auth/react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Bot, Shield, TrendingUp, Zap, BarChart3, Users } from 'lucide-react'

export default function Home() {
  const { data: session } = useSession()

  if (session) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            Welcome back, {session.user?.name?.split(' ')[0]}!
          </h1>
          <p className="text-xl text-gray-600 mb-8">
            Ready to automate your trading?
          </p>
          <div className="flex justify-center space-x-4">
            <Link href="/dashboard">
              <Button size="lg" className="bg-blue-600 hover:bg-blue-700">
                Go to Dashboard
              </Button>
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="bg-gradient-to-r from-blue-600 to-purple-700 text-white py-20">
        <div className="container mx-auto px-4 text-center">
          <h1 className="text-5xl font-bold mb-6">
            Automate Your Trading with AI-Powered Bots
          </h1>
          <p className="text-xl mb-8 max-w-3xl mx-auto">
            Connect your Zerodha account, choose from multiple trading strategies, 
            and let our advanced algorithms trade for you 24/7.
          </p>
          <div className="space-x-4">
            <Link href="/signin">
              <Button size="lg" className="bg-white text-blue-600 hover:bg-gray-100">
                Get Started Free
              </Button>
            </Link>
            <Link href="#features">
              <Button size="lg" variant="outline" className="border-white text-white hover:bg-white hover:text-blue-600">
                Learn More
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 bg-white">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">
              Why Choose TradeBot Portal?
            </h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              Professional-grade trading automation with enterprise security and performance.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            <Card>
              <CardHeader>
                <Bot className="h-10 w-10 text-blue-600 mb-4" />
                <CardTitle>Multiple Trading Bots</CardTitle>
                <CardDescription>
                  Choose from various algorithmic strategies tailored for different market conditions.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card>
              <CardHeader>
                <Shield className="h-10 w-10 text-green-600 mb-4" />
                <CardTitle>Secure Zerodha Integration</CardTitle>
                <CardDescription>
                  Bank-grade encryption ensures your API keys and trading data remain secure.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card>
              <CardHeader>
                <TrendingUp className="h-10 w-10 text-purple-600 mb-4" />
                <CardTitle>Advanced Backtesting</CardTitle>
                <CardDescription>
                  Test strategies on historical data before committing real capital.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card>
              <CardHeader>
                <Zap className="h-10 w-10 text-yellow-600 mb-4" />
                <CardTitle>Real-time Execution</CardTitle>
                <CardDescription>
                  Lightning-fast order execution with minimal latency for optimal entry/exit.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card>
              <CardHeader>
                <BarChart3 className="h-10 w-10 text-red-600 mb-4" />
                <CardTitle>Detailed Analytics</CardTitle>
                <CardDescription>
                  Comprehensive trade analysis and performance metrics to track your success.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card>
              <CardHeader>
                <Users className="h-10 w-10 text-indigo-600 mb-4" />
                <CardTitle>Multi-account Support</CardTitle>
                <CardDescription>
                  Manage multiple trading accounts and strategies from a single dashboard.
                </CardDescription>
              </CardHeader>
            </Card>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-gray-50">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-4xl font-bold text-gray-900 mb-6">
            Ready to Start Automated Trading?
          </h2>
          <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
            Join thousands of traders who are already using our platform to maximize their profits.
          </p>
          <Link href="/signin">
            <Button size="lg" className="bg-blue-600 hover:bg-blue-700">
              Start Trading Now
            </Button>
          </Link>
        </div>
      </section>
    </div>
  )
}
