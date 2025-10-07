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
  console.log(`\n🔍 CONTRACT SELECTION ANALYSIS:`)
  console.log(`📊 Total contracts received: ${contracts.length}`)
  
  // Log all contracts with their delta values for manual comparison
  console.log(`\n📋 ALL CONTRACTS WITH DELTA VALUES:`)
  contracts.forEach((contract, index) => {
    const delta = contract.delta !== undefined ? contract.delta.toFixed(3) : 'undefined'
    const premium = contract.premium !== undefined ? `₹${contract.premium.toFixed(2)}` : 'N/A'
    const oi = contract.openInterest !== undefined ? contract.openInterest.toLocaleString() : 'N/A'
    
    console.log(`   ${index + 1}. ${contract.symbol || contract.zerodhaSymbol}`)
    console.log(`      Strike: ${contract.strike} | Delta: ${delta} | Premium: ${premium} | OI: ${oi}`)
  })
  
  // Filter contracts with delta >= 0.6
  const validContracts = contracts.filter(contract => 
    contract.delta !== undefined && contract.delta >= 0.6
  )
  
  console.log(`\n✅ Contracts meeting delta ≥ 0.6 requirement: ${validContracts.length}`)
  
  if (validContracts.length === 0) {
    console.log(`❌ NO CONTRACTS MEET MINIMUM DELTA 0.6 REQUIREMENT`)
    
    // Show the highest delta we found
    const contractsWithDelta = contracts.filter(c => c.delta !== undefined)
    if (contractsWithDelta.length > 0) {
      const highestDelta = Math.max(...contractsWithDelta.map(c => c.delta!))
      const bestContract = contractsWithDelta.find(c => c.delta === highestDelta)
      console.log(`📈 Highest delta found: ${highestDelta.toFixed(3)} (${bestContract?.symbol || bestContract?.zerodhaSymbol})`)
    }
    
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
  
  console.log(`🏆 SELECTED CONTRACT: ${validContracts[0].symbol || validContracts[0].zerodhaSymbol}`)
  console.log(`   Delta: ${validContracts[0].delta!.toFixed(3)} | Premium: ₹${validContracts[0].premium!.toFixed(2)} | OI: ${validContracts[0].openInterest!.toLocaleString()}`)
  
  return validContracts[0]
}

/**
 * Calculate position size based on risk percentage and available margin
 */
export function calculatePositionSize(
  availableMargin: number,
  riskPercentage: number,
  premiumPerLot: number,
  lotSize: number = 75 // NIFTY lot size (correct value)
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
/**
 * Determine option type based on action and strategy
 * Enhanced to support both LONG and SHORT option strategies
 */
export function getOptionType(action: string, side?: string): 'CE' | 'PE' {
  const actionUpper = action.toUpperCase()
  const sideUpper = side?.toUpperCase()
  
  // Handle explicit option type specification
  if (actionUpper.includes('CALL') || actionUpper.includes('CE')) {
    return 'CE'
  }
  if (actionUpper.includes('PUT') || actionUpper.includes('PE')) {
    return 'PE'
  }
  
  // Strategy-based logic for LONG and SHORT positions
  
  // LONG Strategies (buying options)
  if (actionUpper === 'BUY' || actionUpper === 'LONG') {
    // For LONG positions, typically buy calls for bullish view
    return 'CE'
  }
  
  // SHORT Strategies (selling/writing options)
  if (actionUpper === 'SELL_SHORT' || actionUpper === 'SHORT' || 
      actionUpper === 'SELL_ENTRY' || sideUpper === 'SHORT') {
    // For SHORT positions, can sell calls (bearish) or puts (bullish)
    // Default to selling calls for bearish outlook
    return 'CE'  // Sell calls = bearish strategy
  }
  
  // Standard BUY/SELL logic
  if (actionUpper === 'BUY' || actionUpper === 'ENTRY') {
    return 'CE'  // Buy calls = bullish
  }
  
  if (actionUpper === 'SELL') {
    return 'PE'  // Default to puts for sell signals
  }
  
  // Default fallback
  return 'CE'
}

/**
 * Select appropriate expiry date using month-end logic
 * New Logic:
 * 1. Find last expiry date of current month
 * 2. If last expiry of current month >= 5 days from today, use current month
 * 3. Else use last expiry of next month
 */
export function selectExpiry(expiryDates: ExpiryDate[]): ExpiryDate | null {
  if (expiryDates.length === 0) {
    return null
  }
  
  console.log(`📅 EXPIRY SELECTION - NEW MONTH-END LOGIC`)
  console.log(`📊 Total expiry dates available: ${expiryDates.length}`)
  
  const today = new Date()
  const currentMonth = today.getMonth()
  const currentYear = today.getFullYear()
  const nextMonth = currentMonth === 11 ? 0 : currentMonth + 1
  const nextYear = currentMonth === 11 ? currentYear + 1 : currentYear
  
  // Find last expiry of current month
  const currentMonthExpiries = expiryDates.filter(expiry => {
    const expiryDate = new Date(expiry.date)
    return expiryDate.getMonth() === currentMonth && expiryDate.getFullYear() === currentYear
  })
  
  // Find last expiry of next month
  const nextMonthExpiries = expiryDates.filter(expiry => {
    const expiryDate = new Date(expiry.date)
    return expiryDate.getMonth() === nextMonth && expiryDate.getFullYear() === nextYear
  })
  
  // Get last (month-end) expiry of current month
  const lastExpiryCurrentMonth = currentMonthExpiries.length > 0 
    ? currentMonthExpiries.reduce((latest, current) => 
        new Date(current.date) > new Date(latest.date) ? current : latest
      )
    : null
    
  // Get last (month-end) expiry of next month  
  const lastExpiryNextMonth = nextMonthExpiries.length > 0
    ? nextMonthExpiries.reduce((latest, current) =>
        new Date(current.date) > new Date(latest.date) ? current : latest
      )
    : null
  
  console.log(`📅 Current month (${currentMonth + 1}/${currentYear}) last expiry: ${lastExpiryCurrentMonth?.date || 'None'} (${lastExpiryCurrentMonth?.daysToExpiry || 0} days)`)
  console.log(`📅 Next month (${nextMonth + 1}/${nextYear}) last expiry: ${lastExpiryNextMonth?.date || 'None'} (${lastExpiryNextMonth?.daysToExpiry || 0} days)`)
  
  // Apply 5-day rule
  if (lastExpiryCurrentMonth && lastExpiryCurrentMonth.daysToExpiry >= 5) {
    console.log(`✅ Using current month expiry (${lastExpiryCurrentMonth.daysToExpiry} days >= 5 days threshold)`)
    return lastExpiryCurrentMonth
  } else {
    if (lastExpiryNextMonth) {
      console.log(`✅ Using next month expiry (current month expiry ${lastExpiryCurrentMonth?.daysToExpiry || 0} days < 5 days threshold)`)
      return lastExpiryNextMonth
    } else {
      console.log(`❌ No suitable expiry found - no next month expiry available`)
      return lastExpiryCurrentMonth // Fallback to current month if next month not available
    }
  }
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