import { 
  calculateBrokerage,
  calculateExchangeCharges,
  calculateSTT,
  calculateStampDuty,
  calculateGST
} from '@/types/contractNote'

export interface ZerodhaTradeCharges {
  brokerage?: number
  stt?: number
  exchange_charges?: number
  gst?: number
  cgst?: number
  sgst?: number
  igst?: number
  sebi_charges?: number
  stamp_charges?: number
  total_charges?: number
  net_amount?: number
}

export interface ProcessedCharges {
  brokerage: number
  stt: number
  exchangeCharges: number
  gst: number
  cgst: number
  sgst: number
  igst: number
  sebiCharges: number
  stampCharges: number
  totalCharges: number
  netAmount: number
  currency: string
}

export interface TradeFinancials {
  turnover: number
  grossPnl: number
  netPnl: number
  financialYear: string
  quarter: string
  taxYear: string
}

/**
 * Process charges from Zerodha API response or calculate fallback charges
 */
export function processTradeCharges(
  trade: any,
  zerodhaCharges?: ZerodhaTradeCharges
): ProcessedCharges {
  const turnover = trade.quantity * trade.price
  const isBuy = trade.transactionType === 'BUY'
  const isSell = trade.transactionType === 'SELL'
  
  let charges: ProcessedCharges

  if (zerodhaCharges && hasValidCharges(zerodhaCharges)) {
    // Use real Zerodha charges when available
    console.log('🏛️ Using real Zerodha charges for trade:', trade.tradeId || trade._id)
    
    const gstBreakdown = zerodhaCharges.cgst || zerodhaCharges.sgst || zerodhaCharges.igst 
      ? {
          cgst: zerodhaCharges.cgst || 0,
          sgst: zerodhaCharges.sgst || 0,
          igst: zerodhaCharges.igst || 0
        }
      : calculateGST((zerodhaCharges.brokerage || 0) + (zerodhaCharges.exchange_charges || 0))
    
    charges = {
      brokerage: zerodhaCharges.brokerage || 0,
      stt: zerodhaCharges.stt || 0,
      exchangeCharges: zerodhaCharges.exchange_charges || 0,
      gst: zerodhaCharges.gst || (gstBreakdown.cgst + gstBreakdown.sgst + gstBreakdown.igst),
      cgst: gstBreakdown.cgst,
      sgst: gstBreakdown.sgst,
      igst: gstBreakdown.igst,
      sebiCharges: zerodhaCharges.sebi_charges || 0,
      stampCharges: zerodhaCharges.stamp_charges || 0,
      totalCharges: zerodhaCharges.total_charges || 0,
      netAmount: zerodhaCharges.net_amount || (turnover - (zerodhaCharges.total_charges || 0)),
      currency: 'INR'
    }
    
    // Validate total charges calculation
    if (!charges.totalCharges) {
      charges.totalCharges = charges.brokerage + charges.stt + charges.exchangeCharges + 
        charges.gst + charges.sebiCharges + charges.stampCharges
    }
  } else {
    // Fallback to calculated charges
    console.log('🧮 Calculating fallback charges for trade:', trade.tradeId || trade._id)
    
    const brokerage = calculateBrokerage(turnover)
    const exchangeCharges = calculateExchangeCharges(turnover)
    const stt = calculateSTT(turnover, isSell)
    const stampCharges = calculateStampDuty(turnover, isBuy)
    const sebiCharges = turnover * 0.000001 // Rs 1 per crore
    
    const taxableAmount = brokerage + exchangeCharges
    const gstBreakdown = calculateGST(taxableAmount)
    const totalGst = gstBreakdown.cgst + gstBreakdown.sgst + gstBreakdown.igst
    
    const totalCharges = brokerage + stt + exchangeCharges + totalGst + sebiCharges + stampCharges
    
    charges = {
      brokerage,
      stt,
      exchangeCharges,
      gst: totalGst,
      cgst: gstBreakdown.cgst,
      sgst: gstBreakdown.sgst,
      igst: gstBreakdown.igst,
      sebiCharges,
      stampCharges,
      totalCharges,
      netAmount: isBuy ? -(turnover + totalCharges) : (turnover - totalCharges),
      currency: 'INR'
    }
  }
  
  return charges
}

/**
 * Calculate financial metrics for a trade
 */
export function calculateTradeFinancials(trade: any, charges: ProcessedCharges): TradeFinancials {
  const turnover = trade.quantity * trade.price
  const tradeDate = new Date(trade.timestamp)
  
  // Calculate financial year (April 1 - March 31)
  const financialYear = getFinancialYear(tradeDate)
  const quarter = getQuarter(tradeDate)
  const taxYear = financialYear
  
  // Calculate P&L (this is simplified - actual P&L calculation needs matched buy/sell pairs)
  const grossPnl = 0 // Will be calculated when matching buy/sell pairs
  const netPnl = grossPnl - charges.totalCharges
  
  return {
    turnover,
    grossPnl,
    netPnl,
    financialYear,
    quarter,
    taxYear
  }
}

/**
 * Get financial year from date (April 1 - March 31)
 */
export function getFinancialYear(date: Date): string {
  const month = date.getMonth() + 1 // 1-12
  const year = date.getFullYear()
  
  if (month >= 4) {
    // April to March of next year
    return `FY${year}-${String(year + 1).slice(-2)}`
  } else {
    // January to March
    return `FY${year - 1}-${String(year).slice(-2)}`
  }
}

/**
 * Get quarter from date based on financial year
 */
export function getQuarter(date: Date): string {
  const month = date.getMonth() + 1 // 1-12
  
  // Financial year quarters:
  // Q1: April-June, Q2: July-Sep, Q3: Oct-Dec, Q4: Jan-Mar
  if (month >= 4 && month <= 6) return 'Q1'
  if (month >= 7 && month <= 9) return 'Q2'
  if (month >= 10 && month <= 12) return 'Q3'
  return 'Q4' // Jan-Mar
}

/**
 * Check if Zerodha charges are valid and complete
 */
function hasValidCharges(charges: ZerodhaTradeCharges): boolean {
  // Check if at least brokerage or total_charges is present
  return !!(charges.brokerage !== undefined || charges.total_charges !== undefined)
}

/**
 * Update existing trade with processed charges
 */
export async function updateTradeCharges(tradeId: string, charges: ProcessedCharges, financials: TradeFinancials) {
  const Trade = (await import('@/models/Trade')).default
  
  try {
    const result = await Trade.findByIdAndUpdate(
      tradeId,
      {
        $set: {
          charges,
          turnover: financials.turnover,
          grossPnl: financials.grossPnl,
          netPnl: financials.netPnl,
          financialYear: financials.financialYear,
          quarter: financials.quarter,
          taxYear: financials.taxYear,
          chargesLastUpdated: new Date()
        }
      },
      { new: true }
    )
    
    console.log('✅ Updated charges for trade:', tradeId)
    return result
  } catch (error) {
    console.error('❌ Error updating trade charges:', error)
    throw error
  }
}

/**
 * Batch update charges for multiple trades
 */
export async function batchUpdateTradeCharges(userId: string, startDate?: Date, endDate?: Date) {
  const Trade = (await import('@/models/Trade')).default
  
  const query: any = { userId }
  if (startDate || endDate) {
    query.timestamp = {}
    if (startDate) query.timestamp.$gte = startDate
    if (endDate) query.timestamp.$lte = endDate
  }
  
  const trades = await Trade.find(query).sort({ timestamp: 1 })
  console.log(`🔄 Processing charges for ${trades.length} trades`)
  
  let updated = 0
  let errors = 0
  
  for (const trade of trades) {
    try {
      // Extract Zerodha charges if available
      const zerodhaCharges = trade.zerodhaData?.charges || trade.zerodhaData
      
      // Process charges
      const charges = processTradeCharges(trade, zerodhaCharges)
      const financials = calculateTradeFinancials(trade, charges)
      
      // Update trade
      await updateTradeCharges(trade._id.toString(), charges, financials)
      updated++
    } catch (error) {
      console.error(`❌ Error processing trade ${trade._id}:`, error)
      errors++
    }
  }
  
  console.log(`✅ Batch update complete: ${updated} updated, ${errors} errors`)
  return { updated, errors, total: trades.length }
}

/**
 * Calculate aggregated P&L for a user in a specific period
 */
export async function calculatePeriodPnL(
  userId: string, 
  startDate: Date, 
  endDate: Date
): Promise<{
  totalTurnover: number
  totalCharges: number
  grossPnl: number
  netPnl: number
  tradeCount: number
  chargeBreakdown: ProcessedCharges
}> {
  const Trade = (await import('@/models/Trade')).default
  
  const result = await Trade.aggregate([
    {
      $match: {
        userId: new (require('mongoose')).Types.ObjectId(userId),
        timestamp: { $gte: startDate, $lte: endDate }
      }
    },
    {
      $group: {
        _id: null,
        totalTurnover: { $sum: '$turnover' },
        totalCharges: { $sum: '$charges.totalCharges' },
        grossPnl: { $sum: '$grossPnl' },
        netPnl: { $sum: '$netPnl' },
        tradeCount: { $sum: 1 },
        totalBrokerage: { $sum: '$charges.brokerage' },
        totalStt: { $sum: '$charges.stt' },
        totalExchangeCharges: { $sum: '$charges.exchangeCharges' },
        totalGst: { $sum: '$charges.gst' },
        totalSebiCharges: { $sum: '$charges.sebiCharges' },
        totalStampCharges: { $sum: '$charges.stampCharges' }
      }
    }
  ])
  
  if (!result || result.length === 0) {
    return {
      totalTurnover: 0,
      totalCharges: 0,
      grossPnl: 0,
      netPnl: 0,
      tradeCount: 0,
      chargeBreakdown: {
        brokerage: 0,
        stt: 0,
        exchangeCharges: 0,
        gst: 0,
        cgst: 0,
        sgst: 0,
        igst: 0,
        sebiCharges: 0,
        stampCharges: 0,
        totalCharges: 0,
        netAmount: 0,
        currency: 'INR'
      }
    }
  }
  
  const data = result[0]
  return {
    totalTurnover: data.totalTurnover || 0,
    totalCharges: data.totalCharges || 0,
    grossPnl: data.grossPnl || 0,
    netPnl: data.netPnl || 0,
    tradeCount: data.tradeCount || 0,
    chargeBreakdown: {
      brokerage: data.totalBrokerage || 0,
      stt: data.totalStt || 0,
      exchangeCharges: data.totalExchangeCharges || 0,
      gst: data.totalGst || 0,
      cgst: 0, // Aggregated, breakdown not available
      sgst: 0,
      igst: 0,
      sebiCharges: data.totalSebiCharges || 0,
      stampCharges: data.totalStampCharges || 0,
      totalCharges: data.totalCharges || 0,
      netAmount: (data.grossPnl || 0) - (data.totalCharges || 0),
      currency: 'INR'
    }
  }
}