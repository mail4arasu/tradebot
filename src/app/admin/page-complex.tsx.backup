'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Users, UserCheck, UserX, Shield, Activity, Calendar, Bot, TrendingUp, LogIn } from 'lucide-react'
import Link from 'next/link'

interface UserStats {
  totalUsers: number
  activeUsers: number
  suspendedUsers: number
  restrictedUsers: number
  adminUsers: number
  recentRegistrations: number
  zerodhaConnectedUsers: number
}

interface BotAllocation {
  botName: string
  strategy: string
  allocatedAmount: number
  isActive: boolean
  totalPnl: number
}

interface User {
  _id: string
  name: string
  email: string
  role: 'user' | 'admin'
  status: 'active' | 'suspended' | 'restricted'
  createdAt: string
  lastLoginAt?: string
  zerodhaConfig?: {
    isConnected: boolean
  }
  botAllocations?: BotAllocation[]
}

interface UserListResponse {
  users: User[]
  pagination: {
    page: number
    limit: number
    total: number
    pages: number
  }
}

export default function AdminDashboard() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [stats, setStats] = useState<UserStats | null>(null)
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [impersonating, setImpersonating] = useState<string | null>(null)

  useEffect(() => {
    if (status === 'loading') return
    if (!session) {
      router.push('/signin')
      return
    }
    
    fetchData()
  }, [session, status, router, currentPage])

  const fetchData = async () => {
    try {
      setLoading(true)
      
      // Fetch stats
      const statsResponse = await fetch('/api/admin/users?action=stats')
      if (statsResponse.ok) {
        const statsData = await statsResponse.json()
        setStats(statsData)
      }

      // Fetch users
      const usersResponse = await fetch(`/api/admin/users?page=${currentPage}&limit=10`)
      if (usersResponse.ok) {
        const usersData: UserListResponse = await usersResponse.json()
        setUsers(usersData.users)
        setTotalPages(usersData.pagination.pages)
      }
    } catch (error) {
      console.error('Error fetching admin data:', error)
    } finally {
      setLoading(false)
    }
  }

  const updateUserStatus = async (userId: string, status: string) => {
    try {
      const response = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, action: 'updateStatus', status })
      })

      if (response.ok) {
        fetchData() // Refresh data
      } else {
        const error = await response.json()
        alert(`Error: ${error.error}`)
      }
    } catch (error) {
      console.error('Error updating user status:', error)
      alert('Error updating user status')
    }
  }

  const deleteUser = async (userId: string) => {
    if (!confirm('Are you sure you want to delete this user? This action cannot be undone.')) {
      return
    }

    try {
      const response = await fetch('/api/admin/users', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId })
      })

      if (response.ok) {
        fetchData() // Refresh data
      } else {
        const error = await response.json()
        alert(`Error: ${error.error}`)
      }
    } catch (error) {
      console.error('Error deleting user:', error)
      alert('Error deleting user')
    }
  }

  const impersonateUser = async (userId: string, userEmail: string) => {
    if (!confirm(`Are you sure you want to login as ${userEmail}? This action will be logged for audit purposes.`)) {
      return
    }

    try {
      setImpersonating(userId)
      const response = await fetch('/api/admin/impersonate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUserId: userId })
      })

      const result = await response.json()

      if (response.ok) {
        alert(result.message + '\n\nRedirecting to dashboard...')
        // Redirect to dashboard to see the user's view
        window.location.href = '/dashboard'
      } else {
        alert(`Error: ${result.error}`)
      }
    } catch (error) {
      console.error('Error impersonating user:', error)
      alert('Error starting impersonation')
    } finally {
      setImpersonating(null)
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge className="bg-green-100 text-green-800">Active</Badge>
      case 'suspended':
        return <Badge className="bg-red-100 text-red-800">Suspended</Badge>
      case 'restricted':
        return <Badge className="bg-yellow-100 text-yellow-800">Restricted</Badge>
      default:
        return <Badge className="bg-gray-100 text-gray-800">{status}</Badge>
    }
  }

  const getRoleBadge = (role: string) => {
    return role === 'admin' ? 
      <Badge className="bg-blue-100 text-blue-800">Admin</Badge> :
      <Badge className="bg-gray-100 text-gray-800">User</Badge>
  }

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center">Loading admin dashboard...</div>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Admin Dashboard</h1>
            <p className="text-gray-600">Manage users and monitor platform statistics</p>
          </div>
          <Link href="/admin/trading">
            <Button className="bg-blue-600 hover:bg-blue-700">
              <Bot className="h-4 w-4 mr-2" />
              Trading Control
            </Button>
          </Link>
        </div>
      </div>

      {/* Statistics Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Users</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalUsers}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Users</CardTitle>
              <UserCheck className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{stats.activeUsers}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Suspended/Restricted</CardTitle>
              <UserX className="h-4 w-4 text-red-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">
                {stats.suspendedUsers + stats.restrictedUsers}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Zerodha Connected</CardTitle>
              <Activity className="h-4 w-4 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">{stats.zerodhaConnectedUsers}</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* User Management Table */}
      <Card>
        <CardHeader>
          <CardTitle>User Management</CardTitle>
          <CardDescription>
            View and manage all registered users
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-2">User</th>
                  <th className="text-left p-2">Role</th>
                  <th className="text-left p-2">Status</th>
                  <th className="text-left p-2">Zerodha</th>
                  <th className="text-left p-2">Active Bots</th>
                  <th className="text-left p-2">Joined</th>
                  <th className="text-left p-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user._id} className="border-b hover:bg-gray-50">
                    <td className="p-2">
                      <div>
                        <div className="font-medium">{user.name}</div>
                        <div className="text-gray-500 text-xs">{user.email}</div>
                      </div>
                    </td>
                    <td className="p-2">{getRoleBadge(user.role)}</td>
                    <td className="p-2">{getStatusBadge(user.status)}</td>
                    <td className="p-2">
                      {user.zerodhaConfig?.isConnected ? 
                        <Badge className="bg-green-100 text-green-800">Connected</Badge> :
                        <Badge className="bg-gray-100 text-gray-800">Not Connected</Badge>
                      }
                    </td>
                    <td className="p-2">
                      {user.botAllocations && user.botAllocations.length > 0 ? (
                        <div className="space-y-1">
                          {user.botAllocations
                            .filter(bot => bot.isActive)
                            .map((bot, index) => (
                            <div key={index} className="text-xs">
                              <Badge className={bot.isActive ? "bg-blue-100 text-blue-800" : "bg-gray-100 text-gray-800"}>
                                {bot.botName}
                              </Badge>
                              <div className="text-gray-500">
                                ₹{bot.allocatedAmount.toLocaleString()} • {bot.strategy}
                              </div>
                            </div>
                          ))}
                          {user.botAllocations.filter(bot => bot.isActive).length === 0 && (
                            <Badge className="bg-gray-100 text-gray-800">No Active Bots</Badge>
                          )}
                        </div>
                      ) : (
                        <Badge className="bg-gray-100 text-gray-800">No Bots</Badge>
                      )}
                    </td>
                    <td className="p-2">
                      {new Date(user.createdAt).toLocaleDateString()}
                    </td>
                    <td className="p-2">
                      <div className="flex space-x-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-xs text-blue-600 border-blue-300 hover:bg-blue-50"
                          onClick={() => impersonateUser(user._id, user.email)}
                          disabled={impersonating === user._id || user.role === 'admin'}
                          title={user.role === 'admin' ? 'Cannot impersonate other admins' : 'Login as this user for troubleshooting'}
                        >
                          <LogIn className="h-3 w-3 mr-1" />
                          {impersonating === user._id ? 'Starting...' : 'Login as User'}
                        </Button>
                        
                        {user.status === 'active' ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-xs"
                            onClick={() => updateUserStatus(user._id, 'suspended')}
                          >
                            Suspend
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-xs"
                            onClick={() => updateUserStatus(user._id, 'active')}
                          >
                            Activate
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-xs text-red-600 border-red-300 hover:bg-red-50"
                          onClick={() => deleteUser(user._id)}
                        >
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex justify-between items-center mt-4">
            <div className="text-sm text-gray-600">
              Page {currentPage} of {totalPages}
            </div>
            <div className="flex space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                disabled={currentPage === 1}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                disabled={currentPage === totalPages}
              >
                Next
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}