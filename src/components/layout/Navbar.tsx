'use client'

import { useSession, signIn, signOut } from 'next-auth/react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { LayoutDashboard, Settings, History, Bot, TrendingUp, LogOut, Shield } from 'lucide-react'
import { useAdmin } from '@/hooks/useAdmin'

export default function Navbar() {
  const { data: session, status } = useSession()
  const { isAdmin } = useAdmin()

  if (status === 'loading') return <div>Loading...</div>

  return (
    <nav className="bg-white shadow-lg border-b">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center">
            <Link href="/" className="text-2xl font-bold text-blue-600">
              TradeBot Portal
            </Link>
          </div>

          {session ? (
            <div className="flex items-center space-x-4">
              <Link href="/dashboard" className="flex items-center space-x-1 text-gray-700 hover:text-blue-600">
                <LayoutDashboard size={20} />
                <span>Dashboard</span>
              </Link>
              
              <Link href="/trades" className="flex items-center space-x-1 text-gray-700 hover:text-blue-600">
                <History size={20} />
                <span>Trades</span>
              </Link>
              
              <Link href="/bots" className="flex items-center space-x-1 text-gray-700 hover:text-blue-600">
                <Bot size={20} />
                <span>Bots</span>
              </Link>
              
              <Link href="/backtest" className="flex items-center space-x-1 text-gray-700 hover:text-blue-600">
                <TrendingUp size={20} />
                <span>Backtest</span>
              </Link>
              
              <Link href="/settings" className="flex items-center space-x-1 text-gray-700 hover:text-blue-600">
                <Settings size={20} />
                <span>Settings</span>
              </Link>

              {isAdmin && (
                <Link href="/admin" className="flex items-center space-x-1 text-gray-700 hover:text-red-600">
                  <Shield size={20} />
                  <span>Admin</span>
                </Link>
              )}

              <div className="flex items-center space-x-2">
                <span className="text-sm text-gray-600">
                  {session.user?.name || session.user?.email}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => signOut()}
                  className="flex items-center space-x-1"
                >
                  <LogOut size={16} />
                  <span>Sign Out</span>
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-center space-x-2">
              <Button onClick={() => signIn()}>Sign In</Button>
            </div>
          )}
        </div>
      </div>
    </nav>
  )
}