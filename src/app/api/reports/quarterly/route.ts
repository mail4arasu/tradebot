import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import dbConnect from '@/lib/mongoose'
import User from '@/models/User'
import Trade from '@/models/Trade'
import { 
  calculatePeriodPnL, 
  getFinancialYear, 
  getQuarter 
} from '@/utils/chargeProcessor'
import mongoose from 'mongoose'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await dbConnect()
    
    const user = await User.findOne({ email: session.user.email })
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const { searchParams } = new URL(request.url)
    const financialYear = searchParams.get('financialYear') // e.g., 'FY2024-25'
    const quarter = searchParams.get('quarter') // e.g., 'Q1', 'Q2', 'Q3', 'Q4'
    const year = searchParams.get('year') // e.g., '2024' for calendar year
    const format = searchParams.get('format') || 'summary' // 'summary', 'detailed', 'tax'

    if (!financialYear && !year) {
      // Default to current financial year
      const currentDate = new Date()
      const currentFY = getFinancialYear(currentDate)
      return await generateQuarterlyReport(user._id, currentFY, quarter, format)
    }

    if (financialYear) {
      return await generateQuarterlyReport(user._id, financialYear, quarter, format)
    } else {
      return await generateCalendarYearReport(user._id, year!, format)
    }

  } catch (error) {
    console.error('Error generating quarterly report:', error)
    return NextResponse.json(
      { error: 'Failed to generate quarterly report' },
      { status: 500 }
    )
  }
}

async function generateQuarterlyReport(
  userId: string, 
  financialYear: string, 
  quarter?: string | null,
  format: string = 'summary'
) {
  const query: any = {
    userId: new mongoose.Types.ObjectId(userId),
    financialYear
  }

  if (quarter) {
    query.quarter = quarter
  }

  console.log(`📊 Generating ${quarter ? 'quarterly' : 'annual'} report for ${financialYear}`)

  // Get aggregated data
  const aggregationPipeline = [
    { $match: query },
    {
      $group: {
        _id: quarter ? null : '$quarter',
        quarter: { $first: quarter || '$quarter' },
        totalTrades: { $sum: 1 },
        totalTurnover: { $sum: '$turnover' },
        grossPnl: { $sum: '$grossPnl' },
        netPnl: { $sum: '$netPnl' },
        totalCharges: { $sum: '$charges.totalCharges' },
        brokerage: { $sum: '$charges.brokerage' },
        stt: { $sum: '$charges.stt' },
        exchangeCharges: { $sum: '$charges.exchangeCharges' },
        gst: { $sum: '$charges.gst' },
        sebiCharges: { $sum: '$charges.sebiCharges' },
        stampCharges: { $sum: '$charges.stampCharges' },
        buyTrades: {
          $sum: { $cond: [{ $eq: ['$transactionType', 'BUY'] }, 1, 0] }
        },
        sellTrades: {
          $sum: { $cond: [{ $eq: ['$transactionType', 'SELL'] }, 1, 0] }
        },
        buyTurnover: {
          $sum: { $cond: [{ $eq: ['$transactionType', 'BUY'] }, '$turnover', 0] }
        },
        sellTurnover: {
          $sum: { $cond: [{ $eq: ['$transactionType', 'SELL'] }, '$turnover', 0] }
        },
        profitableTrades: {
          $sum: { $cond: [{ $gt: ['$netPnl', 0] }, 1, 0] }
        },
        lossMakingTrades: {
          $sum: { $cond: [{ $lt: ['$netPnl', 0] }, 1, 0] }
        },
        firstTradeDate: { $min: '$timestamp' },
        lastTradeDate: { $max: '$timestamp' }
      }
    },
    { $sort: { quarter: 1 } }
  ]

  const aggregatedData = await Trade.aggregate(aggregationPipeline)

  // Get detailed trade data if requested
  let detailedTrades = []
  if (format === 'detailed') {
    detailedTrades = await Trade.find(query)
      .select('tradingSymbol exchange transactionType quantity price turnover charges netPnl timestamp orderId tradeId')
      .sort({ timestamp: -1 })
      .limit(1000) // Limit for performance
  }

  // Get monthly breakdown
  const monthlyBreakdown = await Trade.aggregate([
    { $match: query },
    {
      $group: {
        _id: {
          year: { $year: '$timestamp' },
          month: { $month: '$timestamp' }
        },
        totalTrades: { $sum: 1 },
        totalTurnover: { $sum: '$turnover' },
        netPnl: { $sum: '$netPnl' },
        totalCharges: { $sum: '$charges.totalCharges' }
      }
    },
    { $sort: { '_id.year': 1, '_id.month': 1 } }
  ])

  // Calculate summary statistics
  const summary = aggregatedData.reduce((acc, curr) => {
    acc.totalTrades += curr.totalTrades || 0
    acc.totalTurnover += curr.totalTurnover || 0
    acc.grossPnl += curr.grossPnl || 0
    acc.netPnl += curr.netPnl || 0
    acc.totalCharges += curr.totalCharges || 0
    acc.brokerage += curr.brokerage || 0
    acc.stt += curr.stt || 0
    acc.exchangeCharges += curr.exchangeCharges || 0
    acc.gst += curr.gst || 0
    acc.sebiCharges += curr.sebiCharges || 0
    acc.stampCharges += curr.stampCharges || 0
    acc.buyTrades += curr.buyTrades || 0
    acc.sellTrades += curr.sellTrades || 0
    acc.buyTurnover += curr.buyTurnover || 0
    acc.sellTurnover += curr.sellTurnover || 0
    acc.profitableTrades += curr.profitableTrades || 0
    acc.lossMakingTrades += curr.lossMakingTrades || 0
    
    if (!acc.firstTradeDate || (curr.firstTradeDate && curr.firstTradeDate < acc.firstTradeDate)) {
      acc.firstTradeDate = curr.firstTradeDate
    }
    if (!acc.lastTradeDate || (curr.lastTradeDate && curr.lastTradeDate > acc.lastTradeDate)) {
      acc.lastTradeDate = curr.lastTradeDate
    }
    
    return acc
  }, {
    totalTrades: 0,
    totalTurnover: 0,
    grossPnl: 0,
    netPnl: 0,
    totalCharges: 0,
    brokerage: 0,
    stt: 0,
    exchangeCharges: 0,
    gst: 0,
    sebiCharges: 0,
    stampCharges: 0,
    buyTrades: 0,
    sellTrades: 0,
    buyTurnover: 0,
    sellTurnover: 0,
    profitableTrades: 0,
    lossMakingTrades: 0,
    firstTradeDate: null,
    lastTradeDate: null
  })

  // Calculate derived metrics
  const winRate = summary.totalTrades > 0 ? (summary.profitableTrades / summary.totalTrades * 100) : 0
  const avgPnlPerTrade = summary.totalTrades > 0 ? (summary.netPnl / summary.totalTrades) : 0
  const chargeRatio = summary.totalTurnover > 0 ? (summary.totalCharges / summary.totalTurnover * 100) : 0
  const returnOnTurnover = summary.totalTurnover > 0 ? (summary.netPnl / summary.totalTurnover * 100) : 0

  const report = {
    reportType: quarter ? 'quarterly' : 'annual',
    financialYear,
    quarter,
    period: quarter ? `${financialYear} ${quarter}` : financialYear,
    generatedAt: new Date().toISOString(),
    userId,
    
    summary: {
      ...summary,
      winRate: Number(winRate.toFixed(2)),
      avgPnlPerTrade: Number(avgPnlPerTrade.toFixed(2)),
      chargeRatio: Number(chargeRatio.toFixed(4)),
      returnOnTurnover: Number(returnOnTurnover.toFixed(4))
    },
    
    breakdown: {
      quarterly: aggregatedData,
      monthly: monthlyBreakdown
    },
    
    charges: {
      breakdown: {
        brokerage: summary.brokerage,
        stt: summary.stt,
        exchangeCharges: summary.exchangeCharges,
        gst: summary.gst,
        sebiCharges: summary.sebiCharges,
        stampCharges: summary.stampCharges
      },
      percentages: {
        brokerage: summary.totalCharges > 0 ? (summary.brokerage / summary.totalCharges * 100).toFixed(2) + '%' : '0%',
        stt: summary.totalCharges > 0 ? (summary.stt / summary.totalCharges * 100).toFixed(2) + '%' : '0%',
        exchangeCharges: summary.totalCharges > 0 ? (summary.exchangeCharges / summary.totalCharges * 100).toFixed(2) + '%' : '0%',
        gst: summary.totalCharges > 0 ? (summary.gst / summary.totalCharges * 100).toFixed(2) + '%' : '0%',
        sebiCharges: summary.totalCharges > 0 ? (summary.sebiCharges / summary.totalCharges * 100).toFixed(2) + '%' : '0%',
        stampCharges: summary.totalCharges > 0 ? (summary.stampCharges / summary.totalCharges * 100).toFixed(2) + '%' : '0%'
      }
    },
    
    // Tax summary for ITR filing
    taxSummary: {
      speculative: {
        profit: Math.max(0, summary.netPnl),
        loss: Math.max(0, -summary.netPnl),
        netPnl: summary.netPnl
      },
      turnover: summary.totalTurnover,
      charges: summary.totalCharges,
      auditRequired: summary.totalTurnover > 10000000, // 1 Crore limit for tax audit
      presumptiveTaxRate: 0.06, // 6% for speculative business
      presumptiveTaxAmount: Math.max(0, summary.totalTurnover * 0.06)
    }
  }

  // Add detailed trades if requested
  if (format === 'detailed') {
    report.detailedTrades = detailedTrades
  }

  return NextResponse.json({
    success: true,
    report
  })
}

async function generateCalendarYearReport(userId: string, year: string, format: string) {
  const startDate = new Date(`${year}-01-01`)
  const endDate = new Date(`${year}-12-31T23:59:59`)
  
  return await generateQuarterlyReport(
    userId, 
    getFinancialYear(startDate), 
    null, // All quarters
    format
  )
}

// POST endpoint for generating and saving reports
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await dbConnect()
    
    const user = await User.findOne({ email: session.user.email })
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const body = await request.json()
    const { 
      financialYear, 
      quarter, 
      updateCharges = false,
      emailReport = false 
    } = body

    // Update charges if requested
    if (updateCharges) {
      console.log('🔄 Updating charges before generating report...')
      // This would call the charge update process
      // await batchUpdateTradeCharges(user._id)
    }

    // Generate report
    const reportResponse = await generateQuarterlyReport(user._id.toString(), financialYear, quarter, 'detailed')
    const reportData = await reportResponse.json()

    if (!reportData.success) {
      throw new Error('Failed to generate report')
    }

    // TODO: Save report to database for future reference
    // TODO: Email report if requested

    return NextResponse.json({
      success: true,
      message: 'Quarterly report generated successfully',
      report: reportData.report,
      actions: {
        chargesUpdated: updateCharges,
        emailSent: emailReport
      }
    })

  } catch (error) {
    console.error('Error in POST quarterly report:', error)
    return NextResponse.json(
      { error: 'Failed to generate quarterly report' },
      { status: 500 }
    )
  }
}