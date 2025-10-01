'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import Link from 'next/link'

interface ZerodhaStatusResult {
  user: {
    email: string
    name: string
    hasZerodhaConfig: boolean
    hasApiKey: boolean
    hasApiSecret: boolean
    hasAccessToken: boolean
    isConnected: boolean
    balance: number
    lastSync?: string
  }
  status: {
    status: string
    message: string
    canTrade: boolean
    needsAuth: boolean
  }
}

export default function ZerodhaNotifications() {
  const { data: session } = useSession()
  const [statusData, setStatusData] = useState<ZerodhaStatusResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [sessionDismissed, setSessionDismissed] = useState(false)

  useEffect(() => {
    if (session?.user) {
      // Reset session dismissal when user signs in
      setSessionDismissed(false)
      // Add delay to ensure page content loads first
      setTimeout(() => {
        checkStatus()
      }, 1000)
    } else {
      // Reset everything when user signs out
      setShowModal(false)
      setSessionDismissed(false)
      setStatusData(null)
    }
  }, [session])

  const checkStatus = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/debug/status')
      
      if (response.ok) {
        const result = await response.json()
        setStatusData(result)
        
        // Show modal if notification is needed and not dismissed in this session
        if (!result.status.canTrade && !sessionDismissed) {
          setTimeout(() => {
            setShowModal(true)
          }, 500)
        }
      } else {
        console.error('Failed to check Zerodha status:', response.status)
      }
    } catch (error) {
      console.error('Error checking Zerodha status:', error)
    } finally {
      setLoading(false)
    }
  }

  const dismissNotification = () => {
    setShowModal(false)
    setSessionDismissed(true)
  }

  const getNotificationContent = () => {
    if (!statusData) return null

    const { user, status } = statusData

    switch (status.status) {
      case 'NOT_CONFIGURED':
        return {
          title: '🔑 Complete Zerodha Integration',
          message: 'Set up your Zerodha API keys to start automated trading with our bots and unlock the full potential of our trading platform.',
          buttonText: 'Setup Zerodha',
          buttonLink: '/settings',
          icon: '🔑',
          urgency: 'setup'
        }

      case 'KEYS_STORED':
        return {
          title: '🔐 Authorize Zerodha Access',
          message: 'Your API keys are configured! Complete the authorization process to activate automated trading.',
          buttonText: 'Authorize Now',
          buttonLink: '/settings',
          icon: '🔐',
          urgency: 'auth'
        }

      case 'TOKEN_EXPIRED':
        return {
          title: '🔄 Reauthorize Zerodha',
          message: 'Your Zerodha access has expired. Please reauthorize to continue using automated trading features.',
          buttonText: 'Reauthorize',
          buttonLink: '/settings',
          icon: '🔄',
          urgency: 'expired'
        }

      case 'ERROR':
        return {
          title: '⚠️ Connection Issue',
          message: 'There seems to be an issue with your Zerodha connection. Please check your settings.',
          buttonText: 'Check Settings',
          buttonLink: '/settings',
          icon: '⚠️',
          urgency: 'error'
        }

      default:
        return null
    }
  }

  // Don't render anything if user is not logged in
  if (!session?.user) {
    return null
  }

  // Don't show modal if conditions not met
  if (!showModal || !statusData || statusData.status.canTrade || sessionDismissed) {
    return null
  }

  const notification = getNotificationContent()
  if (!notification) return null

  return (
    <>
      {/* Light overlay */}
      <div 
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        style={{
          backgroundColor: 'rgba(0, 0, 0, 0.1)'
        }}
        onClick={dismissNotification}
      >
        {/* Modal Content */}
        <div 
          className="bg-white rounded-xl max-w-md w-full p-6 transform transition-all duration-300"
          style={{
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
            animation: 'slideInFromTop 0.4s ease-out'
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center">
              <span className="text-2xl mr-3">{notification.icon}</span>
              <h3 className="text-lg font-semibold text-gray-900">
                {notification.title}
              </h3>
            </div>
            <button 
              onClick={dismissNotification}
              className="text-gray-400 hover:text-gray-600 text-xl font-bold w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
              title="Dismiss"
            >
              ×
            </button>
          </div>

          {/* Message */}
          <p className="text-gray-600 mb-6 leading-relaxed">
            {notification.message}
          </p>

          {/* User Info (if available) */}
          {statusData.user.name && (
            <div className="mb-4 p-3 bg-blue-50 rounded-lg text-sm text-blue-800">
              <strong>Welcome, {statusData.user.name}!</strong> 
              {statusData.user.balance > 0 && (
                <span className="ml-2">Available Balance: ₹{statusData.user.balance.toLocaleString()}</span>
              )}
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3">
            <Link href={notification.buttonLink} className="flex-1">
              <button 
                className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium shadow-sm"
                onClick={dismissNotification}
              >
                {notification.buttonText}
              </button>
            </Link>
            <button 
              onClick={dismissNotification}
              className="px-4 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Later
            </button>
          </div>

          {/* Helpful note */}
          <div className="mt-4 text-xs text-gray-400 text-center">
            This reminder appears on each sign-in until setup is complete
          </div>
        </div>
      </div>

      {/* Custom animations */}
      <style jsx>{`
        @keyframes slideInFromTop {
          from {
            opacity: 0;
            transform: translateY(-20px) scale(0.95);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
      `}</style>
    </>
  )
}