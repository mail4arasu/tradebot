// Contract Note Types based on Zerodha format
export interface ContractNote {
  // Header Information
  contractNoteNumber: string
  invoiceReferenceNumber: string
  tradeDate: string
  settlementDate: string
  
  // Client Information
  client: {
    name: string
    clientId: string
    address: string
    pan: string
    ucc: string
  }
  
  // Broker Information
  broker: {
    name: string
    address: string
    phone: string
    website: string
    sebiRegistration: string
    complianceOfficer: {
      name: string
      phone: string
      email: string
    }
    investorComplaintEmail: string
  }
  
  // Trade Details
  derivatives: DerivativeTrade[]
  
  // Summary
  summary: {
    nclCash: number
    nclFo: number
    netTotal: number
  }
  
  // Charges Breakdown
  charges: {
    payInPayOut: number
    taxableValueOfSupply: number
    exchangeTransactionCharges: number
    clearingCharges: number
    cgst: number
    sgst: number
    igst: number
    securitiesTransactionTax: number
    sebiTurnoverFees: number
    stampDuty: number
    netAmount: number
  }
  
  // Generation metadata
  generatedAt: string
  generatedBy: string
}

export interface DerivativeTrade {
  contractDescription: string
  buyOrSell: 'B' | 'S'
  quantity: number
  wap: number // Weighted Average Price
  brokeragePerUnit: number
  wapAfterBrokerage: number
  closingRatePerUnit?: number
  netTotal: number
  
  // Detailed trade information for annexure
  orderNumber: string
  orderTime: string
  tradeNumber: string
  tradeTime: string
  exchange: string
  product: string
  brokerage: number
  netRatePerUnit: number
  remarks?: string
}

export interface ContractNoteRequest {
  userId: string
  startDate: string
  endDate: string
  includeCharges?: boolean
}

export interface ContractNoteResponse {
  success: boolean
  contractNote?: ContractNote
  pdfUrl?: string
  error?: string
}

// Tax rates and calculation constants
export const TAX_RATES = {
  BROKERAGE_RATE: 0.0003, // 0.03% or Rs 20 per order whichever is lower
  EXCHANGE_CHARGES_RATE: 0.0019, // 0.0019% of turnover
  CGST_RATE: 0.09, // 9% on brokerage + transaction charges
  SGST_RATE: 0.09, // 9% on brokerage + transaction charges  
  IGST_RATE: 0.18, // 18% for inter-state transactions
  STT_RATE: 0.0125, // 0.0125% on sell side of equity derivatives
  SEBI_CHARGES_RATE: 0.000001, // Rs 1 per crore of turnover
  STAMP_DUTY_RATE: 0.00003 // 0.003% on buy side
} as const

// Utility functions for calculations
export const calculateBrokerage = (turnover: number, isIntraday = false): number => {
  const rate = isIntraday ? 0.0003 : 0.0003
  return Math.min(turnover * rate, 20) // Max Rs 20 per order
}

export const calculateExchangeCharges = (turnover: number): number => {
  return turnover * TAX_RATES.EXCHANGE_CHARGES_RATE
}

export const calculateSTT = (turnover: number, isSell: boolean): number => {
  return isSell ? turnover * TAX_RATES.STT_RATE : 0
}

export const calculateStampDuty = (turnover: number, isBuy: boolean): number => {
  return isBuy ? turnover * TAX_RATES.STAMP_DUTY_RATE : 0
}

export const calculateGST = (taxableAmount: number, isInterState = false): { cgst: number, sgst: number, igst: number } => {
  if (isInterState) {
    return {
      cgst: 0,
      sgst: 0,
      igst: taxableAmount * TAX_RATES.IGST_RATE
    }
  } else {
    return {
      cgst: taxableAmount * TAX_RATES.CGST_RATE,
      sgst: taxableAmount * TAX_RATES.SGST_RATE,
      igst: 0
    }
  }
}