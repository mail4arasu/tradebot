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
  zerodhaConnectedUsers: number
}

interface BotAllocation {
  botName: string
  strategy: string
  allocatedAmount: number
  isActive: boolean
}

interface User {
  _id: string
  name: string
  email: string
  role: 'user' | 'admin'
  status: 'active' | 'suspended' | 'restricted'
  createdAt: string
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
  
  // State variables
  const [stats, setStats] = useState<UserStats | null>(null)
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [actionLoading, setActionLoading] = useState<string>('')
  const [activeSection, setActiveSection] = useState('overview')
  const [expandedSections, setExpandedSections] = useState<string[]>(['trading'])

  // Authentication check
  useEffect(() => {
    if (status === 'loading') return
    if (!session) {
      router.push('/signin')
      return
    }
    loadData()
  }, [session, status, router, currentPage])

  const loadData = async () => {
    try {
      setLoading(true)
      
      // Load stats
      const statsRes = await fetch('/api/admin/users?action=stats')
      if (statsRes.ok) {
        const statsData = await statsRes.json()
        setStats(statsData)
      }

      // Load users
      const usersRes = await fetch(`/api/admin/users?page=${currentPage}&limit=10`)
      if (usersRes.ok) {
        const usersData: UserListResponse = await usersRes.json()
        setUsers(usersData.users || [])
        setTotalPages(usersData.pagination?.pages || 1)
      }
    } catch (error) {
      console.error('Error loading data:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleUserStatusChange = async (userId: string, newStatus: string) => {
    try {
      setActionLoading(userId)
      const response = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, action: 'updateStatus', status: newStatus })
      })

      if (response.ok) {
        await loadData()
        alert('User status updated successfully')
      } else {
        const error = await response.json()
        alert(`Error: ${error.error || 'Failed to update status'}`)
      }
    } catch (error) {
      console.error('Error updating user status:', error)
      alert('Error updating user status')
    } finally {
      setActionLoading('')
    }
  }

  const handleDeleteUser = async (userId: string, userEmail: string) => {
    if (!confirm(`Are you sure you want to delete user: ${userEmail}? This action cannot be undone.`)) {
      return
    }

    try {
      setActionLoading(userId)
      const response = await fetch('/api/admin/users', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId })
      })

      if (response.ok) {
        await loadData()
        alert('User deleted successfully')
      } else {
        const error = await response.json()
        alert(`Error: ${error.error || 'Failed to delete user'}`)
      }
    } catch (error) {
      console.error('Error deleting user:', error)
      alert('Error deleting user')
    } finally {
      setActionLoading('')
    }
  }

  const handleImpersonateUser = async (userId: string, userEmail: string) => {
    if (!confirm(`Login as ${userEmail}? This action will be logged.`)) {
      return
    }

    try {
      setActionLoading(userId)
      const response = await fetch('/api/admin/impersonate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUserId: userId })
      })

      const result = await response.json()

      if (response.ok) {
        alert(result.message + ' Redirecting to dashboard...')
        window.location.href = '/dashboard'
      } else {
        alert(`Error: ${result.error || 'Impersonation failed'}`)
      }
    } catch (error) {
      console.error('Error impersonating user:', error)
      alert('Error starting impersonation')
    } finally {
      setActionLoading('')
    }
  }

  const getStatusBadge = (status: string) => {
    // Add null/undefined check
    if (!status) return (
      <span className="px-2 py-1 text-xs rounded bg-gray-100 text-gray-800">
        Unknown
      </span>
    )
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
    // Add null/undefined check
    if (!role) return (
      <span className="px-2 py-1 text-xs rounded bg-gray-100 text-gray-800">
        Unknown
      </span>
    )
    
    return role === 'admin' ? 
      <span className="px-2 py-1 text-xs rounded bg-blue-100 text-blue-800">Admin</span> :
      <span className="px-2 py-1 text-xs rounded bg-gray-100 text-gray-800">User</span>
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-lg font-medium text-gray-900">Loading Admin Dashboard...</div>
          <div className="text-sm text-gray-500 mt-2">Please wait</div>
        </div>
      </div>
    )
  }

  const sidebarSections = [
    {
      id: 'overview',
      title: 'Overview',
      description: 'Platform statistics and overview'
    },
    {
      id: 'users',
      title: 'User Management',
      description: 'Manage users and their permissions'
    },
    {
      id: 'trading',
      title: 'Trading Management',
      isExpandable: true,
      subsections: [
        { id: 'trading-control', title: 'Trading Control', description: 'Emergency trading controls and system management' },
        { id: 'position-reconciliation', title: 'Position Reconciliation', description: 'Check and reconcile hanging positions' }
      ]
    },
    {
      id: 'scheduler',
      title: 'Scheduler & Automation',
      links: [
        { href: '/admin/intraday-scheduler', title: 'Scheduler Control' },
        { href: '/admin/scheduler-status', title: 'Scheduler Status' }
      ]
    },
    {
      id: 'data',
      title: 'Data & Reports',
      links: [
        { href: '/admin/data-sync', title: 'Data Sync' },
        { href: '/admin/daily-pnl-collector', title: 'Daily P&L Collector' },
        { href: '/admin/reports', title: 'Reports' },
        { href: '/admin/charges', title: 'Charges' }
      ]
    },
    {
      id: 'system',
      title: 'System Management',
      links: [
        { href: '/admin/announcements', title: 'Announcements' },
        { href: '/admin/cleanup', title: 'Cleanup' }
      ]
    }
  ]

  const renderOverviewContent = () => (
    <div>
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-900">Platform Overview</h2>
        <p className="mt-1 text-sm text-gray-600">Monitor platform statistics and key metrics</p>
      </div>

      {/* Statistics Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-500 truncate">Total Users</p>
                  <p className="text-2xl font-semibold text-gray-900">{stats.totalUsers || 0}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-500 truncate">Active Users</p>
                  <p className="text-2xl font-semibold text-green-600">{stats.activeUsers || 0}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-500 truncate">Suspended/Restricted</p>
                  <p className="text-2xl font-semibold text-red-600">
                    {(stats.suspendedUsers || 0) + (stats.restrictedUsers || 0)}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-500 truncate">Zerodha Connected</p>
                  <p className="text-2xl font-semibold text-blue-600">{stats.zerodhaConnectedUsers || 0}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )

  const renderTradingControlContent = () => (
    <div>
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-900">Trading Control</h2>
        <p className="mt-1 text-sm text-gray-600">Emergency trading controls and system management</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-lg border border-gray-200">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Emergency Controls</h3>
          <div className="space-y-3">
            <button className="w-full px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors">
              Emergency Stop All Trading
            </button>
            <button className="w-full px-4 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700 transition-colors">
              Emergency Square Off All Positions
            </button>
            <button className="w-full px-4 py-2 bg-yellow-600 text-white rounded-md hover:bg-yellow-700 transition-colors">
              Pause Auto-Exit Scheduler
            </button>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg border border-gray-200">
          <h3 className="text-lg font-medium text-gray-900 mb-4">System Status</h3>
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Trading Status</span>
              <span className="px-2 py-1 text-xs bg-green-100 text-green-800 rounded">Active</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Auto-Exit Scheduler</span>
              <span className="px-2 py-1 text-xs bg-green-100 text-green-800 rounded">Running</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Webhook Processing</span>
              <span className="px-2 py-1 text-xs bg-green-100 text-green-800 rounded">Active</span>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-8">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h4 className="text-sm font-medium text-blue-900 mb-2">Quick Actions</h4>
          <p className="text-sm text-blue-800 mb-3">For full trading control features, visit the dedicated page:</p>
          <a href="/admin/trading" 
             className="inline-flex items-center px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition-colors">
            Go to Full Trading Control
          </a>
        </div>
      </div>
    </div>
  )

  const renderPositionReconciliationContent = () => (
    <div>
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-900">Position Reconciliation</h2>
        <p className="mt-1 text-sm text-gray-600">Check and reconcile hanging positions with Zerodha</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white p-6 rounded-lg border border-gray-200 text-center">
          <div className="text-2xl font-bold text-gray-900">0</div>
          <div className="text-sm text-gray-600">Total Positions</div>
        </div>
        <div className="bg-white p-6 rounded-lg border border-gray-200 text-center">
          <div className="text-2xl font-bold text-green-600">0</div>
          <div className="text-sm text-gray-600">Keep Open</div>
        </div>
        <div className="bg-white p-6 rounded-lg border border-gray-200 text-center">
          <div className="text-2xl font-bold text-red-600">0</div>
          <div className="text-sm text-gray-600">Need Reconciliation</div>
        </div>
      </div>

      <div className="bg-white p-6 rounded-lg border border-gray-200">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Reconciliation Actions</h3>
        <div className="space-y-3">
          <button className="w-full md:w-auto px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors">
            Check Positions
          </button>
          <button className="w-full md:w-auto px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors ml-0 md:ml-3">
            Download Report
          </button>
        </div>
      </div>

      <div className="mt-8">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h4 className="text-sm font-medium text-blue-900 mb-2">Full Reconciliation Tools</h4>
          <p className="text-sm text-blue-800 mb-3">For complete position reconciliation features, visit the dedicated page:</p>
          <a href="/admin/position-reconciliation" 
             className="inline-flex items-center px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition-colors">
            Go to Full Position Reconciliation
          </a>
        </div>
      </div>
    </div>
  )

  const renderUserManagementContent = () => (
    <div>
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-900">User Management</h2>
        <p className="mt-1 text-sm text-gray-600">View and manage all registered users</p>
      </div>

      {/* User Management Table */}
      <div className="bg-white shadow overflow-hidden sm:rounded-md">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">User</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Role</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Zerodha</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Active Bots</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Joined</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {users.filter(user => user && user._id).map((user) => (
                <tr key={user._id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div>
                      <div className="text-sm font-medium text-gray-900">{String(user.name) || 'Unknown'}</div>
                      <div className="text-sm text-gray-500">{String(user.email) || 'Unknown'}</div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {getRoleBadge(user.role)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {getStatusBadge(user.status)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {user.zerodhaConfig?.isConnected ? (
                      <span className="px-2 py-1 text-xs rounded bg-green-100 text-green-800">Connected</span>
                    ) : (
                      <span className="px-2 py-1 text-xs rounded bg-gray-100 text-gray-800">Not Connected</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {(user.botAllocations || []).length > 0 ? (
                      <div className="space-y-1">
                        {(user.botAllocations || [])
                          .filter(bot => bot && bot.isActive === true)
                          .map((bot, index) => (
                            <div key={index} className="text-xs">
                              <span className="px-2 py-1 rounded bg-blue-100 text-blue-800">
                                {String(bot.botName) || 'Unknown Bot'}
                              </span>
                              <div className="text-gray-500">
                                ₹{(bot.allocatedAmount || 0).toLocaleString()} • {String(bot.strategy) || 'Unknown'}
                              </div>
                            </div>
                          ))}
                        {(user.botAllocations || []).filter(bot => bot && bot.isActive === true).length === 0 && (
                          <span className="px-2 py-1 text-xs rounded bg-gray-100 text-gray-800">No Active Bots</span>
                        )}
                      </div>
                    ) : (
                      <span className="px-2 py-1 text-xs rounded bg-gray-100 text-gray-800">No Bots</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'Unknown'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <div className="flex space-x-2">
                      <button
                        className="text-blue-600 hover:text-blue-900 disabled:opacity-50"
                        onClick={() => handleImpersonateUser(user._id, user.email || 'No email')}
                        disabled={actionLoading === user._id || user.role === 'admin'}
                        title={user.role === 'admin' ? 'Cannot impersonate other admins' : 'Login as this user'}
                      >
                        {actionLoading === user._id ? 'Loading...' : 'Login as User'}
                      </button>
                      
                      {user.status === 'active' ? (
                        <button
                          className="text-red-600 hover:text-red-900 disabled:opacity-50"
                          onClick={() => handleUserStatusChange(user._id, 'suspended')}
                          disabled={actionLoading === user._id}
                        >
                          Suspend
                        </button>
                      ) : (
                        <button
                          className="text-green-600 hover:text-green-900 disabled:opacity-50"
                          onClick={() => handleUserStatusChange(user._id, 'active')}
                          disabled={actionLoading === user._id}
                        >
                          Activate
                        </button>
                      )}
                      
                      <button
                        className="text-red-600 hover:text-red-900 disabled:opacity-50"
                        onClick={() => handleDeleteUser(user._id, user.email || 'No email')}
                        disabled={actionLoading === user._id}
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
        <div className="bg-white px-4 py-3 border-t border-gray-200 sm:px-6">
          <div className="flex justify-between items-center">
            <div className="text-sm text-gray-700">
              Page {currentPage} of {totalPages}
            </div>
            <div className="flex space-x-2">
              <button
                className="px-3 py-1 text-sm border border-gray-300 rounded-md bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                disabled={currentPage === 1}
              >
                Previous
              </button>
              <button
                className="px-3 py-1 text-sm border border-gray-300 rounded-md bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50"
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

  const renderExternalLinksContent = (section: any) => (
    <div>
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-900">{section.title}</h2>
        <p className="mt-1 text-sm text-gray-600">Quick access to {section.title.toLowerCase()} tools</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {section.links.map((link: any, index: number) => (
          <Link key={index} href={link.href} 
                className="block p-6 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
            <h3 className="text-lg font-medium text-gray-900">{link.title}</h3>
            <p className="mt-2 text-sm text-gray-600">Click to access {link.title.toLowerCase()}</p>
          </Link>
        ))}
      </div>
    </div>
  )

  const toggleSection = (sectionId: string) => {
    setExpandedSections(prev => 
      prev.includes(sectionId) 
        ? prev.filter(id => id !== sectionId)
        : [...prev, sectionId]
    )
  }

  const renderMainContent = () => {
    const section = sidebarSections.find(s => s.id === activeSection)
    
    if (activeSection === 'overview') {
      return renderOverviewContent()
    } else if (activeSection === 'users') {
      return renderUserManagementContent()
    } else if (activeSection === 'trading-control') {
      return renderTradingControlContent()
    } else if (activeSection === 'position-reconciliation') {
      return renderPositionReconciliationContent()
    } else if (section?.links) {
      return renderExternalLinksContent(section)
    }
    
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Section not found</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="flex">
        {/* Left Sidebar */}
        <div className="w-64 bg-white shadow-sm border-r border-gray-200 min-h-screen">
          <div className="p-6">
            <h1 className="text-xl font-bold text-gray-900">Admin Panel</h1>
            <p className="text-sm text-gray-600 mt-1">System management</p>
          </div>
          
          <nav className="px-3 pb-6">
            {sidebarSections.map((section) => (
              <div key={section.id} className="mb-1">
                {section.isExpandable ? (
                  <div>
                    <button
                      onClick={() => toggleSection(section.id)}
                      className="w-full text-left px-3 py-2 rounded-md text-sm font-medium transition-colors text-gray-700 hover:bg-gray-100 flex items-center justify-between"
                    >
                      <span>{section.title}</span>
                      <span className={`transform transition-transform ${expandedSections.includes(section.id) ? 'rotate-90' : ''}`}>
                        ▶
                      </span>
                    </button>
                    {expandedSections.includes(section.id) && section.subsections && (
                      <div className="ml-4 mt-1 space-y-1">
                        {section.subsections.map((subsection: any) => (
                          <button
                            key={subsection.id}
                            onClick={() => setActiveSection(subsection.id)}
                            className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                              activeSection === subsection.id
                                ? 'bg-blue-100 text-blue-900 border-r-2 border-blue-500'
                                : 'text-gray-600 hover:bg-gray-50'
                            }`}
                          >
                            {subsection.title}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <button
                    onClick={() => setActiveSection(section.id)}
                    className={`w-full text-left px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                      activeSection === section.id
                        ? 'bg-blue-100 text-blue-900 border-r-2 border-blue-500'
                        : 'text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    {section.title}
                  </button>
                )}
              </div>
            ))}
          </nav>
        </div>

        {/* Main Content */}
        <div className="flex-1 px-8 py-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <div className="text-lg font-medium text-gray-900">Loading...</div>
                <div className="text-sm text-gray-500 mt-2">Please wait</div>
              </div>
            </div>
          ) : (
            renderMainContent()
          )}
        </div>
      </div>
    </div>
  )
}