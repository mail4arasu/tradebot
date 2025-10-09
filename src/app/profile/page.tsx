'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

interface UserProfile {
  name: string
  email: string
  role: string
  status: string
  lastLoginAt?: string
  createdAt: string
  lastPasswordReset?: string
  zerodhaConfig?: {
    isConnected: boolean
    balance?: number
    lastSync?: string
  }
}

export default function ProfilePage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  
  // Password change form
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordLoading, setPasswordLoading] = useState(false)
  const [passwordError, setPasswordError] = useState('')
  const [passwordSuccess, setPasswordSuccess] = useState('')

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/signin')
      return
    }

    if (status === 'authenticated') {
      fetchProfile()
    }
  }, [status, router])

  const fetchProfile = async () => {
    try {
      const response = await fetch('/api/user/profile')
      if (response.ok) {
        const data = await response.json()
        setProfile(data)
      } else {
        setError('Failed to load profile')
      }
    } catch (error) {
      console.error('Error fetching profile:', error)
      setError('Network error')
    } finally {
      setLoading(false)
    }
  }

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!currentPassword || !newPassword || !confirmPassword) {
      setPasswordError('All password fields are required')
      return
    }

    if (newPassword !== confirmPassword) {
      setPasswordError('New passwords do not match')
      return
    }

    if (newPassword.length < 8) {
      setPasswordError('New password must be at least 8 characters long')
      return
    }

    setPasswordLoading(true)
    setPasswordError('')
    setPasswordSuccess('')

    try {
      const response = await fetch('/api/user/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          currentPassword,
          newPassword,
          confirmPassword
        }),
      })

      const data = await response.json()

      if (response.ok) {
        setPasswordSuccess(data.message)
        setPasswordError('')
        
        // Clear form
        setCurrentPassword('')
        setNewPassword('')
        setConfirmPassword('')
        
        // Refresh profile to update lastPasswordReset
        fetchProfile()
      } else {
        setPasswordError(data.error || 'Failed to change password')
        setPasswordSuccess('')
      }
    } catch (error) {
      console.error('Password change error:', error)
      setPasswordError('Network error. Please try again.')
      setPasswordSuccess('')
    } finally {
      setPasswordLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-red-600">{error}</p>
              <Button onClick={() => router.push('/dashboard')} className="mt-4">
                Back to Dashboard
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div className="flex items-center">
              <h1 className="text-2xl font-bold text-gray-900">User Profile</h1>
            </div>
            <Button 
              variant="outline" 
              onClick={() => router.push('/dashboard')}
            >
              Back to Dashboard
            </Button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        <Tabs defaultValue="profile" className="space-y-6">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="profile">Profile Information</TabsTrigger>
            <TabsTrigger value="security">Security & Password</TabsTrigger>
          </TabsList>

          {/* Profile Information Tab */}
          <TabsContent value="profile" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Account Information</CardTitle>
                <CardDescription>
                  Your account details and status
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label>Full Name</Label>
                    <div className="text-lg font-medium">{profile?.name || 'Not provided'}</div>
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Email Address</Label>
                    <div className="text-lg">{profile?.email}</div>
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Account Role</Label>
                    <Badge variant={profile?.role === 'admin' ? 'default' : 'secondary'}>
                      {profile?.role?.toUpperCase()}
                    </Badge>
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Account Status</Label>
                    <Badge variant={profile?.status === 'active' ? 'default' : 'destructive'}>
                      {profile?.status?.toUpperCase()}
                    </Badge>
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Zerodha Integration</Label>
                    <Badge variant={profile?.zerodhaConfig?.isConnected ? 'default' : 'outline'}>
                      {profile?.zerodhaConfig?.isConnected ? 'Connected' : 'Not Connected'}
                    </Badge>
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Member Since</Label>
                    <div>{profile?.createdAt ? new Date(profile.createdAt).toLocaleDateString() : 'Unknown'}</div>
                  </div>
                </div>

                {profile?.lastLoginAt && (
                  <div className="pt-4 border-t">
                    <div className="space-y-2">
                      <Label>Last Login</Label>
                      <div className="text-sm text-gray-600">
                        {new Date(profile.lastLoginAt).toLocaleString()}
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Security & Password Tab */}
          <TabsContent value="security" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Change Password</CardTitle>
                <CardDescription>
                  Update your password to keep your account secure
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handlePasswordChange} className="space-y-6">
                  <div className="space-y-2">
                    <Label htmlFor="currentPassword">Current Password</Label>
                    <Input
                      id="currentPassword"
                      type="password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="Enter your current password"
                      required
                      disabled={passwordLoading}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="newPassword">New Password</Label>
                    <Input
                      id="newPassword"
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Enter your new password"
                      required
                      disabled={passwordLoading}
                      minLength={8}
                    />
                    <p className="text-xs text-gray-500">
                      Password must be at least 8 characters long
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="confirmPassword">Confirm New Password</Label>
                    <Input
                      id="confirmPassword"
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Confirm your new password"
                      required
                      disabled={passwordLoading}
                    />
                  </div>

                  {passwordError && (
                    <div className="bg-red-50 border border-red-200 rounded-md p-4">
                      <p className="text-sm text-red-800">{passwordError}</p>
                    </div>
                  )}

                  {passwordSuccess && (
                    <div className="bg-green-50 border border-green-200 rounded-md p-4">
                      <p className="text-sm text-green-800">{passwordSuccess}</p>
                    </div>
                  )}

                  <Button 
                    type="submit" 
                    disabled={passwordLoading || !currentPassword || !newPassword || !confirmPassword}
                    className="w-full md:w-auto"
                  >
                    {passwordLoading ? (
                      <div className="flex items-center">
                        <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Changing Password...
                      </div>
                    ) : (
                      'Change Password'
                    )}
                  </Button>
                </form>

                {profile?.lastPasswordReset && (
                  <div className="mt-6 pt-6 border-t">
                    <div className="space-y-2">
                      <Label>Last Password Change</Label>
                      <div className="text-sm text-gray-600">
                        {new Date(profile.lastPasswordReset).toLocaleString()}
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Security Information</CardTitle>
                <CardDescription>
                  Keep your account secure with these best practices
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-start space-x-3">
                    <svg className="w-5 h-5 text-green-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                    </svg>
                    <div>
                      <h4 className="font-medium">Use Strong Passwords</h4>
                      <p className="text-sm text-gray-600">Use at least 8 characters with a mix of letters, numbers, and symbols</p>
                    </div>
                  </div>
                  
                  <div className="flex items-start space-x-3">
                    <svg className="w-5 h-5 text-green-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                    </svg>
                    <div>
                      <h4 className="font-medium">Regular Password Updates</h4>
                      <p className="text-sm text-gray-600">Change your password regularly, especially if you suspect it may be compromised</p>
                    </div>
                  </div>
                  
                  <div className="flex items-start space-x-3">
                    <svg className="w-5 h-5 text-green-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                    </svg>
                    <div>
                      <h4 className="font-medium">Secure Your Zerodha Credentials</h4>
                      <p className="text-sm text-gray-600">Keep your API keys secure and never share them with anyone</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}