'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, Download, FileText, Calendar, TrendingUp, Building, DollarSign, BarChart3, RefreshCw, Eye } from 'lucide-react'
import Link from 'next/link'

interface ReportStats {
  totalUsers: number
  totalTrades: number
  totalTurnover: number
  totalCharges: number
  lastReportGenerated: string | null
}

export default function AdminReportsPage() {
  const [reportStats, setReportStats] = useState<ReportStats>({
    totalUsers: 0,
    totalTrades: 0,
    totalTurnover: 0,
    totalCharges: 0,
    lastReportGenerated: null
  })

  const [startDate, setStartDate] = useState(() => {
    const date = new Date()
    date.setMonth(date.getMonth() - 1) // Default to last month
    return date.toISOString().split('T')[0]
  })

  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0])
  const [generating, setGenerating] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchReportStats()
  }, [])

  const fetchReportStats = async () => {
    try {
      setLoading(true)
      // Fetch overall statistics for the reports page
      const response = await fetch('/api/admin/reports/stats')
      
      if (response.ok) {
        const data = await response.json()
        setReportStats(data.stats)
      }
    } catch (error) {
      console.error('Error fetching report stats:', error)
    } finally {
      setLoading(false)
    }
  }

  const generateQuarterlyReport = async () => {
    try {
      setGenerating(true)
      
      const response = await fetch('/api/reports/quarterly', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          startDate,
          endDate,
          updateCharges: true,
          emailReport: false
        })
      })
      
      if (response.ok) {
        const data = await response.json()
        alert('Quarterly report generated successfully!')
        
        // Download the report
        const reportBlob = new Blob([JSON.stringify(data.report, null, 2)], { 
          type: 'application/json' 
        })
        const url = URL.createObjectURL(reportBlob)
        const a = document.createElement('a')
        a.href = url
        a.download = `quarterly-report-${startDate}-to-${endDate}.json`
        a.click()
        URL.revokeObjectURL(url)
        
        fetchReportStats()
      } else {
        const error = await response.json()
        alert('Failed to generate report: ' + error.error)
      }
    } catch (error) {
      console.error('Error generating report:', error)
      alert('Error generating report: ' + error.message)
    } finally {
      setGenerating(false)
    }
  }

  const generateContractNotes = async () => {
    try {
      setGenerating(true)
      
      // Open contract note in new window for the date range
      const contractNoteUrl = `/api/trades/contract-note/pdf?startDate=${startDate}&endDate=${endDate}`
      const contractNoteWindow = window.open(contractNoteUrl, '_blank')
      
      if (!contractNoteWindow) {
        alert('Contract note generated! Please enable popups to view/download the PDF.')
      }
    } catch (error) {
      console.error('Error generating contract note:', error)
      alert('Error generating contract note: ' + error.message)
    } finally {
      setGenerating(false)
    }
  }

  const viewChargesPage = () => {
    window.open('/admin/charges', '_blank')
  }

  const previewBrokerConfig = () => {
    window.open('/admin/broker-config', '_blank')
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
            <h1 className="text-3xl font-bold text-gray-900">Reports Dashboard</h1>
            <p className="text-gray-600">Generate and manage trading reports, contract notes, and compliance documents</p>
          </div>
          <div className="flex gap-2">
            <Button onClick={previewBrokerConfig} variant="outline">
              <Building className="h-4 w-4 mr-2" />
              Broker Config
            </Button>
            <Button onClick={viewChargesPage} variant="outline">
              <DollarSign className="h-4 w-4 mr-2" />
              Charges Config
            </Button>
            <Button onClick={fetchReportStats} disabled={loading} variant="outline">
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh Stats
            </Button>
          </div>
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <Card>
          <CardContent className="pt-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">{reportStats.totalUsers}</div>
              <div className="text-sm text-gray-600">Total Users</div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">{reportStats.totalTrades.toLocaleString()}</div>
              <div className="text-sm text-gray-600">Total Trades</div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-600">
                ₹{reportStats.totalTurnover.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </div>
              <div className="text-sm text-gray-600">Total Turnover</div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-orange-600">
                ₹{reportStats.totalCharges.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </div>
              <div className="text-sm text-gray-600">Total Charges</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Date Range Selection */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Report Date Range
          </CardTitle>
          <CardDescription>
            Select the date range for generating reports and contract notes
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-md">
            <div>
              <Label htmlFor="startDate">Start Date</Label>
              <Input
                id="startDate"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            
            <div>
              <Label htmlFor="endDate">End Date</Label>
              <Input
                id="endDate"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>
          
          <div className="text-sm text-gray-600 mt-2">
            Selected range: {new Date(startDate).toLocaleDateString('en-IN')} to {new Date(endDate).toLocaleDateString('en-IN')}
          </div>
        </CardContent>
      </Card>

      {/* Report Generation */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Contract Notes */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Contract Notes
            </CardTitle>
            <CardDescription>
              Generate professional contract notes for the selected date range
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h4 className="font-medium text-blue-900 mb-2">Contract Note Features:</h4>
              <ul className="text-sm text-blue-800 space-y-1">
                <li>• Professional PDF format matching Zerodha style</li>
                <li>• Complete trade details with charges breakdown</li>
                <li>• GST calculations and compliance information</li>
                <li>• Customizable broker details and branding</li>
              </ul>
            </div>
            
            <Button 
              onClick={generateContractNotes} 
              disabled={generating}
              className="w-full"
            >
              <Download className={`h-4 w-4 mr-2 ${generating ? 'animate-pulse' : ''}`} />
              {generating ? 'Generating...' : 'Generate Contract Note'}
            </Button>
          </CardContent>
        </Card>

        {/* Quarterly Reports */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Quarterly Reports
            </CardTitle>
            <CardDescription>
              Generate comprehensive quarterly reports for tax compliance
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <h4 className="font-medium text-green-900 mb-2">Report Features:</h4>
              <ul className="text-sm text-green-800 space-y-1">
                <li>• Complete P&L analysis with real charges</li>
                <li>• Tax summary for ITR filing</li>
                <li>• Charge breakdown and percentages</li>
                <li>• Financial year and quarter-wise data</li>
              </ul>
            </div>
            
            <Button 
              onClick={generateQuarterlyReport} 
              disabled={generating}
              className="w-full"
              variant="outline"
            >
              <TrendingUp className={`h-4 w-4 mr-2 ${generating ? 'animate-pulse' : ''}`} />
              {generating ? 'Generating...' : 'Generate Quarterly Report'}
            </Button>
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              Quick Actions
            </CardTitle>
            <CardDescription>
              Common administrative tasks and configurations
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Link href="/admin/broker-config" className="block">
                <Button variant="outline" className="w-full h-auto p-4 flex flex-col items-center gap-2">
                  <Building className="h-6 w-6" />
                  <div className="text-center">
                    <div className="font-medium">Broker Configuration</div>
                    <div className="text-xs text-gray-600">Company details & branding</div>
                  </div>
                </Button>
              </Link>
              
              <Link href="/admin/charges" className="block">
                <Button variant="outline" className="w-full h-auto p-4 flex flex-col items-center gap-2">
                  <DollarSign className="h-6 w-6" />
                  <div className="text-center">
                    <div className="font-medium">Charges Configuration</div>
                    <div className="text-xs text-gray-600">Trading charges & rates</div>
                  </div>
                </Button>
              </Link>
              
              <Link href="/trades" className="block">
                <Button variant="outline" className="w-full h-auto p-4 flex flex-col items-center gap-2">
                  <BarChart3 className="h-6 w-6" />
                  <div className="text-center">
                    <div className="font-medium">Trade History</div>
                    <div className="text-xs text-gray-600">View all trades & positions</div>
                  </div>
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>

      {reportStats.lastReportGenerated && (
        <Card className="mt-8">
          <CardContent className="pt-6">
            <div className="text-center text-sm text-gray-600">
              Last report generated: {new Date(reportStats.lastReportGenerated).toLocaleString('en-IN')}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}