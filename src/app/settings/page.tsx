'use client'

import { useSession } from 'next-auth/react'
import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AlertCircle, CheckCircle, ExternalLink, Key, Shield, Link as LinkIcon, Clock, RefreshCw, Unlink } from 'lucide-react'

export default function Settings() {
  const { data: session, status } = useSession()
  const [apiKey, setApiKey] = useState('')
  const [apiSecret, setApiSecret] = useState('')
  const [isConnected, setIsConnected] = useState(false)
  const [hasCredentials, setHasCredentials] = useState(false)
  const [needsAuth, setNeedsAuth] = useState(false)
  const [balance, setBalance] = useState(0)
  const [loading, setLoading] = useState(false)
  const [testingConnection, setTestingConnection] = useState(false)
  const [authorizingOAuth, setAuthorizingOAuth] = useState(false)
  const [lastSync, setLastSync] = useState<Date | null>(null)
  const [needsDailyLogin, setNeedsDailyLogin] = useState(false)
  const [refreshingToken, setRefreshingToken] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)

  useEffect(() => {
    if (session) {
      fetchUserSettings()
    }
  }, [session])

  useEffect(() => {
    // Check for OAuth callback results
    const urlParams = new URLSearchParams(window.location.search)
    const success = urlParams.get('success')
    const error = urlParams.get('error')
    
    if (success === 'connected') {
      setIsConnected(true)
      setNeedsAuth(false)
      // Clean URL
      window.history.replaceState({}, document.title, window.location.pathname)
      fetchUserSettings()
    } else if (error) {
      console.error('OAuth error:', error)
      // Clean URL
      window.history.replaceState({}, document.title, window.location.pathname)
    }
  }, [])

  const fetchUserSettings = async () => {
    try {
      const response = await fetch('/api/user/profile')
      if (response.ok) {
        const data = await response.json()
        setIsConnected(data.zerodhaConfig?.isConnected || false)
        setBalance(data.zerodhaConfig?.balance || 0)
        setHasCredentials(!!(data.zerodhaConfig?.apiKey && data.zerodhaConfig?.apiSecret))
        
        // Check last sync time to determine if daily login is needed
        const lastSyncDate = data.zerodhaConfig?.lastSync ? new Date(data.zerodhaConfig.lastSync) : null
        setLastSync(lastSyncDate)
        
        // Check if token needs refresh based on 08:00 AM IST reset
        if (data.zerodhaConfig?.isConnected && lastSyncDate) {
          const now = new Date()
          const istNow = new Date(now.getTime() + (5.5 * 60 * 60 * 1000))
          
          // Create 08:00 AM IST today
          const today8AM = new Date(istNow)
          today8AM.setHours(8, 0, 0, 0)
          
          // If it's past 08:00 AM today and last sync was before today's 08:00 AM, need refresh
          const needsRefresh = istNow > today8AM && lastSyncDate < today8AM
          setNeedsDailyLogin(needsRefresh)
        } else {
          setNeedsDailyLogin(data.zerodhaConfig?.isConnected || false)
        }
        
        if (data.zerodhaConfig?.apiKey) {
          setApiKey('••••••••••••••••') // Masked for security
          setApiSecret('••••••••••••••••••••••••••••') // Masked for security
        }
      }
    } catch (error) {
      console.error('Error fetching user settings:', error)
    }
  }

  const handleSaveCredentials = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!apiKey.includes('•') && !apiSecret.includes('•')) {
      setLoading(true)

      try {
        const response = await fetch('/api/zerodha/configure', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ apiKey, apiSecret }),
        })

        const result = await response.json()

        if (response.ok) {
          setHasCredentials(true)
          setApiKey('••••••••••••••••')
          setApiSecret('••••••••••••••••••••••••••••')
          alert('Credentials saved successfully! Now proceed to authorize the connection.')
        } else {
          alert(result.error || 'Failed to save credentials')
        }
      } catch (error) {
        console.error('Error saving credentials:', error)
        alert('Error saving credentials')
      } finally {
        setLoading(false)
      }
    }
  }

  const handleAuthorizeOAuth = async () => {
    if (!hasCredentials) {
      alert('Please save your API credentials first.')
      return
    }

    setAuthorizingOAuth(true)
    try {
      const response = await fetch('/api/zerodha/auth-url', {
        method: 'POST'
      })
      
      const result = await response.json()
      
      if (response.ok) {
        // Redirect to Zerodha authorization
        window.location.href = result.loginUrl
      } else {
        alert(result.error || 'Failed to generate authorization URL')
        setAuthorizingOAuth(false)
      }
    } catch (error) {
      console.error('Error getting auth URL:', error)
      alert('Error getting authorization URL')
      setAuthorizingOAuth(false)
    }
  }

  const handleTestConnection = async () => {
    setTestingConnection(true)
    try {
      const response = await fetch('/api/zerodha/test-connection', {
        method: 'POST',
      })

      const result = await response.json()

      if (response.ok) {
        setIsConnected(true)
        setBalance(result.balance)
        alert(`Connection successful! Balance: ₹${result.balance}`)
      } else {
        if (result.needsAuth) {
          setNeedsAuth(true)
          alert('Please complete OAuth authorization first.')
        } else {
          alert(result.error || 'Connection failed')
        }
      }
    } catch (error) {
      console.error('Error testing connection:', error)
      alert('Error testing connection')
    } finally {
      setTestingConnection(false)
    }
  }

  const handleQuickTokenRefresh = async () => {
    try {
      setRefreshingToken(true)
      const response = await fetch('/api/zerodha/quick-refresh', {
        method: 'POST'
      })
      
      const result = await response.json()
      
      if (response.ok) {
        // Redirect to Zerodha for fresh token
        window.location.href = result.loginUrl
      } else {
        if (result.needsCredentials) {
          alert('Please configure your Zerodha credentials first.')
        } else {
          alert(result.error || 'Failed to refresh token')
        }
        setRefreshingToken(false)
      }
    } catch (error) {
      console.error('Error refreshing token:', error)
      alert('Error refreshing token')
      setRefreshingToken(false)
    }
  }

  const handleDisconnectZerodha = async () => {
    if (!confirm('Are you sure you want to disconnect your Zerodha account? This will stop all automated trading activities.')) {
      return
    }

    try {
      setDisconnecting(true)
      const response = await fetch('/api/zerodha/disconnect', {
        method: 'POST'
      })
      
      const result = await response.json()
      
      if (response.ok) {
        setIsConnected(false)
        setHasCredentials(false)
        setBalance(0)
        setNeedsDailyLogin(false)
        setLastSync(null)
        setApiKey('')
        setApiSecret('')
        alert('Zerodha account disconnected successfully!')
      } else {
        alert(result.error || 'Failed to disconnect account')
      }
    } catch (error) {
      console.error('Error disconnecting Zerodha:', error)
      alert('Error disconnecting account')
    } finally {
      setDisconnecting(false)
    }
  }

  if (status === 'loading') {
    return <div className="flex justify-center items-center min-h-screen">Loading...</div>
  }

  if (!session) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Please sign in to access settings</h1>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Settings</h1>
        <p className="text-gray-600">Configure your trading account and preferences</p>
      </div>

      {/* Zerodha API Configuration */}
      <Card className="mb-8">
        <CardHeader>
          <div className="flex items-center space-x-2">
            <Key className="h-5 w-5 text-blue-600" />
            <CardTitle>Zerodha API Configuration</CardTitle>
          </div>
          <CardDescription>
            Connect your Zerodha account to enable automated trading
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {/* Connection Status */}
            <div className="flex items-center space-x-2 p-4 rounded-lg bg-gray-50">
              {isConnected ? (
                <>
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  <div>
                    <p className="font-medium text-green-800">Connected</p>
                    <p className="text-sm text-green-600">Balance: ₹{balance.toLocaleString()}</p>
                  </div>
                </>
              ) : (
                <>
                  <AlertCircle className="h-5 w-5 text-yellow-600" />
                  <div>
                    <p className="font-medium text-yellow-800">
                      {needsAuth ? 'Authorization Required' : hasCredentials ? 'Authorization Pending' : 'Not Connected'}
                    </p>
                    <p className="text-sm text-yellow-600">
                      {!hasCredentials ? 'Please configure your API credentials' : 'Please complete OAuth authorization'}
                    </p>
                  </div>
                </>
              )}
            </div>

            {/* Daily Token Refresh Notification */}
            {isConnected && needsDailyLogin && (
              <div className="flex items-start space-x-3 p-4 rounded-lg bg-orange-50 border border-orange-200">
                <Clock className="h-5 w-5 text-orange-600 mt-0.5" />
                <div className="flex-1">
                  <p className="font-medium text-orange-800">Daily Token Refresh Required</p>
                  <p className="text-sm text-orange-600 mt-1">
                    Zerodha resets access tokens daily at 08:00 AM IST. Your token {lastSync ? 
                      `was last refreshed on ${lastSync.toLocaleDateString()} at ${lastSync.toLocaleTimeString()}` : 
                      'needs to be refreshed'} to continue automated trading.
                  </p>
                  <div className="mt-3">
                    <Button 
                      onClick={handleQuickTokenRefresh}
                      disabled={refreshingToken}
                      size="sm"
                      className="bg-orange-600 hover:bg-orange-700 text-white font-semibold px-4 py-2 rounded-md shadow-md hover:shadow-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <RefreshCw className={`h-4 w-4 mr-2 ${refreshingToken ? 'animate-spin' : ''}`} />
                      {refreshingToken ? 'Redirecting...' : 'Quick Token Refresh'}
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* API Credentials Form */}
            <form onSubmit={handleSaveCredentials} className="space-y-4">
              <div>
                <Label htmlFor="apiKey">API Key</Label>
                <Input
                  id="apiKey"
                  type="text"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="Enter your Zerodha API Key"
                  required
                />
              </div>

              <div>
                <Label htmlFor="apiSecret">API Secret</Label>
                <Input
                  id="apiSecret"
                  type="password"
                  value={apiSecret}
                  onChange={(e) => setApiSecret(e.target.value)}
                  placeholder="Enter your Zerodha API Secret"
                  required
                />
              </div>

              <div className="flex space-x-4">
                <Button 
                  type="submit" 
                  disabled={loading || (apiKey.includes('•') && apiSecret.includes('•'))}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-2 rounded-md shadow-md hover:shadow-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
                >
                  <Key className="h-4 w-4" />
                  <span>{loading ? 'Saving...' : 'Save Credentials'}</span>
                </Button>

                {hasCredentials && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleAuthorizeOAuth}
                    disabled={authorizingOAuth || isConnected}
                    className="border-2 border-green-600 text-green-600 hover:bg-green-600 hover:text-white font-semibold px-6 py-2 rounded-md shadow-md hover:shadow-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
                  >
                    <LinkIcon className="h-4 w-4" />
                    <span>{authorizingOAuth ? 'Redirecting...' : 'Authorize Connection'}</span>
                  </Button>
                )}

                {isConnected && (
                  <>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={handleTestConnection}
                      disabled={testingConnection}
                      className="bg-gray-600 hover:bg-gray-700 text-white font-semibold px-6 py-2 rounded-md shadow-md hover:shadow-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {testingConnection ? 'Testing...' : 'Test Connection'}
                    </Button>
                    
                    <Button
                      type="button"
                      variant="destructive"
                      onClick={handleDisconnectZerodha}
                      disabled={disconnecting}
                      className="bg-red-600 hover:bg-red-700 text-white font-semibold px-6 py-2 rounded-md shadow-md hover:shadow-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
                    >
                      <Unlink className="h-4 w-4" />
                      <span>{disconnecting ? 'Disconnecting...' : 'Disconnect'}</span>
                    </Button>
                  </>
                )}
              </div>
            </form>
          </div>
        </CardContent>
      </Card>

      {/* Instructions */}
      <Card>
        <CardHeader>
          <div className="flex items-center space-x-2">
            <Shield className="h-5 w-5 text-green-600" />
            <CardTitle>How to Connect Your Zerodha Account</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4 text-sm">
            <div className="space-y-2">
              <h4 className="font-medium">Step 1: Create a Zerodha Developer Account</h4>
              <p className="text-gray-600">
                Visit the Zerodha Developer Console and create an account if you haven't already.
              </p>
              <a
                href="https://developers.kite.trade/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center space-x-1 text-blue-600 hover:text-blue-800"
              >
                <span>Visit Zerodha Developers</span>
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>

            <div className="space-y-2">
              <h4 className="font-medium">Step 2: Create a New App</h4>
              <ul className="list-disc pl-5 space-y-1 text-gray-600">
                <li>Click on "Create New App" in your developer dashboard</li>
                <li>Choose "Connect" as the app type</li>
                <li>Enter app name: "TradeBot Portal"</li>
                <li>Set redirect URL to: <code className="bg-gray-100 px-1 rounded">https://niveshawealth.in/api/zerodha/callback</code></li>
              </ul>
            </div>

            <div className="space-y-2">
              <h4 className="font-medium">Step 3: Get Your Credentials & Authorize</h4>
              <p className="text-gray-600">
                After creating the app, you'll receive your API Key and API Secret. Enter them above and click "Authorize Connection" to complete the OAuth flow.
              </p>
            </div>

            <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <div className="flex items-start space-x-2">
                <AlertCircle className="h-4 w-4 text-yellow-600 mt-0.5" />
                <div className="text-sm text-yellow-800">
                  <p className="font-medium">Important Security Notes:</p>
                  <ul className="list-disc pl-5 mt-1 space-y-1">
                    <li>Your API credentials are encrypted and stored securely</li>
                    <li>Never share your API secret with anyone</li>
                    <li>You can revoke access from your Zerodha developer console anytime</li>
                    <li>OAuth authorization is required for secure API access</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}