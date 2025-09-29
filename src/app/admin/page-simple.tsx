'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
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
    const colors: Record<string, string> = {
      active: 'bg-green-100 text-green-800',
      suspended: 'bg-red-100 text-red-800',
      restricted: 'bg-yellow-100 text-yellow-800'
    }
    return (
      <span className={`px-2 py-1 text-xs rounded ${colors[status] || 'bg-gray-100 text-gray-800'}`}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    )
  }

  const getRoleBadge = (role: string) => {
    return role === 'admin' ? 
      <span className="px-2 py-1 text-xs rounded bg-blue-100 text-blue-800">Admin</span> :
      <span className="px-2 py-1 text-xs rounded bg-gray-100 text-gray-800">User</span>
  }

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center">Loading admin dashboard...</div>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-8" style={{ backgroundColor: 'var(--background)', color: 'var(--foreground)' }}>
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-3xl font-bold mb-2" style={{ color: 'var(--foreground)' }}>Admin Dashboard</h1>
            <p style={{ color: 'var(--muted-foreground)' }}>Manage users and monitor platform statistics</p>
          </div>
          <Link href="/admin/trading">
            <button className="px-4 py-2 rounded transition-colors duration-200"
                    style={{
                      backgroundColor: 'var(--primary)',
                      color: 'var(--primary-foreground)'
                    }}>
              Trading Control
            </button>
          </Link>
        </div>
      </div>

      {/* Statistics Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="card p-6 rounded-lg shadow hover:shadow-lg transition-all duration-300"
               style={{ 
                 backgroundColor: 'var(--card)', 
                 borderColor: 'var(--border)',
                 color: 'var(--card-foreground)'
               }}>
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium" style={{ color: 'var(--muted-foreground)' }}>Total Users</div>
            </div>
            <div className="text-2xl font-bold mt-2" style={{ color: 'var(--foreground)' }}>{stats.totalUsers}</div>
          </div>

          <div className="card p-6 rounded-lg shadow hover:shadow-lg transition-all duration-300"
               style={{ 
                 backgroundColor: 'var(--card)', 
                 borderColor: 'var(--border)',
                 color: 'var(--card-foreground)'
               }}>
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium" style={{ color: 'var(--muted-foreground)' }}>Active Users</div>
            </div>
            <div className="text-2xl font-bold text-green-600 dark:text-green-400 mt-2">{stats.activeUsers}</div>
          </div>

          <div className="card p-6 rounded-lg shadow hover:shadow-lg transition-all duration-300"
               style={{ 
                 backgroundColor: 'var(--card)', 
                 borderColor: 'var(--border)',
                 color: 'var(--card-foreground)'
               }}>
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium" style={{ color: 'var(--muted-foreground)' }}>Suspended/Restricted</div>
            </div>
            <div className="text-2xl font-bold text-red-600 dark:text-red-400 mt-2">
              {stats.suspendedUsers + stats.restrictedUsers}
            </div>
          </div>

          <div className="card p-6 rounded-lg shadow hover:shadow-lg transition-all duration-300"
               style={{ 
                 backgroundColor: 'var(--card)', 
                 borderColor: 'var(--border)',
                 color: 'var(--card-foreground)'
               }}>
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium" style={{ color: 'var(--muted-foreground)' }}>Zerodha Connected</div>
            </div>
            <div className="text-2xl font-bold text-blue-600 dark:text-blue-400 mt-2">{stats.zerodhaConnectedUsers}</div>
          </div>
        </div>
      )}

      {/* User Management Table */}
      <div className="card rounded-lg shadow transition-all duration-300"
           style={{ 
             backgroundColor: 'var(--card)', 
             borderColor: 'var(--border)',
             color: 'var(--card-foreground)'
           }}>
        <div className="p-6 border-b" style={{ borderColor: 'var(--border)' }}>
          <h2 className="text-xl font-semibold" style={{ color: 'var(--foreground)' }}>User Management</h2>
          <p className="mt-1" style={{ color: 'var(--muted-foreground)' }}>View and manage all registered users</p>
        </div>
        <div className="p-6">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b" style={{ borderColor: 'var(--border)' }}>
                  <th className="text-left p-2" style={{ color: 'var(--foreground)' }}>User</th>
                  <th className="text-left p-2" style={{ color: 'var(--foreground)' }}>Role</th>
                  <th className="text-left p-2" style={{ color: 'var(--foreground)' }}>Status</th>
                  <th className="text-left p-2" style={{ color: 'var(--foreground)' }}>Zerodha</th>
                  <th className="text-left p-2" style={{ color: 'var(--foreground)' }}>Active Bots</th>
                  <th className="text-left p-2" style={{ color: 'var(--foreground)' }}>Joined</th>
                  <th className="text-left p-2" style={{ color: 'var(--foreground)' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user._id} className="border-b transition-colors duration-200" 
                      style={{ borderColor: 'var(--border)' }}>
                    <td className="p-2">
                      <div>
                        <div className="font-medium" style={{ color: 'var(--foreground)' }}>{user.name}</div>
                        <div className="text-xs" style={{ color: 'var(--muted-foreground)' }}>{user.email}</div>
                      </div>
                    </td>
                    <td className="p-2">{getRoleBadge(user.role)}</td>
                    <td className="p-2">{getStatusBadge(user.status)}</td>
                    <td className="p-2">
                      {user.zerodhaConfig?.isConnected ? 
                        <span className="px-2 py-1 text-xs rounded bg-green-100 text-green-800">Connected</span> :
                        <span className="px-2 py-1 text-xs rounded bg-gray-100 text-gray-800">Not Connected</span>
                      }
                    </td>
                    <td className="p-2">
                      {user.botAllocations && user.botAllocations.length > 0 ? (
                        <div className="space-y-1">
                          {user.botAllocations
                            .filter(bot => bot.isActive)
                            .map((bot, index) => (
                            <div key={index} className="text-xs">
                              <span className={bot.isActive ? "px-2 py-1 rounded bg-blue-100 text-blue-800" : "px-2 py-1 rounded bg-gray-100 text-gray-800"}>
                                {bot.botName}
                              </span>
                              <div className="text-gray-500">
                                ₹{bot.allocatedAmount.toLocaleString()} • {bot.strategy}
                              </div>
                            </div>
                          ))}
                          {user.botAllocations.filter(bot => bot.isActive).length === 0 && (
                            <span className="px-2 py-1 text-xs rounded bg-gray-100 text-gray-800">No Active Bots</span>
                          )}
                        </div>
                      ) : (
                        <span className="px-2 py-1 text-xs rounded bg-gray-100 text-gray-800">No Bots</span>
                      )}
                    </td>
                    <td className="p-2">
                      {new Date(user.createdAt).toLocaleDateString()}
                    </td>
                    <td className="p-2">
                      <div className="flex space-x-2">
                        <button
                          className="px-3 py-1 text-xs border rounded transition-colors duration-200 text-blue-600 border-blue-300 hover:bg-blue-50"
                          onClick={() => impersonateUser(user._id, user.email)}
                          disabled={impersonating === user._id || user.role === 'admin'}
                          title={user.role === 'admin' ? 'Cannot impersonate other admins' : 'Login as this user for troubleshooting'}
                        >
                          {impersonating === user._id ? 'Starting...' : 'Login as User'}
                        </button>
                        
                        {user.status === 'active' ? (
                          <button
                            className="px-3 py-1 text-xs border rounded transition-colors duration-200"
                            style={{
                              borderColor: 'var(--border)',
                              color: 'var(--foreground)',
                              backgroundColor: 'transparent'
                            }}
                            onClick={() => updateUserStatus(user._id, 'suspended')}
                          >
                            Suspend
                          </button>
                        ) : (
                          <button
                            className="px-3 py-1 text-xs border rounded transition-colors duration-200"
                            style={{
                              borderColor: 'var(--border)',
                              color: 'var(--foreground)',
                              backgroundColor: 'transparent'
                            }}
                            onClick={() => updateUserStatus(user._id, 'active')}
                          >
                            Activate
                          </button>
                        )}
                        <button
                          className="px-3 py-1 text-xs border rounded transition-colors duration-200 border-red-300 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                          onClick={() => deleteUser(user._id)}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex justify-between items-center mt-4">
            <div className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
              Page {currentPage} of {totalPages}
            </div>
            <div className="flex space-x-2">
              <button
                className="px-3 py-1 text-xs border rounded transition-colors duration-200"
                style={{
                  borderColor: 'var(--border)',
                  color: 'var(--foreground)',
                  backgroundColor: 'transparent'
                }}
                onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                disabled={currentPage === 1}
              >
                Previous
              </button>
              <button
                className="px-3 py-1 text-xs border rounded transition-colors duration-200"
                style={{
                  borderColor: 'var(--border)',
                  color: 'var(--foreground)',
                  backgroundColor: 'transparent'
                }}
                onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                disabled={currentPage === totalPages}
              >
                Next
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}