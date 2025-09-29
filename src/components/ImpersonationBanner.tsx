'use client'

import { useState } from 'react'
import { AlertTriangle, User, Clock, X } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface ImpersonationDetails {
  targetUserId: string
  targetUserEmail: string
  adminEmail: string
  startTime: string
  expiresAt: string
}

interface ImpersonationBannerProps {
  impersonationDetails: ImpersonationDetails
  onExitImpersonation: () => void
}

export default function ImpersonationBanner({ 
  impersonationDetails, 
  onExitImpersonation 
}: ImpersonationBannerProps) {
  const [isExiting, setIsExiting] = useState(false)

  const handleExitImpersonation = async () => {
    setIsExiting(true)
    try {
      const response = await fetch('/api/admin/impersonate', {
        method: 'DELETE',
      })

      if (response.ok) {
        onExitImpersonation()
        // Refresh the page to reset the session
        window.location.reload()
      } else {
        const errorData = await response.json()
        alert('Failed to exit impersonation: ' + errorData.error)
      }
    } catch (error) {
      console.error('Error exiting impersonation:', error)
      alert('Error exiting impersonation. Please try again.')
    } finally {
      setIsExiting(false)
    }
  }

  const formatDuration = () => {
    const start = new Date(impersonationDetails.startTime)
    const now = new Date()
    const minutes = Math.floor((now.getTime() - start.getTime()) / (1000 * 60))
    
    if (minutes < 1) return 'just now'
    if (minutes === 1) return '1 minute ago'
    return `${minutes} minutes ago`
  }

  const formatTimeRemaining = () => {
    const expires = new Date(impersonationDetails.expiresAt)
    const now = new Date()
    const minutes = Math.floor((expires.getTime() - now.getTime()) / (1000 * 60))
    
    if (minutes <= 0) return 'expired'
    if (minutes === 1) return '1 minute remaining'
    return `${minutes} minutes remaining`
  }

  return (
    <div className="bg-gradient-to-r from-yellow-400 via-yellow-500 to-orange-500 text-white px-4 py-3 shadow-lg border-b-2 border-yellow-600">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <AlertTriangle className="h-5 w-5 animate-pulse" />
            <span className="font-semibold text-lg">ADMIN IMPERSONATION MODE</span>
          </div>
          
          <div className="hidden md:flex items-center space-x-6 text-sm">
            <div className="flex items-center space-x-2">
              <User className="h-4 w-4" />
              <span>
                Viewing as: <strong>{impersonationDetails.targetUserEmail}</strong>
              </span>
            </div>
            
            <div className="flex items-center space-x-2">
              <Clock className="h-4 w-4" />
              <span>Started {formatDuration()}</span>
            </div>

            <div className="text-xs bg-white/20 px-2 py-1 rounded">
              {formatTimeRemaining()}
            </div>
          </div>
        </div>

        <Button
          onClick={handleExitImpersonation}
          disabled={isExiting}
          variant="outline"
          size="sm"
          className="bg-white/10 border-white/30 text-white hover:bg-white/20 hover:text-white transition-colors duration-200"
        >
          <X className="h-4 w-4 mr-2" />
          {isExiting ? 'Exiting...' : 'Exit Impersonation'}
        </Button>
      </div>

      {/* Mobile view */}
      <div className="md:hidden mt-2 text-sm space-y-1">
        <div>Viewing as: <strong>{impersonationDetails.targetUserEmail}</strong></div>
        <div>{formatDuration()} • {formatTimeRemaining()}</div>
      </div>
    </div>
  )
}