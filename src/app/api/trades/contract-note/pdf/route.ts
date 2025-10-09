import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import dbConnect from '@/lib/mongoose'
import User from '@/models/User'
import Trade from '@/models/Trade'
import { 
  ContractNote, 
  DerivativeTrade, 
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

    // Fetch trades for the date range
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

    // Generate contract note
    const contractNote = await generateContractNote(user, trades, startDate, endDate, true)

    // Generate HTML for PDF
    const html = generateContractNoteHTML(contractNote)

    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html',
        'Content-Disposition': `inline; filename="contract-note-${startDate}-${endDate}.html"`
      }
    })

  } catch (error) {
    console.error('Error generating contract note PDF:', error)
    return NextResponse.json(
      { error: 'Failed to generate contract note PDF' },
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
        brokerage = storedCharges.brokerage || 0
        exchangeCharges = storedCharges.exchangeCharges || 0
        netTotal = storedCharges.netAmount || 0
        totalCharges += storedCharges.totalCharges
      } else {
        // Fallback to calculated charges
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

  // Calculate charges
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
  
  const calculatedTotalCharges = taxableValueOfSupply + exchangeTransactionCharges + 
    gst.cgst + gst.sgst + gst.igst + totalStt + sebiTurnoverFees + totalStampDuty

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
      netTotal: netPayable - calculatedTotalCharges
    },
    
    charges: {
      payInPayOut: netPayable,
      taxableValueOfSupply: includeCharges ? taxableValueOfSupply : 0,
      exchangeTransactionCharges: includeCharges ? exchangeTransactionCharges : 0,
      clearingCharges: 0,
      cgst: includeCharges ? gst.cgst : 0,
      sgst: includeCharges ? gst.sgst : 0,
      igst: includeCharges ? gst.igst : 0,
      securitiesTransactionTax: includeCharges ? totalStt : 0,
      sebiTurnoverFees: includeCharges ? sebiTurnoverFees : 0,
      stampDuty: includeCharges ? totalStampDuty : 0,
      netAmount: netPayable - (includeCharges ? calculatedTotalCharges : 0)
    },
    
    generatedAt: new Date().toISOString(),
    generatedBy: 'TradeBot Portal'
  }

  return contractNote
}

function generateContractNoteHTML(contractNote: ContractNote): string {
  const formatCurrency = (amount: number) => {
    return `₹${Math.abs(amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    })
  }

  return `
<!DOCTYPE html>
<html>
<head>
  <title>Contract Note - ${contractNote.contractNoteNumber}</title>
  <meta charset="UTF-8">
  <style>
    body {
      font-family: Arial, sans-serif;
      font-size: 12px;
      line-height: 1.4;
      max-width: 210mm;
      margin: 0 auto;
      padding: 20px;
      color: #000;
      background: #fff;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 10px;
    }
    th, td {
      border: 1px solid #000;
      padding: 4px 6px;
      text-align: left;
      vertical-align: top;
    }
    th {
      background-color: #f5f5f5;
      font-weight: bold;
    }
    .text-center { text-align: center; }
    .text-right { text-align: right; }
    .font-bold { font-weight: bold; }
    .company-header {
      text-align: center;
      margin-bottom: 15px;
      padding: 10px;
      border: 2px solid #000;
    }
    .company-name {
      font-size: 24px;
      font-weight: bold;
      color: #1e3a8a;
      margin-bottom: 5px;
    }
    .contract-title {
      font-size: 16px;
      font-weight: bold;
      margin-bottom: 5px;
    }
    .tax-invoice {
      font-style: italic;
      color: #666;
    }
    .no-print {
      margin-bottom: 20px;
    }
    @media print {
      .no-print { display: none; }
      body { margin: 0; padding: 15px; }
    }
  </style>
</head>
<body>
  <div class="no-print">
    <button onclick="window.print()" style="padding: 10px 20px; background: #3b82f6; color: white; border: none; border-radius: 5px; cursor: pointer;">
      📄 Download PDF
    </button>
    <button onclick="window.close()" style="padding: 10px 20px; background: #6b7280; color: white; border: none; border-radius: 5px; cursor: pointer; margin-left: 10px;">
      Close
    </button>
  </div>

  <!-- Header Section -->
  <div class="company-header">
    <div class="company-name">🤖 TRADEBOT PORTAL</div>
    <div>${contractNote.broker.address}</div>
    <div class="contract-title">CONTRACT NOTE CUM TAX INVOICE</div>
    <div class="tax-invoice">(Tax Invoice under Section 31 of GST Act)</div>
  </div>

  <table>
    <tbody>
      <tr>
        <td class="font-bold">${contractNote.broker.name}</td>
        <td class="font-bold">Contract Note No:</td>
        <td class="font-bold">${contractNote.contractNoteNumber}</td>
        <td class="font-bold">NCL-Cash</td>
        <td class="font-bold">NCL-F&O</td>
      </tr>
      <tr>
        <td rowspan="6">
          <div class="font-bold">${contractNote.broker.name}</div>
          <div>${contractNote.broker.address}</div>
          <div><strong>Dealing Address:</strong> ${contractNote.broker.address}</div>
          <div><strong>Phone:</strong> ${contractNote.broker.phone}</div>
          <div>${contractNote.broker.website}</div>
          <div><strong>SEBI registration:</strong> ${contractNote.broker.sebiRegistration}</div>
          <div><strong>Phone:</strong> ${contractNote.broker.phone}</div>
        </td>
        <td class="font-bold">Invoice Reference Number(IRN):</td>
        <td>${contractNote.invoiceReferenceNumber}</td>
        <td rowspan="2" class="text-center font-bold">
          ${formatCurrency(contractNote.summary.nclCash)}
        </td>
        <td rowspan="2" class="text-center font-bold">
          ${formatCurrency(contractNote.summary.nclFo)}
        </td>
      </tr>
      <tr>
        <td class="font-bold">Trade Date:</td>
        <td>${contractNote.tradeDate}</td>
      </tr>
      <tr>
        <td class="font-bold">Settlement No:</td>
        <td></td>
        <td class="font-bold">Settlement Date:</td>
        <td>${formatDate(contractNote.settlementDate)}</td>
      </tr>
      <tr>
        <td colspan="4">
          <div class="font-bold">${contractNote.client.clientId}</div>
          <div class="font-bold">${contractNote.client.name}</div>
        </td>
      </tr>
      <tr>
        <td colspan="4">
          <div class="font-bold">Address</div>
          <div>${contractNote.client.address}</div>
        </td>
      </tr>
      <tr>
        <td colspan="4">
          <div><strong>Place of supply:</strong> KARNATAKA</div>
          <div><strong>GST State Code:</strong> 29</div>
          <div><strong>PAN:</strong> ${contractNote.client.pan}</div>
          <div><strong>UCC:</strong> ${contractNote.client.ucc}</div>
        </td>
      </tr>
    </tbody>
  </table>

  <div class="text-center font-bold" style="margin-bottom: 20px;">
    <div>Compliance Officer</div>
    <div>${contractNote.broker.complianceOfficer.name}</div>
    <div>${contractNote.broker.complianceOfficer.phone}, ${contractNote.broker.complianceOfficer.email}</div>
    <div>Investor Complaint Email ID: ${contractNote.broker.investorComplaintEmail}</div>
  </div>

  <!-- Trade Details Section -->
  <div class="font-bold" style="margin-bottom: 10px;">
    Dear ${contractNote.client.name},
  </div>
  <div style="margin-bottom: 20px;">
    I / We have this day done by your order and on your account the following transactions:
  </div>

  <div class="font-bold" style="font-size: 16px; margin-bottom: 15px;">Derivatives</div>

  <table>
    <thead>
      <tr>
        <th>Contract Description</th>
        <th>Buy(B)/Sell(S)/BF/CF</th>
        <th>Quantity</th>
        <th>WAP (Weighted Average Price) Per Unit ¹</th>
        <th>Brokerage Per Unit (₹)</th>
        <th>WAP Per unit after brokerage (₹)</th>
        <th>Closing Rate per Unit</th>
        <th>Net Total (Before Levies) (₹)</th>
        <th>Remarks</th>
      </tr>
    </thead>
    <tbody>
      ${contractNote.derivatives.map(trade => `
        <tr>
          <td>${trade.contractDescription}</td>
          <td class="text-center">${trade.buyOrSell}</td>
          <td class="text-right">${trade.quantity}</td>
          <td class="text-right">${trade.wap.toFixed(2)}</td>
          <td class="text-right">${trade.brokeragePerUnit.toFixed(4)}</td>
          <td class="text-right">${trade.wapAfterBrokerage.toFixed(4)}</td>
          <td class="text-right">${trade.closingRatePerUnit?.toFixed(2) || '-'}</td>
          <td class="text-right">${trade.netTotal < 0 ? '-' : ''}${formatCurrency(trade.netTotal)}</td>
          <td>${trade.remarks || ''}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>

  <div style="font-size: 10px; margin: 10px 0 20px 0;">
    ¹ WAP (Weighted Average Price) = Total buy/sell trade value of contract / Total Qty bought/sold<br/>
    * Exchange-wise details of orders and trades provided in separate annexure.
  </div>

  <!-- Charges Summary -->
  <table style="margin-top: 30px;">
    <thead>
      <tr>
        <th></th>
        <th>NCL-Cash</th>
        <th>NCL-F&O</th>
        <th>NET TOTAL</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>Pay in/Pay out obligation (₹)</td>
        <td class="text-right">${formatCurrency(contractNote.summary.nclCash)}</td>
        <td class="text-right">(${formatCurrency(Math.abs(contractNote.charges.payInPayOut))})</td>
        <td class="text-right">(${formatCurrency(Math.abs(contractNote.charges.payInPayOut))})</td>
      </tr>
      <tr>
        <td>Taxable value of Supply (Brokerage) (₹)²</td>
        <td class="text-right"></td>
        <td class="text-right">(${formatCurrency(contractNote.charges.taxableValueOfSupply)})</td>
        <td class="text-right">(${formatCurrency(contractNote.charges.taxableValueOfSupply)})</td>
      </tr>
      <tr>
        <td>Exchange transaction charges (₹)³</td>
        <td class="text-right"></td>
        <td class="text-right">(${formatCurrency(contractNote.charges.exchangeTransactionCharges)})</td>
        <td class="text-right">(${formatCurrency(contractNote.charges.exchangeTransactionCharges)})</td>
      </tr>
      <tr>
        <td>Clearing charges (₹)</td>
        <td class="text-right"></td>
        <td class="text-right">${formatCurrency(contractNote.charges.clearingCharges)}</td>
        <td class="text-right">${formatCurrency(contractNote.charges.clearingCharges)}</td>
      </tr>
      <tr>
        <td>CGST (@9% of Brok, SEBI, Trans & Clearing Charges) (₹)³</td>
        <td class="text-right"></td>
        <td class="text-right">(${formatCurrency(contractNote.charges.cgst)})</td>
        <td class="text-right">(${formatCurrency(contractNote.charges.cgst)})</td>
      </tr>
      <tr>
        <td>SGST (@9% of Brok, SEBI, Trans & Clearing Charges) (₹)³</td>
        <td class="text-right"></td>
        <td class="text-right">(${formatCurrency(contractNote.charges.sgst)})</td>
        <td class="text-right">(${formatCurrency(contractNote.charges.sgst)})</td>
      </tr>
      <tr>
        <td>IGST (@18% of Brok, SEBI, Trans & Clearing Charges) (₹)³</td>
        <td class="text-right"></td>
        <td class="text-right">(${formatCurrency(contractNote.charges.igst)})</td>
        <td class="text-right">(${formatCurrency(contractNote.charges.igst)})</td>
      </tr>
      <tr>
        <td>Securities transaction tax (₹)</td>
        <td class="text-right"></td>
        <td class="text-right">(${formatCurrency(contractNote.charges.securitiesTransactionTax)})</td>
        <td class="text-right">(${formatCurrency(contractNote.charges.securitiesTransactionTax)})</td>
      </tr>
      <tr>
        <td>SEBI turnover fees (₹)</td>
        <td class="text-right"></td>
        <td class="text-right">(${formatCurrency(contractNote.charges.sebiTurnoverFees)})</td>
        <td class="text-right">(${formatCurrency(contractNote.charges.sebiTurnoverFees)})</td>
      </tr>
      <tr>
        <td>Stamp duty (₹)</td>
        <td class="text-right"></td>
        <td class="text-right">(${formatCurrency(contractNote.charges.stampDuty)})</td>
        <td class="text-right">(${formatCurrency(contractNote.charges.stampDuty)})</td>
      </tr>
      <tr class="font-bold">
        <td>Net amount receivable/(payable by client) (₹)</td>
        <td class="text-right">${formatCurrency(contractNote.summary.nclCash)}</td>
        <td class="text-right">(${formatCurrency(Math.abs(contractNote.charges.netAmount))})</td>
        <td class="text-right">(${formatCurrency(Math.abs(contractNote.charges.netAmount))})</td>
      </tr>
    </tbody>
  </table>

  <!-- Annexure Section -->
  ${contractNote.derivatives.length > 0 ? `
  <div style="margin-top: 40px; page-break-before: auto;">
    <div class="font-bold" style="font-size: 16px; margin-bottom: 15px;">Annexure A</div>
    <div class="font-bold" style="margin-bottom: 15px;">Derivatives</div>
    
    <table>
      <thead>
        <tr>
          <th>Order No.</th>
          <th>Order Time</th>
          <th>Trade No.</th>
          <th>Trade Time</th>
          <th>Security / Contract Description</th>
          <th>Buy(B) / Sell(S)</th>
          <th>Exchange</th>
          <th>Quantity</th>
          <th>Brokerage (₹)</th>
          <th>Net Rate per Unit (₹)</th>
          <th>Closing Rate per Unit (only for Derivatives) (₹)</th>
          <th>Net Total (Before Levies) (₹)</th>
          <th>Remarks</th>
        </tr>
      </thead>
      <tbody>
        ${contractNote.derivatives.map(trade => `
          <tr>
            <td>${trade.orderNumber}</td>
            <td>${trade.orderTime}</td>
            <td>${trade.tradeNumber}</td>
            <td>${trade.tradeTime}</td>
            <td>${trade.contractDescription}</td>
            <td class="text-center">${trade.buyOrSell}</td>
            <td>${trade.exchange}</td>
            <td class="text-right">${trade.quantity}</td>
            <td class="text-right">${formatCurrency(trade.brokerage)}</td>
            <td class="text-right">${trade.netRatePerUnit.toFixed(2)}</td>
            <td class="text-right">${trade.closingRatePerUnit?.toFixed(2) || ''}</td>
            <td class="text-right">${trade.netTotal < 0 ? '(' : ''}${formatCurrency(trade.netTotal)}${trade.netTotal < 0 ? ')' : ''}</td>
            <td>${trade.remarks || ''}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  </div>
  ` : ''}

  <!-- Footer -->
  <div style="margin-top: 30px; font-size: 10px; color: #666;">
    <div>Generated by ${contractNote.generatedBy} on ${new Date(contractNote.generatedAt).toLocaleString('en-IN')}</div>
    <div>This is a computer-generated document and does not require a signature.</div>
  </div>
</body>
</html>
  `
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