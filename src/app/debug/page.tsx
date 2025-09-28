'use client'

import { useSession } from 'next-auth/react'
import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

export default function DebugPage() {
  const { data: session, status } = useSession()
  const [bots, setBots] = useState([])
  const [allocations, setAllocations] = useState([])
  const [setupLoading, setSetupLoading] = useState(false)

  const handleSetup = async () => {
    setSetupLoading(true)
    try {
      const response = await fetch('/api/setup')
      const data = await response.json()
      
      if (response.ok) {
        alert(`Setup complete: ${data.message}`)
        fetchData()
      } else {
        alert(`Setup error: ${data.error}`)
      }
    } catch (error) {
      alert('Setup failed. Please try again.')
    } finally {
      setSetupLoading(false)
    }
  }

  const fetchData = async () => {
    try {
      const [botsRes, allocationsRes] = await Promise.all([
        fetch('/api/bots/available'),
        fetch('/api/bots/allocations')
      ])

      if (botsRes.ok) {
        const botsData = await botsRes.json()
        setBots(botsData.bots || [])
      }

      if (allocationsRes.ok) {
        const allocationsData = await allocationsRes.json()
        setAllocations(allocationsData.allocations || [])
      }
    } catch (error) {
      console.error('Error fetching data:', error)
    }
  }

  useEffect(() => {
    if (session) {
      fetchData()
    }
  }, [session])

  if (status === 'loading') {
    return <div className="flex justify-center items-center min-h-screen">Loading...</div>
  }

  if (!session) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Please sign in</h1>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-8">Debug Page - Bot Management</h1>
      
      <div className="space-y-6">
        {/* Setup Section */}
        <Card>
          <CardHeader>
            <CardTitle>Setup Database</CardTitle>
            <CardDescription>Initialize the database with sample bots</CardDescription>
          </CardHeader>
          <CardContent>
            <Button 
              onClick={handleSetup}
              disabled={setupLoading}
            >
              {setupLoading ? 'Setting up...' : 'Setup Sample Bots'}
            </Button>
          </CardContent>
        </Card>

        {/* Available Bots */}
        <Card>
          <CardHeader>
            <CardTitle>Available Bots ({bots.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {bots.length === 0 ? (
              <p className="text-gray-500">No bots found. Click "Setup Sample Bots" above.</p>
            ) : (
              <div className="space-y-2">
                {bots.map((bot: any) => (
                  <div key={bot._id} className="p-3 border rounded">
                    <div className="font-medium">{bot.name}</div>
                    <div className="text-sm text-gray-600">
                      Strategy: {bot.strategy} | Risk: {bot.riskLevel} | Active: {bot.isActive ? 'Yes' : 'No'}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* User Allocations */}
        <Card>
          <CardHeader>
            <CardTitle>Your Bot Allocations ({allocations.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {allocations.length === 0 ? (
              <p className="text-gray-500">No bot allocations yet.</p>
            ) : (
              <div className="space-y-2">
                {allocations.map((allocation: any) => (
                  <div key={allocation._id} className="p-3 border rounded">
                    <div className="font-medium">{allocation.botName}</div>
                    <div className="text-sm text-gray-600">
                      Quantity: {allocation.quantity} | Active: {allocation.isActive ? 'Yes' : 'No'}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-x-2">
              <Button onClick={fetchData} variant="outline">
                Refresh Data
              </Button>
              <Button asChild>
                <a href="/bots">Go to Bots Page</a>
              </Button>
              <Button asChild>
                <a href="/bots/manage">Go to Bot Management</a>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}