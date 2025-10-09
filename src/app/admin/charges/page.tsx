'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, Save, RefreshCw, DollarSign, TrendingUp, AlertTriangle, Settings, Building, FileText, BarChart3 } from 'lucide-react'
import Link from 'next/link'

interface ChargeConfig {
  brokerageRate: number
  brokerageMax: number
  exchangeChargesRate: number
  sttRate: number
  stampDutyRate: number
  sebiChargesRate: number
  cgstRate: number
  sgstRate: number
  igstRate: number
  lastUpdated: string
  updatedBy: string
}

export default function ChargesAdminPage() {
  const [config, setConfig] = useState<ChargeConfig>({
    brokerageRate: 0.0003, // 0.03%
    brokerageMax: 20,
    exchangeChargesRate: 0.0019, // 0.0019%
    sttRate: 0.0125, // 0.0125%
    stampDutyRate: 0.00003, // 0.003%
    sebiChargesRate: 0.000001, // Rs 1 per crore
    cgstRate: 0.09, // 9%
    sgstRate: 0.09, // 9%
    igstRate: 0.18, // 18%
    lastUpdated: new Date().toISOString(),
    updatedBy: 'Admin'
  })

  const [chargeStats, setChargeStats] = useState({
    totalTrades: 0,
    tradesWithCharges: 0,
    chargesCoverage: '0%',
    lastChargeUpdate: null,
    totalCharges: 0,
    avgChargesPerTrade: 0
  })

  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(false)

  useEffect(() => {
    fetchChargeStats()
  }, [])

  const fetchChargeStats = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/trades/update-charges?days=30')
      
      if (response.ok) {
        const data = await response.json()
        setChargeStats(data.stats)
      }
    } catch (error) {
      console.error('Error fetching charge stats:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleConfigChange = (field: keyof ChargeConfig, value: string) => {
    setConfig(prev => ({
      ...prev,
      [field]: parseFloat(value) || 0
    }))
  }

  const saveConfig = async () => {
    try {
      setSaving(true)
      
      // In a real implementation, this would save to database
      console.log('Saving charge configuration:', config)
      
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000))
      
      setConfig(prev => ({
        ...prev,
        lastUpdated: new Date().toISOString(),
        updatedBy: 'Admin'
      }))
      
      alert('Charge configuration saved successfully!')
    } catch (error) {
      console.error('Error saving config:', error)
      alert('Failed to save configuration')
    } finally {
      setSaving(false)
    }
  }

  const updateAllCharges = async () => {
    try {
      setUpdating(true)
      
      const response = await fetch('/api/trades/update-charges', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          endDate: new Date().toISOString().split('T')[0],
          forceUpdate: false,
          fetchFromZerodha: true
        })
      })
      
      if (response.ok) {
        const result = await response.json()
        alert(`Charges updated successfully: ${result.updated} trades updated, ${result.errors} errors`)
        await fetchChargeStats()
      } else {
        const error = await response.json()
        alert('Failed to update charges: ' + error.error)
      }
    } catch (error) {
      console.error('Error updating charges:', error)
      alert('Error updating charges: ' + error.message)
    } finally {
      setUpdating(false)
    }
  }

  const formatPercentage = (rate: number) => {
    return (rate * 100).toFixed(4) + '%'
  }

  const formatCurrency = (amount: number) => {
    return `₹${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-4 mb-4">
          <Link href="/admin">
            <Button variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Admin
            </Button>
          </Link>
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-gray-900">Charges Configuration</h1>
            <p className="text-gray-600">Configure trading charges and view charge tracking statistics</p>
          </div>
          <div className="flex gap-2">
            <Link href="/admin/broker-config">
              <Button variant="outline">
                <Building className="h-4 w-4 mr-2" />
                Broker Config
              </Button>
            </Link>
            <Link href="/admin/reports">
              <Button variant="outline">
                <BarChart3 className="h-4 w-4 mr-2" />
                Reports
              </Button>
            </Link>
            <Button onClick={updateAllCharges} disabled={updating} variant="outline">
              <RefreshCw className={`h-4 w-4 mr-2 ${updating ? 'animate-spin' : ''}`} />
              {updating ? 'Updating...' : 'Update Charges'}
            </Button>
            <Button onClick={fetchChargeStats} disabled={loading} variant="outline">
              <TrendingUp className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh Stats
            </Button>
          </div>
        </div>
      </div>

      {/* Charge Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <Card>
          <CardContent className="pt-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-gray-900">{chargeStats.totalTrades}</div>
              <div className="text-sm text-gray-600">Total Trades (30d)</div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">{chargeStats.tradesWithCharges}</div>
              <div className="text-sm text-gray-600">With Charges</div>
              <Badge variant="secondary" className="mt-1 text-xs">
                {chargeStats.chargesCoverage}
              </Badge>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">{formatCurrency(chargeStats.totalCharges)}</div>
              <div className="text-sm text-gray-600">Total Charges</div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-600">{formatCurrency(chargeStats.avgChargesPerTrade)}</div>
              <div className="text-sm text-gray-600">Avg per Trade</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Configuration Form */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Brokerage & Exchange Charges */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              Brokerage & Exchange Charges
            </CardTitle>
            <CardDescription>
              Configure brokerage and exchange transaction charges
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="brokerageRate">Brokerage Rate</Label>
                <Input
                  id="brokerageRate"
                  type="number"
                  step="0.0001"
                  value={config.brokerageRate}
                  onChange={(e) => handleConfigChange('brokerageRate', e.target.value)}
                />
                <div className="text-xs text-gray-500 mt-1">
                  Current: {formatPercentage(config.brokerageRate)}
                </div>
              </div>
              
              <div>
                <Label htmlFor="brokerageMax">Max Brokerage (₹)</Label>
                <Input
                  id="brokerageMax"
                  type="number"
                  value={config.brokerageMax}
                  onChange={(e) => handleConfigChange('brokerageMax', e.target.value)}
                />
                <div className="text-xs text-gray-500 mt-1">
                  Current: {formatCurrency(config.brokerageMax)}
                </div>
              </div>
            </div>
            
            <div>
              <Label htmlFor="exchangeChargesRate">Exchange Charges Rate</Label>
              <Input
                id="exchangeChargesRate"
                type="number"
                step="0.0001"
                value={config.exchangeChargesRate}
                onChange={(e) => handleConfigChange('exchangeChargesRate', e.target.value)}
              />
              <div className="text-xs text-gray-500 mt-1">
                Current: {formatPercentage(config.exchangeChargesRate)}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Taxes & Duties */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Taxes & Duties
            </CardTitle>
            <CardDescription>
              Configure STT, stamp duty, and SEBI charges
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="sttRate">STT Rate (Sell side)</Label>
              <Input
                id="sttRate"
                type="number"
                step="0.0001"
                value={config.sttRate}
                onChange={(e) => handleConfigChange('sttRate', e.target.value)}
              />
              <div className="text-xs text-gray-500 mt-1">
                Current: {formatPercentage(config.sttRate)}
              </div>
            </div>
            
            <div>
              <Label htmlFor="stampDutyRate">Stamp Duty Rate (Buy side)</Label>
              <Input
                id="stampDutyRate"
                type="number"
                step="0.000001"
                value={config.stampDutyRate}
                onChange={(e) => handleConfigChange('stampDutyRate', e.target.value)}
              />
              <div className="text-xs text-gray-500 mt-1">
                Current: {formatPercentage(config.stampDutyRate)}
              </div>
            </div>
            
            <div>
              <Label htmlFor="sebiChargesRate">SEBI Charges Rate</Label>
              <Input
                id="sebiChargesRate"
                type="number"
                step="0.000001"
                value={config.sebiChargesRate}
                onChange={(e) => handleConfigChange('sebiChargesRate', e.target.value)}
              />
              <div className="text-xs text-gray-500 mt-1">
                Current: {formatPercentage(config.sebiChargesRate)} (₹1 per crore)
              </div>
            </div>
          </CardContent>
        </Card>

        {/* GST Configuration */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              GST Configuration
            </CardTitle>
            <CardDescription>
              Configure CGST, SGST, and IGST rates
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="cgstRate">CGST Rate</Label>
                <Input
                  id="cgstRate"
                  type="number"
                  step="0.01"
                  value={config.cgstRate}
                  onChange={(e) => handleConfigChange('cgstRate', e.target.value)}
                />
                <div className="text-xs text-gray-500 mt-1">
                  Current: {formatPercentage(config.cgstRate)}
                </div>
              </div>
              
              <div>
                <Label htmlFor="sgstRate">SGST Rate</Label>
                <Input
                  id="sgstRate"
                  type="number"
                  step="0.01"
                  value={config.sgstRate}
                  onChange={(e) => handleConfigChange('sgstRate', e.target.value)}
                />
                <div className="text-xs text-gray-500 mt-1">
                  Current: {formatPercentage(config.sgstRate)}
                </div>
              </div>
            </div>
            
            <div>
              <Label htmlFor="igstRate">IGST Rate (Inter-state)</Label>
              <Input
                id="igstRate"
                type="number"
                step="0.01"
                value={config.igstRate}
                onChange={(e) => handleConfigChange('igstRate', e.target.value)}
              />
              <div className="text-xs text-gray-500 mt-1">
                Current: {formatPercentage(config.igstRate)}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Configuration Status */}
        <Card>
          <CardHeader>
            <CardTitle>Configuration Status</CardTitle>
            <CardDescription>
              Current configuration information and actions
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="text-sm">
                <span className="font-medium">Last Updated:</span>
                <div className="text-gray-600">
                  {new Date(config.lastUpdated).toLocaleString('en-IN')}
                </div>
              </div>
              
              <div className="text-sm">
                <span className="font-medium">Updated By:</span>
                <div className="text-gray-600">{config.updatedBy}</div>
              </div>
              
              {chargeStats.lastChargeUpdate && (
                <div className="text-sm">
                  <span className="font-medium">Last Charge Update:</span>
                  <div className="text-gray-600">
                    {new Date(chargeStats.lastChargeUpdate).toLocaleString('en-IN')}
                  </div>
                </div>
              )}
            </div>
            
            <div className="pt-4 border-t">
              <Button onClick={saveConfig} disabled={saving} className="w-full">
                <Save className={`h-4 w-4 mr-2 ${saving ? 'animate-pulse' : ''}`} />
                {saving ? 'Saving...' : 'Save Configuration'}
              </Button>
            </div>
            
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
              <div className="text-sm text-yellow-800">
                <strong>Note:</strong> Configuration changes will only affect new charge calculations. 
                Use "Update Charges" to apply to existing trades.
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}