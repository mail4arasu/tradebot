/**
 * Options Analysis Utilities for Nifty50 Options Bot
 * Handles strike price calculation, expiry selection, and symbol generation
 */

export interface OptionsContract {
  symbol: string
  strike: number
  expiry: string
  optionType: 'CE' | 'PE'
  delta?: number
  openInterest?: number
  premium?: number
  instrumentToken?: number
  zerodhaSymbol?: string
}

export interface ExpiryDate {
  date: string
  formatted: string // YYMMDD format
  daysToExpiry: number
}

/**
 * Calculate ATM strike price using the formula: round(close / 50) * 50
 */
export function calculateATMStrike(price: number): number {
  return Math.round(price / 50) * 50
}

/**
 * Generate 6 strike prices around ATM (3 above, 3 below)
 */
export function generateStrikePrices(atmStrike: number): number[] {
  const strikes = []
  
  // 3 strikes below ATM
  strikes.push(atmStrike - 150) // -3 * 50
  strikes.push(atmStrike - 100) // -2 * 50
  strikes.push(atmStrike - 50)  // -1 * 50
  
  // ATM strike
  strikes.push(atmStrike)
  
  // 3 strikes above ATM
  strikes.push(atmStrike + 50)  // +1 * 50
  strikes.push(atmStrike + 100) // +2 * 50
  strikes.push(atmStrike + 150) // +3 * 50
  
  return strikes
}

/**
 * Format expiry date to Zerodha symbol format (YYMMMD - no leading zero for day)
 */
export function formatExpiryForSymbol(expiryDate: Date): string {
  const year = expiryDate.getFullYear().toString().slice(-2)
  const month = expiryDate.toLocaleString('en-US', { month: 'short' }).toUpperCase()
  const day = expiryDate.getDate().toString() // No padding for Zerodha format
  
  return `${year}${month}${day}`
}

/**
 * Generate NIFTY options symbol
 * Format: NIFTYYYMMDDSTRIKECE/PE
 * Example: NIFTY25OCT103350CE
 */
export function generateOptionsSymbol(
  strike: number,
  expiry: string,
  optionType: 'CE' | 'PE'
): string {
  return `NIFTY${expiry}${strike}${optionType}`
}

/**
 * Generate all options contracts for given strikes and expiry
 */
export function generateOptionsContracts(
  strikes: number[],
  expiry: string,
  optionType: 'CE' | 'PE'
): OptionsContract[] {
  return strikes.map(strike => ({
    symbol: generateOptionsSymbol(strike, expiry, optionType),
    strike,
    expiry,
    optionType
  }))
}

/**
 * Select best options contract based on delta and open interest
 * Priority: Highest delta (minimum 0.6) with good open interest
 */
export function selectBestContract(contracts: OptionsContract[]): OptionsContract | null {
  // Filter contracts with delta >= 0.6
  const validContracts = contracts.filter(contract => 
    contract.delta !== undefined && contract.delta >= 0.6
  )
  
  if (validContracts.length === 0) {
    return null // No contract meets minimum delta requirement
  }
  
  // Sort by delta (descending), then by open interest (descending)
  validContracts.sort((a, b) => {
    // Primary: Highest delta
    if (b.delta! !== a.delta!) {
      return b.delta! - a.delta!
    }
    
    // Secondary: Highest open interest
    const aOI = a.openInterest || 0
    const bOI = b.openInterest || 0
    return bOI - aOI
  })
  
  return validContracts[0]
}

/**
 * Calculate position size based on risk percentage and available margin
 */
export function calculatePositionSize(
  availableMargin: number,
  riskPercentage: number,
  premiumPerLot: number,
  lotSize: number = 50 // NIFTY lot size
): { lots: number, amount: number, canTrade: boolean } {
  // Calculate risk amount
  const riskAmount = (availableMargin * riskPercentage) / 100
  
  // Calculate maximum lots based on risk
  const maxLots = Math.floor(riskAmount / premiumPerLot)
  
  // Check if at least 1 lot can be traded
  const canTrade = maxLots >= 1
  
  return {
    lots: Math.max(0, maxLots),
    amount: maxLots * premiumPerLot,
    canTrade
  }
}

/**
 * Determine option type based on action
 */
export function getOptionType(action: string): 'CE' | 'PE' {
  return action.toLowerCase() === 'buy' ? 'CE' : 'PE'
}

/**
 * Select appropriate expiry date
 * If nearest expiry < 3 days, use next expiry, else use nearest
 */
export function selectExpiry(expiryDates: ExpiryDate[]): ExpiryDate | null {
  if (expiryDates.length < 2) {
    return null // Need at least 2 expiry dates
  }
  
  // Sort by days to expiry (ascending)
  const sortedExpiries = [...expiryDates].sort((a, b) => a.daysToExpiry - b.daysToExpiry)
  
  const nearestExpiry = sortedExpiries[0]
  const nextExpiry = sortedExpiries[1]
  
  // If nearest expiry is less than 3 days, use next expiry
  if (nearestExpiry.daysToExpiry < 3) {
    return nextExpiry
  }
  
  return nearestExpiry
}

/**
 * Parse webhook data for options trading
 */
export interface WebhookData {
  action: string  // 'buy' or 'sell'
  price: number   // Current price for strike calculation
  symbol?: string // Optional symbol validation
}

export function parseWebhookForOptions(webhookData: any): WebhookData | null {
  try {
    const { action, price, symbol } = webhookData
    
    if (!action || !price) {
      throw new Error('Missing required fields: action, price')
    }
    
    if (typeof price !== 'number' || price <= 0) {
      throw new Error('Invalid price value')
    }
    
    if (!['buy', 'sell'].includes(action.toLowerCase())) {
      throw new Error('Invalid action. Must be buy or sell')
    }
    
    return {
      action: action.toLowerCase(),
      price,
      symbol
    }
  } catch (error) {
    console.error('Error parsing webhook data:', error)
    return null
  }
}