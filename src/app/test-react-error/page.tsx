'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'

export default function TestReactError() {
  const [testValue, setTestValue] = useState('')
  const [testChecked, setTestChecked] = useState(false)
  const [testNumber, setTestNumber] = useState(1)

  // Explicitly handle all potential object issues
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setTestValue(String(value))
  }

  const handleNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    const numValue = parseInt(value) || 1
    setTestNumber(numValue)
  }

  const handleSwitchChange = (checked: boolean) => {
    setTestChecked(Boolean(checked))
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <Card>
        <CardHeader>
          <CardTitle>React Error Test Page</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Test Input */}
          <div>
            <label>Text Input:</label>
            <Input
              type="text"
              value={String(testValue)}
              onChange={handleInputChange}
            />
            <p>Value: {String(testValue)}</p>
          </div>

          {/* Test Number Input */}
          <div>
            <label>Number Input:</label>
            <Input
              type="number"
              value={String(testNumber)}
              onChange={handleNumberChange}
            />
            <p>Value: {String(testNumber)}</p>
          </div>

          {/* Test Switch */}
          <div className="flex items-center space-x-2">
            <Switch
              checked={Boolean(testChecked)}
              onCheckedChange={handleSwitchChange}
            />
            <label>Test Switch</label>
          </div>
          <p>Switch: {String(testChecked)}</p>

          {/* Test Button */}
          <Button onClick={() => console.log('Button clicked')}>
            Test Button
          </Button>

          {/* Test conditional rendering */}
          <div>
            {testChecked && <p>Switch is ON</p>}
            {!testChecked && <p>Switch is OFF</p>}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}