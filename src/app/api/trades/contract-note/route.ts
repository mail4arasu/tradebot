import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import dbConnect from '@/lib/mongoose'
import User from '@/models/User'
import Trade from '@/models/Trade'
import { 
  ContractNote, 
  DerivativeTrade, 
  ContractNoteRequest,
  calculateBrokerage,
  calculateExchangeCharges,
  calculateSTT,
  calculateStampDuty,
  calculateGST
} from '@/types/contractNote'

// TradeBot Portal broker information
const TRADEBOT_BROKER_INFO = {
  name: 'TradeBot Portal',
  address: 'Technology Hub, Bangalore, Karnataka, India',
  phone: '+91 80 4718 1888',
  website: 'https://niveshawealth.in',
  sebiRegistration: 'INZ000031633', // Using Zerodha's for reference
  complianceOfficer: {
    name: 'System Administrator',
    phone: '+91 80 4718 1888',
    email: 'compliance@niveshawealth.in'
  },
  investorComplaintEmail: 'complaints@niveshawealth.in'
}

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

    const body: ContractNoteRequest = await request.json()
    const { startDate, endDate, includeCharges = true } = body

    // Validate date range
    const start = new Date(startDate)
    const end = new Date(endDate)
    if (start > end) {
      return NextResponse.json({ error: 'Invalid date range' }, { status: 400 })
    }

    // Fetch trades for the date range
    const trades = await Trade.find({
      userId: user._id,
      timestamp: {
        $gte: start,
        $lte: new Date(end.getTime() + 24 * 60 * 60 * 1000) // Include end date
      }
    }).sort({ timestamp: 1 })

    if (trades.length === 0) {
      return NextResponse.json({ error: 'No trades found for the specified date range' }, { status: 404 })
    }

    // Generate contract note
    const contractNote = await generateContractNote(user, trades, startDate, endDate, includeCharges)

    return NextResponse.json({
      success: true,
      contractNote
    })

  } catch (error) {
    console.error('Error generating contract note:', error)
    return NextResponse.json(
      { error: 'Failed to generate contract note' },
      { status: 500 }
    )
  }
}

async function generateContractNote(
  user: any,
  trades: any[],
  startDate: string,
  endDate: string,
  includeCharges: boolean
): Promise<ContractNote> {
  
  // Generate contract note number (format: CNT-DD/MM-YYYYMMDD)
  const today = new Date()
  const contractNoteNumber = `CNT-${today.getDate().toString().padStart(2, '0')}/${(today.getMonth() + 1).toString().padStart(2, '0')}-${today.getFullYear()}${(today.getMonth() + 1).toString().padStart(2, '0')}${today.getDate().toString().padStart(2, '0')}`
  
  // Generate IRN (Invoice Reference Number) - same format for simplicity
  const invoiceReferenceNumber = contractNoteNumber

  // Convert trades to derivative trades format using stored charges
  const derivatives: DerivativeTrade[] = []
  let totalTurnover = 0
  let totalBrokerage = 0
  let totalCharges = 0

  // Group trades by symbol and process
  const groupedTrades = groupTradesBySymbol(trades)
  
  for (const [symbol, symbolTrades] of Object.entries(groupedTrades)) {
    for (const trade of symbolTrades) {
      const turnover = trade.turnover || (trade.quantity * trade.price)
      
      // Use stored charges if available, otherwise calculate
      const storedCharges = trade.charges
      let brokerage, exchangeCharges, netTotal
      
      if (storedCharges && storedCharges.totalCharges > 0) {
        // Use real stored charges
        console.log('📊 Using stored charges for trade:', trade.tradeId || trade._id)
        brokerage = storedCharges.brokerage || 0
        exchangeCharges = storedCharges.exchangeCharges || 0
        netTotal = storedCharges.netAmount || 0
        totalCharges += storedCharges.totalCharges
      } else {
        // Fallback to calculated charges
        console.log('🧮 Using calculated charges for trade:', trade.tradeId || trade._id)
        brokerage = calculateBrokerage(turnover)
        exchangeCharges = calculateExchangeCharges(turnover)
        netTotal = trade.transactionType === 'BUY' 
          ? -(turnover + brokerage + exchangeCharges)
          : (turnover - brokerage - exchangeCharges)
        totalCharges += (brokerage + exchangeCharges)
      }
      
      totalTurnover += turnover
      totalBrokerage += brokerage

      const derivativeTrade: DerivativeTrade = {
        contractDescription: `${trade.tradingSymbol} - ${trade.exchange}`,
        buyOrSell: trade.transactionType === 'BUY' ? 'B' : 'S',
        quantity: trade.quantity,
        wap: trade.price,
        brokeragePerUnit: brokerage / trade.quantity,
        wapAfterBrokerage: trade.transactionType === 'BUY' 
          ? trade.price + (brokerage / trade.quantity)
          : trade.price - (brokerage / trade.quantity),
        netTotal: netTotal,
        
        // Annexure details
        orderNumber: trade.zerodhaData?.order_id || trade.orderId || `ORD${Date.now()}`,
        orderTime: formatTime(trade.timestamp),
        tradeNumber: trade.tradeId || trade._id.toString().slice(-8),
        tradeTime: formatTime(trade.timestamp),
        exchange: trade.exchange,
        product: trade.zerodhaData?.product || trade.product || 'MIS',
        brokerage: brokerage,
        netRatePerUnit: trade.price,
        remarks: trade.zerodhaData?.status_message || ''
      }

      derivatives.push(derivativeTrade)
    }
  }

  // Calculate aggregated charges from stored data or fallback to calculations
  let aggregatedCharges = {
    brokerage: 0,
    stt: 0,
    exchangeCharges: 0,
    cgst: 0,
    sgst: 0,
    igst: 0,
    sebiCharges: 0,
    stampCharges: 0,
    totalCharges: 0
  }

  // Sum up all stored charges from trades
  let tradesWithStoredCharges = 0
  for (const [symbol, symbolTrades] of Object.entries(groupedTrades)) {
    for (const trade of symbolTrades) {
      if (trade.charges && trade.charges.totalCharges > 0) {
        aggregatedCharges.brokerage += trade.charges.brokerage || 0
        aggregatedCharges.stt += trade.charges.stt || 0
        aggregatedCharges.exchangeCharges += trade.charges.exchangeCharges || 0
        aggregatedCharges.cgst += trade.charges.cgst || 0
        aggregatedCharges.sgst += trade.charges.sgst || 0
        aggregatedCharges.igst += trade.charges.igst || 0
        aggregatedCharges.sebiCharges += trade.charges.sebiCharges || 0
        aggregatedCharges.stampCharges += trade.charges.stampCharges || 0
        aggregatedCharges.totalCharges += trade.charges.totalCharges || 0
        tradesWithStoredCharges++
      }
    }
  }

  // If we have stored charges for all trades, use them; otherwise calculate
  if (tradesWithStoredCharges === trades.length) {
    console.log('📊 Using aggregated stored charges for contract note')
  } else {
    console.log(`🧮 Mixed charges: ${tradesWithStoredCharges}/${trades.length} trades have stored charges, calculating remainder`)
    
    // For trades without stored charges, add calculated values
    const taxableValueOfSupply = totalBrokerage
    const exchangeTransactionCharges = calculateExchangeCharges(totalTurnover)
    const gst = calculateGST(taxableValueOfSupply + exchangeTransactionCharges)
    
    let totalStt = 0
    let totalStampDuty = 0
    
    derivatives.forEach(trade => {
      totalStt += calculateSTT(Math.abs(trade.netTotal), trade.buyOrSell === 'S')
      totalStampDuty += calculateStampDuty(Math.abs(trade.netTotal), trade.buyOrSell === 'B')
    })

    const sebiTurnoverFees = totalTurnover * 0.000001 // Rs 1 per crore
    
    // Add calculated charges to aggregated charges if not fully covered
    if (tradesWithStoredCharges < trades.length) {
      const calculatedCharges = taxableValueOfSupply + exchangeTransactionCharges + 
        gst.cgst + gst.sgst + gst.igst + totalStt + sebiTurnoverFees + totalStampDuty
      
      // Only add if aggregated charges seem insufficient
      if (aggregatedCharges.totalCharges < calculatedCharges * 0.5) {
        aggregatedCharges.totalCharges = Math.max(aggregatedCharges.totalCharges, calculatedCharges)
        aggregatedCharges.brokerage = Math.max(aggregatedCharges.brokerage, taxableValueOfSupply)
        aggregatedCharges.exchangeCharges = Math.max(aggregatedCharges.exchangeCharges, exchangeTransactionCharges)
        aggregatedCharges.cgst = Math.max(aggregatedCharges.cgst, gst.cgst)
        aggregatedCharges.sgst = Math.max(aggregatedCharges.sgst, gst.sgst)
        aggregatedCharges.igst = Math.max(aggregatedCharges.igst, gst.igst)
        aggregatedCharges.stt = Math.max(aggregatedCharges.stt, totalStt)
        aggregatedCharges.sebiCharges = Math.max(aggregatedCharges.sebiCharges, sebiTurnoverFees)
        aggregatedCharges.stampCharges = Math.max(aggregatedCharges.stampCharges, totalStampDuty)
      }
    }
  }

  const netPayable = derivatives.reduce((sum, trade) => sum + trade.netTotal, 0)

  // Calculate settlement date (T+1 for derivatives)
  const settlementDate = new Date(endDate)
  settlementDate.setDate(settlementDate.getDate() + 1)

  const contractNote: ContractNote = {
    contractNoteNumber,
    invoiceReferenceNumber,
    tradeDate: startDate === endDate ? startDate : `${startDate} to ${endDate}`,
    settlementDate: settlementDate.toISOString().split('T')[0],
    
    client: {
      name: user.name || 'TradeBot User',
      clientId: user._id.toString().slice(-8).toUpperCase(),
      address: user.address || 'Address not provided',
      pan: user.pan || 'PANXXXXXXXXX',
      ucc: user._id.toString().slice(-6).toUpperCase()
    },
    
    broker: TRADEBOT_BROKER_INFO,
    
    derivatives,
    
    summary: {
      nclCash: 0,
      nclFo: netPayable,
      netTotal: netPayable - aggregatedCharges.totalCharges
    },
    
    charges: {
      payInPayOut: netPayable,
      taxableValueOfSupply: includeCharges ? aggregatedCharges.brokerage : 0,
      exchangeTransactionCharges: includeCharges ? aggregatedCharges.exchangeCharges : 0,
      clearingCharges: 0,
      cgst: includeCharges ? aggregatedCharges.cgst : 0,
      sgst: includeCharges ? aggregatedCharges.sgst : 0,
      igst: includeCharges ? aggregatedCharges.igst : 0,
      securitiesTransactionTax: includeCharges ? aggregatedCharges.stt : 0,
      sebiTurnoverFees: includeCharges ? aggregatedCharges.sebiCharges : 0,
      stampDuty: includeCharges ? aggregatedCharges.stampCharges : 0,
      netAmount: netPayable - (includeCharges ? aggregatedCharges.totalCharges : 0)
    },
    
    generatedAt: new Date().toISOString(),
    generatedBy: 'TradeBot Portal'
  }

  return contractNote
}

function groupTradesBySymbol(trades: any[]): Record<string, any[]> {
  return trades.reduce((groups, trade) => {
    const key = trade.tradingSymbol
    if (!groups[key]) {
      groups[key] = []
    }
    groups[key].push(trade)
    return groups
  }, {})
}

function formatTime(dateString: string): string {
  return new Date(dateString).toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  })
}

// GET endpoint to download contract note as JSON (for debugging)
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const url = new URL(request.url)
    const startDate = url.searchParams.get('startDate')
    const endDate = url.searchParams.get('endDate')
    
    if (!startDate || !endDate) {
      return NextResponse.json({ error: 'startDate and endDate are required' }, { status: 400 })
    }

    await dbConnect()
    
    const user = await User.findOne({ email: session.user.email })
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const trades = await Trade.find({
      userId: user._id,
      timestamp: {
        $gte: new Date(startDate),
        $lte: new Date(new Date(endDate).getTime() + 24 * 60 * 60 * 1000)
      }
    }).sort({ timestamp: 1 })

    if (trades.length === 0) {
      return NextResponse.json({ error: 'No trades found for the specified date range' }, { status: 404 })
    }

    const contractNote = await generateContractNote(user, trades, startDate, endDate, true)

    return NextResponse.json({
      success: true,
      contractNote,
      tradeCount: trades.length
    })

  } catch (error) {
    console.error('Error fetching contract note data:', error)
    return NextResponse.json(
      { error: 'Failed to fetch contract note data' },
      { status: 500 }
    )
  }
}