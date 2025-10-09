'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, Save, RefreshCw, Building, Shield, Phone, Mail, Settings, RotateCcw, FileText, Eye } from 'lucide-react'
import Link from 'next/link'

interface BrokerConfig {
  _id?: string
  companyName: string
  companyDisplayName: string
  address: string
  phone: string
  website: string
  email: string
  sebiRegistration: string
  gstNumber: string
  gstStateCode: string
  placeOfSupply: string
  complianceOfficer: {
    name: string
    phone: string
    email: string
  }
  investorComplaintEmail: string
  supportEmail: string
  supportPhone: string
  contractNotePrefix: string
  invoiceReferencePrefix: string
  logoUrl: string
  brandColor: string
  version?: number
  lastUpdated?: string
  updatedBy?: string
}

export default function BrokerConfigPage() {
  const [config, setConfig] = useState<BrokerConfig>({
    companyName: 'TradeBot Portal',
    companyDisplayName: '🤖 TRADEBOT PORTAL',
    address: 'Technology Hub, Bangalore, Karnataka, India',
    phone: '+91 80 4718 1888',
    website: 'https://niveshawealth.in',
    email: 'info@niveshawealth.in',
    sebiRegistration: 'INZ000031633',
    gstNumber: '29AAAAA0000A1Z5',
    gstStateCode: '29',
    placeOfSupply: 'KARNATAKA',
    complianceOfficer: {
      name: 'System Administrator',
      phone: '+91 80 4718 1888',
      email: 'compliance@niveshawealth.in'
    },
    investorComplaintEmail: 'complaints@niveshawealth.in',
    supportEmail: 'support@niveshawealth.in',
    supportPhone: '+91 80 4718 1888',
    contractNotePrefix: 'CNT',
    invoiceReferencePrefix: 'IRN',
    logoUrl: '',
    brandColor: '#1e3a8a'
  })

  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [resetting, setResetting] = useState(false)

  useEffect(() => {
    fetchConfig()
  }, [])

  const fetchConfig = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/admin/broker-config')
      
      if (response.ok) {
        const data = await response.json()
        setConfig(data.config)
      } else {
        console.error('Failed to fetch config')
      }
    } catch (error) {
      console.error('Error fetching config:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleInputChange = (field: string, value: string) => {
    if (field.includes('.')) {
      const [parent, child] = field.split('.')
      setConfig(prev => ({
        ...prev,
        [parent]: {
          ...prev[parent],
          [child]: value
        }
      }))
    } else {
      setConfig(prev => ({
        ...prev,
        [field]: value
      }))
    }
  }

  const saveConfig = async () => {
    try {
      setSaving(true)
      
      const response = await fetch('/api/admin/broker-config', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(config)
      })
      
      if (response.ok) {
        const data = await response.json()
        setConfig(data.config)
        alert('Broker configuration saved successfully!')
      } else {
        const error = await response.json()
        alert('Failed to save configuration: ' + error.error)
      }
    } catch (error) {
      console.error('Error saving config:', error)
      alert('Error saving configuration: ' + error.message)
    } finally {
      setSaving(false)
    }
  }

  const resetToDefaults = async () => {
    if (!confirm('Are you sure you want to reset all settings to defaults? This action cannot be undone.')) {
      return
    }

    try {
      setResetting(true)
      
      const response = await fetch('/api/admin/broker-config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'reset' })
      })
      
      if (response.ok) {
        const data = await response.json()
        setConfig(data.config)
        alert('Configuration reset to defaults successfully!')
      } else {
        const error = await response.json()
        alert('Failed to reset configuration: ' + error.error)
      }
    } catch (error) {
      console.error('Error resetting config:', error)
      alert('Error resetting configuration: ' + error.message)
    } finally {
      setResetting(false)
    }
  }

  const previewContractNote = () => {
    const startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    const endDate = new Date().toISOString().split('T')[0]
    const previewUrl = `/api/trades/contract-note/pdf?startDate=${startDate}&endDate=${endDate}&preview=true`
    window.open(previewUrl, '_blank')
  }

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-center h-64">
          <RefreshCw className="h-8 w-8 animate-spin text-blue-600" />
          <span className="ml-2">Loading broker configuration...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-4 mb-4">
          <Link href="/admin/charges">
            <Button variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Charges
            </Button>
          </Link>
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-gray-900">Broker Configuration</h1>
            <p className="text-gray-600">Configure company details for contract notes and reports</p>
          </div>
          <div className="flex gap-2">
            <Button onClick={previewContractNote} variant="outline">
              <Eye className="h-4 w-4 mr-2" />
              Preview Contract Note
            </Button>
            <Button onClick={resetToDefaults} disabled={resetting} variant="outline">
              <RotateCcw className={`h-4 w-4 mr-2 ${resetting ? 'animate-spin' : ''}`} />
              Reset to Defaults
            </Button>
            <Button onClick={fetchConfig} disabled={loading} variant="outline">
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>
        
        {config.version && (
          <div className="flex gap-4 text-sm text-gray-600">
            <Badge variant="secondary">Version {config.version}</Badge>
            {config.lastUpdated && (
              <span>Last updated: {new Date(config.lastUpdated).toLocaleString('en-IN')}</span>
            )}
            {config.updatedBy && <span>by {config.updatedBy}</span>}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Company Information */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building className="h-5 w-5" />
              Company Information
            </CardTitle>
            <CardDescription>
              Basic company details displayed on contract notes
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="companyName">Company Name</Label>
              <Input
                id="companyName"
                value={config.companyName}
                onChange={(e) => handleInputChange('companyName', e.target.value)}
                placeholder="TradeBot Portal"
              />
            </div>
            
            <div>
              <Label htmlFor="companyDisplayName">Display Name (with emoji/branding)</Label>
              <Input
                id="companyDisplayName"
                value={config.companyDisplayName}
                onChange={(e) => handleInputChange('companyDisplayName', e.target.value)}
                placeholder="🤖 TRADEBOT PORTAL"
              />
            </div>
            
            <div>
              <Label htmlFor="address">Address</Label>
              <Input
                id="address"
                value={config.address}
                onChange={(e) => handleInputChange('address', e.target.value)}
                placeholder="Technology Hub, Bangalore, Karnataka, India"
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  value={config.phone}
                  onChange={(e) => handleInputChange('phone', e.target.value)}
                  placeholder="+91 80 4718 1888"
                />
              </div>
              
              <div>
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={config.email}
                  onChange={(e) => handleInputChange('email', e.target.value)}
                  placeholder="info@niveshawealth.in"
                />
              </div>
            </div>
            
            <div>
              <Label htmlFor="website">Website</Label>
              <Input
                id="website"
                value={config.website}
                onChange={(e) => handleInputChange('website', e.target.value)}
                placeholder="https://niveshawealth.in"
              />
            </div>
          </CardContent>
        </Card>

        {/* Regulatory Information */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Regulatory Information
            </CardTitle>
            <CardDescription>
              SEBI registration and GST details
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="sebiRegistration">SEBI Registration Number</Label>
              <Input
                id="sebiRegistration"
                value={config.sebiRegistration}
                onChange={(e) => handleInputChange('sebiRegistration', e.target.value)}
                placeholder="INZ000031633"
              />
            </div>
            
            <div>
              <Label htmlFor="gstNumber">GST Number</Label>
              <Input
                id="gstNumber"
                value={config.gstNumber}
                onChange={(e) => handleInputChange('gstNumber', e.target.value)}
                placeholder="29AAAAA0000A1Z5"
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="gstStateCode">GST State Code</Label>
                <Input
                  id="gstStateCode"
                  value={config.gstStateCode}
                  onChange={(e) => handleInputChange('gstStateCode', e.target.value)}
                  placeholder="29"
                />
              </div>
              
              <div>
                <Label htmlFor="placeOfSupply">Place of Supply</Label>
                <Input
                  id="placeOfSupply"
                  value={config.placeOfSupply}
                  onChange={(e) => handleInputChange('placeOfSupply', e.target.value)}
                  placeholder="KARNATAKA"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Compliance Officer */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Phone className="h-5 w-5" />
              Compliance Officer
            </CardTitle>
            <CardDescription>
              Compliance officer contact details
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="complianceOfficerName">Name</Label>
              <Input
                id="complianceOfficerName"
                value={config.complianceOfficer.name}
                onChange={(e) => handleInputChange('complianceOfficer.name', e.target.value)}
                placeholder="System Administrator"
              />
            </div>
            
            <div>
              <Label htmlFor="complianceOfficerPhone">Phone</Label>
              <Input
                id="complianceOfficerPhone"
                value={config.complianceOfficer.phone}
                onChange={(e) => handleInputChange('complianceOfficer.phone', e.target.value)}
                placeholder="+91 80 4718 1888"
              />
            </div>
            
            <div>
              <Label htmlFor="complianceOfficerEmail">Email</Label>
              <Input
                id="complianceOfficerEmail"
                type="email"
                value={config.complianceOfficer.email}
                onChange={(e) => handleInputChange('complianceOfficer.email', e.target.value)}
                placeholder="compliance@niveshawealth.in"
              />
            </div>
          </CardContent>
        </Card>

        {/* Customer Support */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              Customer Support
            </CardTitle>
            <CardDescription>
              Customer support and complaint handling
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="investorComplaintEmail">Investor Complaint Email</Label>
              <Input
                id="investorComplaintEmail"
                type="email"
                value={config.investorComplaintEmail}
                onChange={(e) => handleInputChange('investorComplaintEmail', e.target.value)}
                placeholder="complaints@niveshawealth.in"
              />
            </div>
            
            <div>
              <Label htmlFor="supportEmail">Support Email</Label>
              <Input
                id="supportEmail"
                type="email"
                value={config.supportEmail}
                onChange={(e) => handleInputChange('supportEmail', e.target.value)}
                placeholder="support@niveshawealth.in"
              />
            </div>
            
            <div>
              <Label htmlFor="supportPhone">Support Phone</Label>
              <Input
                id="supportPhone"
                value={config.supportPhone}
                onChange={(e) => handleInputChange('supportPhone', e.target.value)}
                placeholder="+91 80 4718 1888"
              />
            </div>
          </CardContent>
        </Card>

        {/* Document Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Document Settings
            </CardTitle>
            <CardDescription>
              Contract note and document preferences
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="contractNotePrefix">Contract Note Prefix</Label>
                <Input
                  id="contractNotePrefix"
                  value={config.contractNotePrefix}
                  onChange={(e) => handleInputChange('contractNotePrefix', e.target.value)}
                  placeholder="CNT"
                />
              </div>
              
              <div>
                <Label htmlFor="invoiceReferencePrefix">Invoice Reference Prefix</Label>
                <Input
                  id="invoiceReferencePrefix"
                  value={config.invoiceReferencePrefix}
                  onChange={(e) => handleInputChange('invoiceReferencePrefix', e.target.value)}
                  placeholder="IRN"
                />
              </div>
            </div>
            
            <div>
              <Label htmlFor="logoUrl">Logo URL (optional)</Label>
              <Input
                id="logoUrl"
                value={config.logoUrl}
                onChange={(e) => handleInputChange('logoUrl', e.target.value)}
                placeholder="https://example.com/logo.png"
              />
            </div>
            
            <div>
              <Label htmlFor="brandColor">Brand Color</Label>
              <div className="flex gap-2">
                <Input
                  id="brandColor"
                  value={config.brandColor}
                  onChange={(e) => handleInputChange('brandColor', e.target.value)}
                  placeholder="#1e3a8a"
                  className="flex-1"
                />
                <div 
                  className="w-12 h-10 rounded border border-gray-300"
                  style={{ backgroundColor: config.brandColor }}
                ></div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Save Button */}
        <Card className="lg:col-span-2">
          <CardContent className="pt-6">
            <div className="flex justify-between items-center">
              <div className="text-sm text-gray-600">
                All changes will be immediately reflected in new contract notes and reports.
              </div>
              
              <Button onClick={saveConfig} disabled={saving} className="min-w-32">
                <Save className={`h-4 w-4 mr-2 ${saving ? 'animate-pulse' : ''}`} />
                {saving ? 'Saving...' : 'Save Configuration'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}