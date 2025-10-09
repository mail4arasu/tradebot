'use client'

import { ContractNote } from '@/types/contractNote'

interface ContractNoteProps {
  contractNote: ContractNote
  showPrintStyles?: boolean
}

export default function ContractNoteComponent({ contractNote, showPrintStyles = false }: ContractNoteProps) {
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

  return (
    <div className={`bg-white text-black ${showPrintStyles ? 'print-contract-note' : ''}`}>
      {/* Page Styles for PDF generation */}
      <style jsx>{`
        .print-contract-note {
          font-family: Arial, sans-serif;
          font-size: 12px;
          line-height: 1.4;
          max-width: 210mm;
          margin: 0 auto;
          padding: 20px;
        }
        .print-contract-note table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 10px;
        }
        .print-contract-note th,
        .print-contract-note td {
          border: 1px solid #000;
          padding: 4px 6px;
          text-align: left;
          vertical-align: top;
        }
        .print-contract-note th {
          background-color: #f5f5f5;
          font-weight: bold;
        }
        .print-contract-note .text-center {
          text-align: center;
        }
        .print-contract-note .text-right {
          text-align: right;
        }
        .print-contract-note .font-bold {
          font-weight: bold;
        }
        .print-contract-note .header-section {
          margin-bottom: 20px;
        }
        .print-contract-note .company-header {
          text-align: center;
          margin-bottom: 15px;
          padding: 10px;
          border: 2px solid #000;
        }
        .print-contract-note .company-name {
          font-size: 24px;
          font-weight: bold;
          color: #1e3a8a;
          margin-bottom: 5px;
        }
        .print-contract-note .contract-title {
          font-size: 16px;
          font-weight: bold;
          margin-bottom: 5px;
        }
        .print-contract-note .tax-invoice {
          font-style: italic;
          color: #666;
        }
      `}</style>

      {/* Header Section */}
      <div className="header-section">
        <div className="company-header">
          <div className="company-name">🤖 TRADEBOT PORTAL</div>
          <div>Technology Hub, Bangalore, Karnataka, India</div>
          <div className="contract-title">CONTRACT NOTE CUM TAX INVOICE</div>
          <div className="tax-invoice">(Tax Invoice under Section 31 of GST Act)</div>
        </div>

        <table>
          <tbody>
            <tr>
              <td className="font-bold">TradeBot Portal</td>
              <td className="font-bold">Contract Note No:</td>
              <td className="font-bold">{contractNote.contractNoteNumber}</td>
              <td className="font-bold">NCL-Cash</td>
              <td className="font-bold">NCL-F&O</td>
            </tr>
            <tr>
              <td rowSpan={6}>
                <div className="font-bold">{contractNote.broker.name}</div>
                <div>{contractNote.broker.address}</div>
                <div><strong>Dealing Address:</strong> {contractNote.broker.address}</div>
                <div><strong>Phone:</strong> {contractNote.broker.phone}</div>
                <div>{contractNote.broker.website}</div>
                <div><strong>SEBI registration:</strong> {contractNote.broker.sebiRegistration}</div>
                <div><strong>Phone:</strong> {contractNote.broker.phone}</div>
              </td>
              <td className="font-bold">Invoice Reference Number(IRN):</td>
              <td>{contractNote.invoiceReferenceNumber}</td>
              <td rowSpan={2} className="text-center font-bold">
                {formatCurrency(contractNote.summary.nclCash)}
              </td>
              <td rowSpan={2} className="text-center font-bold">
                {formatCurrency(contractNote.summary.nclFo)}
              </td>
            </tr>
            <tr>
              <td className="font-bold">Trade Date:</td>
              <td>{contractNote.tradeDate}</td>
            </tr>
            <tr>
              <td className="font-bold">Settlement No:</td>
              <td></td>
              <td className="font-bold">Settlement Date:</td>
              <td>{formatDate(contractNote.settlementDate)}</td>
            </tr>
            <tr>
              <td colSpan={4}>
                <div className="font-bold">{contractNote.client.clientId}</div>
                <div className="font-bold">{contractNote.client.name}</div>
              </td>
            </tr>
            <tr>
              <td colSpan={4}>
                <div className="font-bold">Address</div>
                <div>{contractNote.client.address}</div>
              </td>
            </tr>
            <tr>
              <td colSpan={4}>
                <div><strong>Place of supply:</strong> KARNATAKA</div>
                <div><strong>GST State Code:</strong> 29</div>
                <div><strong>PAN:</strong> {contractNote.client.pan}</div>
                <div><strong>UCC:</strong> {contractNote.client.ucc}</div>
              </td>
            </tr>
          </tbody>
        </table>

        <div className="text-center font-bold">
          <div>Compliance Officer</div>
          <div>{contractNote.broker.complianceOfficer.name}</div>
          <div>{contractNote.broker.complianceOfficer.phone}, {contractNote.broker.complianceOfficer.email}</div>
          <div>Investor Complaint Email ID: {contractNote.broker.investorComplaintEmail}</div>
        </div>
      </div>

      {/* Trade Details Section */}
      <div>
        <div className="font-bold text-left mb-2">
          Dear {contractNote.client.name},
        </div>
        <div className="mb-4">
          I / We have this day done by your order and on your account the following transactions:
        </div>

        <div className="font-bold text-xl mb-4">Derivatives</div>

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
            {contractNote.derivatives.map((trade, index) => (
              <tr key={index}>
                <td>{trade.contractDescription}</td>
                <td className="text-center">{trade.buyOrSell}</td>
                <td className="text-right">{trade.quantity}</td>
                <td className="text-right">{trade.wap.toFixed(2)}</td>
                <td className="text-right">{trade.brokeragePerUnit.toFixed(4)}</td>
                <td className="text-right">{trade.wapAfterBrokerage.toFixed(4)}</td>
                <td className="text-right">{trade.closingRatePerUnit?.toFixed(2) || '-'}</td>
                <td className="text-right">{trade.netTotal < 0 ? '-' : ''}{formatCurrency(trade.netTotal)}</td>
                <td>{trade.remarks || ''}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="text-xs mt-2 mb-4">
          ¹ WAP (Weighted Average Price) = Total buy/sell trade value of contract / Total Qty bought/sold<br/>
          * Exchange-wise details of orders and trades provided in separate annexure.
        </div>
      </div>

      {/* Charges Summary */}
      <div className="mt-8">
        <table>
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
              <td className="text-right">{formatCurrency(contractNote.summary.nclCash)}</td>
              <td className="text-right">({formatCurrency(Math.abs(contractNote.charges.payInPayOut))})</td>
              <td className="text-right">({formatCurrency(Math.abs(contractNote.charges.payInPayOut))})</td>
            </tr>
            <tr>
              <td>Taxable value of Supply (Brokerage) (₹)²</td>
              <td className="text-right"></td>
              <td className="text-right">({formatCurrency(contractNote.charges.taxableValueOfSupply)})</td>
              <td className="text-right">({formatCurrency(contractNote.charges.taxableValueOfSupply)})</td>
            </tr>
            <tr>
              <td>Exchange transaction charges (₹)³</td>
              <td className="text-right"></td>
              <td className="text-right">({formatCurrency(contractNote.charges.exchangeTransactionCharges)})</td>
              <td className="text-right">({formatCurrency(contractNote.charges.exchangeTransactionCharges)})</td>
            </tr>
            <tr>
              <td>Clearing charges (₹)</td>
              <td className="text-right"></td>
              <td className="text-right">{formatCurrency(contractNote.charges.clearingCharges)}</td>
              <td className="text-right">{formatCurrency(contractNote.charges.clearingCharges)}</td>
            </tr>
            <tr>
              <td>CGST (@9% of Brok, SEBI, Trans & Clearing Charges) (₹)³</td>
              <td className="text-right"></td>
              <td className="text-right">({formatCurrency(contractNote.charges.cgst)})</td>
              <td className="text-right">({formatCurrency(contractNote.charges.cgst)})</td>
            </tr>
            <tr>
              <td>SGST (@9% of Brok, SEBI, Trans & Clearing Charges) (₹)³</td>
              <td className="text-right"></td>
              <td className="text-right">({formatCurrency(contractNote.charges.sgst)})</td>
              <td className="text-right">({formatCurrency(contractNote.charges.sgst)})</td>
            </tr>
            <tr>
              <td>IGST (@18% of Brok, SEBI, Trans & Clearing Charges) (₹)³</td>
              <td className="text-right"></td>
              <td className="text-right">({formatCurrency(contractNote.charges.igst)})</td>
              <td className="text-right">({formatCurrency(contractNote.charges.igst)})</td>
            </tr>
            <tr>
              <td>Securities transaction tax (₹)</td>
              <td className="text-right"></td>
              <td className="text-right">({formatCurrency(contractNote.charges.securitiesTransactionTax)})</td>
              <td className="text-right">({formatCurrency(contractNote.charges.securitiesTransactionTax)})</td>
            </tr>
            <tr>
              <td>SEBI turnover fees (₹)</td>
              <td className="text-right"></td>
              <td className="text-right">({formatCurrency(contractNote.charges.sebiTurnoverFees)})</td>
              <td className="text-right">({formatCurrency(contractNote.charges.sebiTurnoverFees)})</td>
            </tr>
            <tr>
              <td>Stamp duty (₹)</td>
              <td className="text-right"></td>
              <td className="text-right">({formatCurrency(contractNote.charges.stampDuty)})</td>
              <td className="text-right">({formatCurrency(contractNote.charges.stampDuty)})</td>
            </tr>
            <tr className="font-bold">
              <td>Net amount receivable/(payable by client) (₹)</td>
              <td className="text-right">{formatCurrency(contractNote.summary.nclCash)}</td>
              <td className="text-right">({formatCurrency(Math.abs(contractNote.charges.netAmount))})</td>
              <td className="text-right">({formatCurrency(Math.abs(contractNote.charges.netAmount))})</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Annexure Section */}
      {contractNote.derivatives.length > 0 && (
        <div className="mt-8 page-break-before">
          <div className="font-bold text-xl mb-4">Annexure A</div>
          <div className="font-bold mb-4">Derivatives</div>
          
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
              {contractNote.derivatives.map((trade, index) => (
                <tr key={index}>
                  <td>{trade.orderNumber}</td>
                  <td>{trade.orderTime}</td>
                  <td>{trade.tradeNumber}</td>
                  <td>{trade.tradeTime}</td>
                  <td>{trade.contractDescription}</td>
                  <td className="text-center">{trade.buyOrSell}</td>
                  <td>{trade.exchange}</td>
                  <td className="text-right">{trade.quantity}</td>
                  <td className="text-right">{formatCurrency(trade.brokerage)}</td>
                  <td className="text-right">{trade.netRatePerUnit.toFixed(2)}</td>
                  <td className="text-right">{trade.closingRatePerUnit?.toFixed(2) || ''}</td>
                  <td className="text-right">{trade.netTotal < 0 ? '(' : ''}{formatCurrency(trade.netTotal)}{trade.netTotal < 0 ? ')' : ''}</td>
                  <td>{trade.remarks || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Footer */}
      <div className="mt-8 text-xs text-gray-600">
        <div>Generated by {contractNote.generatedBy} on {new Date(contractNote.generatedAt).toLocaleString('en-IN')}</div>
        <div>This is a computer-generated document and does not require a signature.</div>
      </div>
    </div>
  )
}