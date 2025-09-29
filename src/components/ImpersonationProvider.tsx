'use client'

import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { useSession } from 'next-auth/react'
import ImpersonationBanner from './ImpersonationBanner'

interface ImpersonationDetails {
  targetUserId: string
  targetUserEmail: string
  adminEmail: string
  startTime: string
  expiresAt: string
}

interface ImpersonationContextType {
  isImpersonating: boolean
  impersonationDetails: ImpersonationDetails | null
  refreshImpersonationStatus: () => void
}

const ImpersonationContext = createContext<ImpersonationContextType>({
  isImpersonating: false,
  impersonationDetails: null,
  refreshImpersonationStatus: () => {}
})

export const useImpersonation = () => useContext(ImpersonationContext)

interface ImpersonationProviderProps {
  children: ReactNode
}

export default function ImpersonationProvider({ children }: ImpersonationProviderProps) {
  const { data: session, status } = useSession()
  const [isImpersonating, setIsImpersonating] = useState(false)
  const [impersonationDetails, setImpersonationDetails] = useState<ImpersonationDetails | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const checkImpersonationStatus = async () => {
    if (!session?.user?.email || isLoading) return

    try {
      setIsLoading(true)
      const response = await fetch('/api/user/profile')
      
      if (response.ok) {
        const data = await response.json()
        
        if (data.impersonation?.isImpersonating) {
          setIsImpersonating(true)
          setImpersonationDetails(data.impersonation.details)
        } else {
          setIsImpersonating(false)
          setImpersonationDetails(null)
        }
      }
    } catch (error) {
      console.error('Error checking impersonation status:', error)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (status === 'authenticated') {
      checkImpersonationStatus()
    }
  }, [session, status])

  const refreshImpersonationStatus = () => {
    checkImpersonationStatus()
  }

  const handleExitImpersonation = () => {
    setIsImpersonating(false)
    setImpersonationDetails(null)
  }

  return (
    <ImpersonationContext.Provider value={{
      isImpersonating,
      impersonationDetails,
      refreshImpersonationStatus
    }}>
      {isImpersonating && impersonationDetails && (
        <ImpersonationBanner
          impersonationDetails={impersonationDetails}
          onExitImpersonation={handleExitImpersonation}
        />
      )}
      {children}
    </ImpersonationContext.Provider>
  )
}