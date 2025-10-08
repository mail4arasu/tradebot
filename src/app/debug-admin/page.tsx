'use client'

import { useSession } from 'next-auth/react'
import { useAdmin } from '@/hooks/useAdmin'
import { useState, useEffect } from 'react'

export default function DebugAdminPage() {
  const { data: session, status } = useSession()
  const { isAdmin, loading } = useAdmin()
  const [profileData, setProfileData] = useState<any>(null)
  const [profileError, setProfileError] = useState<string | null>(null)

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const response = await fetch('/api/user/profile')
        if (response.ok) {
          const data = await response.json()
          setProfileData(data)
        } else {
          const error = await response.text()
          setProfileError(`${response.status}: ${error}`)
        }
      } catch (error) {
        setProfileError(`Fetch error: ${error}`)
      }
    }

    if (session) {
      fetchProfile()
    }
  }, [session])

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-8">Admin Access Debug Page</h1>
      
      <div className="space-y-6">
        {/* Session Info */}
        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-xl font-semibold mb-4">Session Information</h2>
          <div className="space-y-2">
            <p><strong>Status:</strong> {status}</p>
            <p><strong>Session exists:</strong> {session ? 'Yes' : 'No'}</p>
            {session && (
              <>
                <p><strong>User Email:</strong> {session.user?.email}</p>
                <p><strong>User Name:</strong> {session.user?.name}</p>
                <p><strong>User ID:</strong> {session.user?.id}</p>
                <p><strong>Session Role:</strong> {(session.user as any)?.role || 'Not set'}</p>
              </>
            )}
          </div>
        </div>

        {/* useAdmin Hook Info */}
        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-xl font-semibold mb-4">useAdmin Hook</h2>
          <div className="space-y-2">
            <p><strong>Loading:</strong> {loading ? 'Yes' : 'No'}</p>
            <p><strong>Is Admin:</strong> {isAdmin ? 'Yes' : 'No'}</p>
          </div>
        </div>

        {/* Profile API Response */}
        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-xl font-semibold mb-4">Profile API Response</h2>
          {profileError ? (
            <div className="text-red-600">
              <p><strong>Error:</strong> {profileError}</p>
            </div>
          ) : profileData ? (
            <div className="space-y-2">
              <p><strong>Email:</strong> {profileData.email}</p>
              <p><strong>Name:</strong> {profileData.name}</p>
              <p><strong>Role:</strong> {profileData.role}</p>
              <p><strong>Role === 'admin':</strong> {profileData.role === 'admin' ? 'Yes' : 'No'}</p>
              <div className="mt-4">
                <p><strong>Full Response:</strong></p>
                <pre className="bg-gray-100 p-2 rounded text-sm overflow-auto">
                  {JSON.stringify(profileData, null, 2)}
                </pre>
              </div>
            </div>
          ) : (
            <p>Loading profile data...</p>
          )}
        </div>

        {/* Expected vs Actual */}
        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-xl font-semibold mb-4">Debug Summary</h2>
          <div className="space-y-2">
            <p><strong>Expected Admin Access:</strong> Yes (database role = admin)</p>
            <p><strong>Actual Admin Access:</strong> {isAdmin ? 'Yes' : 'No'}</p>
            <p><strong>Issue:</strong> {isAdmin ? 'None - working correctly' : 'Admin access not detected'}</p>
            {!isAdmin && profileData && (
              <div className="mt-4 p-4 bg-yellow-100 rounded">
                <p className="font-semibold">Debugging Info:</p>
                <p>Profile API Role: {profileData.role}</p>
                <p>Profile Role Type: {typeof profileData.role}</p>
                <p>Strict Equality Check: {profileData.role === 'admin' ? 'PASS' : 'FAIL'}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}