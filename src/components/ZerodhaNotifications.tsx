'use client'

export default function ZerodhaNotifications() {
  console.log('🚀 SIMPLE TEST COMPONENT LOADED!')
  
  return (
    <div className="fixed top-4 right-4 z-50 bg-red-500 text-white p-4 rounded shadow-lg">
      <h3 className="font-bold">🔥 TEST COMPONENT ACTIVE</h3>
      <p>If you see this, our component is working!</p>
      <p>Date: {new Date().toLocaleTimeString()}</p>
    </div>
  )
}