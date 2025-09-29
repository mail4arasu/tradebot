'use client'

import { SessionProvider } from 'next-auth/react'
import { ReactNode } from 'react'
import ImpersonationProvider from '../ImpersonationProvider'

interface ProvidersProps {
  children: ReactNode
}

export default function Providers({ children }: ProvidersProps) {
  return (
    <SessionProvider>
      <ImpersonationProvider>
        {children}
      </ImpersonationProvider>
    </SessionProvider>
  )
}