'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'

export default function TestUserPage() {
  const { data: session } = useSession()
  const [testResult, setTestResult] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const runTest = async () => {
    setLoading(true)
    setError(null)
    
    try {
      const response = await fetch('/api/test/simple')
      const result = await response.json()
      
      if (response.ok) {
        setTestResult(result)
      } else {
        setError(`API Error: ${result.error}`)
      }
    } catch (err: any) {
      setError(`Network Error: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (session?.user) {
      runTest()
    }
  }, [session])

  if (!session?.user) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold mb-4">User Test Page</h1>
        <p>Please sign in to test user data retrieval.</p>
      </div>
    )
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">User Data Test Results</h1>
      
      <div className="mb-6 p-4 bg-blue-50 rounded-lg">
        <h2 className="text-lg font-semibold mb-2">Session Information</h2>
        <p><strong>Email:</strong> {session.user.email}</p>
        <p><strong>Name:</strong> {session.user.name || 'Not set'}</p>
      </div>

      <button 
        onClick={runTest}
        disabled={loading}
        className="mb-6 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
      >
        {loading ? 'Testing...' : 'Run Database Test'}
      </button>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
          <h3 className="text-lg font-semibold text-red-800 mb-2">Error</h3>
          <p className="text-red-700">{error}</p>
        </div>
      )}

      {testResult && (
        <div className="space-y-6">
          <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
            <h3 className="text-lg font-semibold text-green-800 mb-2">✅ Test Successful</h3>
            <p className="text-green-700">Database connection and query completed successfully.</p>
          </div>

          <div className="p-4 bg-gray-50 rounded-lg">
            <h3 className="text-lg font-semibold mb-2">User Found in Database</h3>
            <p><strong>Found:</strong> {testResult.userFound ? '✅ Yes' : '❌ No'}</p>
            {testResult.userData && (
              <div className="mt-2">
                <p><strong>Database Name:</strong> {testResult.userData.name}</p>
                <p><strong>Database Email:</strong> {testResult.userData.email}</p>
                <p><strong>Has Zerodha Config:</strong> {testResult.userData.hasZerodhaConfig ? 'Yes' : 'No'}</p>
                <p><strong>User ID:</strong> {testResult.userData.id}</p>
              </div>
            )}
          </div>

          {testResult.similarUsers && testResult.similarUsers.length > 0 && (
            <div className="p-4 bg-yellow-50 rounded-lg">
              <h3 className="text-lg font-semibold mb-2">Similar Users Found</h3>
              {testResult.similarUsers.map((user: any, index: number) => (
                <div key={index} className="mb-2 p-2 bg-white rounded border">
                  <p><strong>Name:</strong> {user.name}</p>
                  <p><strong>Email:</strong> {user.email}</p>
                  <p><strong>ID:</strong> {user.id}</p>
                </div>
              ))}
            </div>
          )}

          <div className="p-4 bg-gray-100 rounded-lg">
            <h3 className="text-lg font-semibold mb-2">Raw API Response</h3>
            <pre className="text-sm overflow-auto">
              {JSON.stringify(testResult, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  )
}