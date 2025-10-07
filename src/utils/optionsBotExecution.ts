/**
 * Nifty50 Options Bot Execution Logic
 * Uses the same sophisticated analysis as the Options Simulator
 */

import { 
  calculateATMStrike,
  generateStrikePrices,
  selectBestContract,
  calculatePositionSize,
  getOptionType,
  selectExpiry
} from './optionsAnalysis'
import { 
  fetchNiftyExpiryDates,
  findNiftyOptionsContracts,
  fetchOptionsQuotes
} from './zerodhaOptions'

export interface OptionsBotConfig {
  capital: number
  riskPercentage: number
  deltaThreshold: number
  lotSize: number
}

export interface OptionsBotSignal {
  action: 'BUY' | 'SELL' | 'SHORT' | 'SELL_SHORT' | 'LONG'
  price: number
  symbol: string
  timestamp: Date
  side?: 'LONG' | 'SHORT'  // Explicit side specification
}

export interface OptionsBotResult {
  success: boolean
  selectedContract?: {
    symbol: string
    strike: number
    expiry: string
    optionType: 'CE' | 'PE'
    premium: number
    delta: number
    openInterest: number
  }
  positionSize?: {
    lots: number
    quantity: number
    totalInvestment: number
    riskAmount: number
  }
  executionDetails?: {
    orderId?: string
    executionPrice?: number
    executionTime?: Date
  }
  error?: string
}

/**
 * Execute Nifty50 Options Bot trade using same logic as simulator
 */
export async function executeOptionsBotTrade(
  signal: OptionsBotSignal,
  config: OptionsBotConfig,
  zerodhaConfig: { apiKey: string; accessToken: string }
): Promise<OptionsBotResult> {
  try {
    console.log(`🤖 NIFTY50 OPTIONS BOT EXECUTION STARTED`)
    console.log(`📊 Signal: ${signal.action} at ₹${signal.price}`)
    console.log(`💰 Capital: ₹${config.capital.toLocaleString()}, Risk: ${config.riskPercentage}%`)

    // Step 1: Calculate ATM strike using the same algorithm as simulator
    const atmStrike = calculateATMStrike(signal.price)
    console.log(`🎯 ATM Strike calculated: ${atmStrike} (from price: ${signal.price})`)

    // Step 2: Generate strike prices around ATM
    const strikes = generateStrikePrices(atmStrike)
    console.log(`📊 Generated strikes: ${strikes.join(', ')}`)

    // Step 3: Fetch NIFTY expiry dates from Zerodha
    const expiryDates = await fetchNiftyExpiryDates(zerodhaConfig.apiKey, zerodhaConfig.accessToken)
    console.log(`📅 Fetched ${expiryDates.length} expiry dates`)

    // Step 4: Select appropriate expiry based on date input
    const selectedExpiry = selectExpiry(expiryDates)
    if (!selectedExpiry) {
      throw new Error('No suitable expiry dates found')
    }
    console.log(`📅 Selected expiry: ${selectedExpiry.date} (${selectedExpiry.daysToExpiry} days)`)

    // Step 5: Determine option type based on action and side
    const optionType = getOptionType(signal.action, signal.side)
    console.log(`🎛️ Option type: ${optionType} (action: ${signal.action}, side: ${signal.side || 'auto'})`)

    // Step 6: Find actual NIFTY options contracts from Zerodha instruments
    const expiryDate = new Date(selectedExpiry.date)
    const contracts = await findNiftyOptionsContracts(strikes, expiryDate, optionType, zerodhaConfig.apiKey, zerodhaConfig.accessToken)
    
    if (contracts.length === 0) {
      throw new Error(`No NIFTY ${optionType} options found for the selected strikes on expiry ${selectedExpiry.date}`)
    }
    console.log(`💼 Found ${contracts.length} contracts from Zerodha instruments`)

    // Step 7: Fetch real-time quotes from Zerodha API
    const contractsWithData = await fetchOptionsQuotes(contracts, zerodhaConfig.apiKey, zerodhaConfig.accessToken)
    console.log(`📈 Fetched quotes for ${contractsWithData.length} contracts`)

    // Step 8: Select best contract based on delta and OI (same logic as simulator)
    const bestContract = selectBestContract(contractsWithData)
    if (!bestContract) {
      const contractsWithDelta = contractsWithData.filter(c => c.delta !== undefined)
      const highestDelta = contractsWithDelta.length > 0 
        ? Math.max(...contractsWithDelta.map(c => c.delta!))
        : 0
      
      throw new Error(`No suitable options contract found (minimum delta ${config.deltaThreshold} required, highest found: ${highestDelta.toFixed(3)})`)
    }
    console.log(`🏆 Selected best contract: ${bestContract.symbol} (Delta: ${bestContract.delta?.toFixed(3)})`)

    // Step 9: Calculate position size based on risk percentage (same as simulator)
    const premiumPerLot = (bestContract.premium || 0) * config.lotSize
    const positionCalc = calculatePositionSize(
      config.capital,
      config.riskPercentage,
      premiumPerLot,
      config.lotSize
    )

    if (!positionCalc.canTrade) {
      const minCapitalRequired = Math.ceil((premiumPerLot / config.riskPercentage) * 100)
      throw new Error(`Insufficient capital for minimum position size. Required: ₹${minCapitalRequired.toLocaleString()} (at ${config.riskPercentage}% risk). Current: ₹${config.capital.toLocaleString()}`)
    }

    console.log(`💰 Position calculated: ${positionCalc.lots} lots (${positionCalc.lots * config.lotSize} quantity)`)
    console.log(`💵 Total investment: ₹${positionCalc.amount.toLocaleString()}`)

    // Step 10: Prepare execution result (actual order placement would happen here)
    const result: OptionsBotResult = {
      success: true,
      selectedContract: {
        symbol: bestContract.symbol!,
        strike: bestContract.strike,
        expiry: bestContract.expiry,
        optionType: bestContract.optionType,
        premium: bestContract.premium || 0,
        delta: bestContract.delta || 0,
        openInterest: bestContract.openInterest || 0
      },
      positionSize: {
        lots: positionCalc.lots,
        quantity: positionCalc.lots * config.lotSize,
        totalInvestment: positionCalc.amount,
        riskAmount: (config.capital * config.riskPercentage) / 100
      }
    }

    console.log(`✅ Options Bot execution completed successfully`)
    return result

  } catch (error) {
    console.error('❌ Options Bot execution error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error during options bot execution'
    }
  }
}

/**
 * Validate Options Bot configuration
 */
export function validateOptionsBotConfig(config: OptionsBotConfig): { valid: boolean; error?: string } {
  if (config.capital <= 0) {
    return { valid: false, error: 'Capital must be greater than 0' }
  }
  
  if (config.riskPercentage <= 0 || config.riskPercentage > 50) {
    return { valid: false, error: 'Risk percentage must be between 0 and 50' }
  }
  
  if (config.deltaThreshold < 0.1 || config.deltaThreshold > 1.0) {
    return { valid: false, error: 'Delta threshold must be between 0.1 and 1.0' }
  }
  
  if (config.lotSize !== 75) {
    return { valid: false, error: 'NIFTY options lot size must be 75' }
  }
  
  return { valid: true }
}