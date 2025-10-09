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
  positionSizingMethod?: 'FIXED_QUANTITY' | 'RISK_PERCENTAGE'
  fixedQuantity?: number
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
  zerodhaConfig: { apiKey: string; apiSecret: string; accessToken: string }
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

    // Step 9: Calculate position size based on user's position sizing method
    // CORRECTED: Use actual options contract premium for accurate position sizing
    const premiumPerUnit = bestContract.premium || 0
    const premiumPerLot = premiumPerUnit * config.lotSize
    let positionCalc: any
    
    console.log(`💰 Options premium analysis:`)
    console.log(`   Premium per unit: ₹${premiumPerUnit.toFixed(2)}`)
    console.log(`   Lot size: ${config.lotSize} units`)
    console.log(`   Premium per lot: ₹${premiumPerLot.toLocaleString()}`)
    
    if (config.positionSizingMethod === 'FIXED_QUANTITY') {
      // Fixed quantity mode: Use user-specified lots
      const fixedLots = config.fixedQuantity || 1
      const totalInvestment = fixedLots * premiumPerLot
      
      console.log(`📊 Using Fixed Quantity mode: ${fixedLots} lots`)
      console.log(`💵 Total investment required: ₹${totalInvestment.toLocaleString()}`)
      
      // Check if user has sufficient capital for fixed quantity
      if (totalInvestment > config.capital) {
        throw new Error(`Insufficient capital for fixed quantity ${fixedLots} lots. Required: ₹${totalInvestment.toLocaleString()}, Available: ₹${config.capital.toLocaleString()}. Reduce quantity or increase allocated amount.`)
      }
      
      positionCalc = {
        lots: fixedLots,
        amount: totalInvestment,
        canTrade: true
      }
    } else {
      // Risk percentage mode: Calculate based on options premium
      console.log(`📊 Using Risk Percentage mode: ${config.riskPercentage}%`)
      console.log(`📊 Capital: ₹${config.capital.toLocaleString()}`)
      
      // Calculate risk amount (maximum amount willing to risk)
      const riskAmount = (config.capital * config.riskPercentage) / 100
      console.log(`📊 Risk amount: ₹${riskAmount.toLocaleString()} (${config.riskPercentage}% of ₹${config.capital.toLocaleString()})`)
      
      // For options, risk amount = premium paid (maximum loss)
      // So calculate maximum lots based on premium cost
      const maxLots = Math.floor(riskAmount / premiumPerLot)
      console.log(`📊 Maximum lots based on risk: ${maxLots} lots`)
      
      if (maxLots < 1) {
        const minCapitalRequired = Math.ceil(premiumPerLot / (config.riskPercentage / 100))
        throw new Error(`Insufficient capital for minimum position size. Required: ₹${minCapitalRequired.toLocaleString()} (at ${config.riskPercentage}% risk for 1 lot). Current: ₹${config.capital.toLocaleString()}`)
      }
      
      positionCalc = {
        lots: maxLots,
        amount: maxLots * premiumPerLot,
        canTrade: true
      }
    }

    console.log(`💰 Final position: ${positionCalc.lots} lots (${positionCalc.lots * config.lotSize} quantity)`)
    console.log(`💵 Total investment: ₹${positionCalc.amount.toLocaleString()}`)

    // Step 10: Place actual order with Zerodha
    console.log(`📤 Placing real order with Zerodha...`)
    
    // Import ZerodhaAPI for order placement
    const { ZerodhaAPI } = await import('@/lib/zerodha')
    const { decrypt } = await import('@/lib/encryption')
    
    // Initialize Zerodha API with decrypted credentials
    const apiKey = decrypt(zerodhaConfig.apiKey)
    const apiSecret = decrypt(zerodhaConfig.apiSecret) 
    const accessToken = decrypt(zerodhaConfig.accessToken)
    
    const zerodha = new ZerodhaAPI(apiKey, apiSecret, accessToken)
    
    // Prepare order parameters for options
    // CORRECTED: For basic options strategies, all entry signals should be BUY orders
    // - LONG signals: BUY CALL options (bullish)
    // - SHORT signals: BUY PUT options (bearish)
    const orderParams = {
      exchange: 'NFO',
      tradingsymbol: bestContract.symbol!,
      transaction_type: 'BUY', // Always BUY for entry signals (buy calls or buy puts)
      quantity: positionCalc.lots * config.lotSize,
      order_type: 'MARKET', // Use market orders for immediate execution
      product: 'MIS', // Intraday for options
      validity: 'DAY',
      tag: `OPTBOT_${Date.now()}`
    }
    
    console.log(`📋 Order parameters:`, orderParams)
    
    try {
      // Place the order
      const orderResponse = await zerodha.placeOrder('regular', orderParams)
      
      if (orderResponse.status === 'success') {
        const orderId = orderResponse.data.order_id
        console.log(`✅ Options order placed successfully: ${orderId}`)
        
        // Prepare successful execution result
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
          },
          executionDetails: {
            orderId: orderId,
            executionPrice: bestContract.premium || 0,
            executionTime: new Date()
          }
        }
        
        console.log(`✅ Options Bot execution completed successfully with real order`)
        return result
        
      } else {
        throw new Error(`Order placement failed: ${orderResponse.message || 'Unknown error'}`)
      }
      
    } catch (orderError) {
      console.error(`❌ Failed to place options order:`, orderError)
      
      // Return failure result with detailed error
      return {
        success: false,
        error: `Order placement failed: ${orderError instanceof Error ? orderError.message : 'Unknown order error'}`,
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
    }

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
  
  if (config.riskPercentage <= 0 || config.riskPercentage > 100) {
    return { valid: false, error: 'Risk percentage must be between 0 and 100' }
  }
  
  if (config.deltaThreshold < 0.1 || config.deltaThreshold > 1.0) {
    return { valid: false, error: 'Delta threshold must be between 0.1 and 1.0' }
  }
  
  if (config.lotSize !== 75) {
    return { valid: false, error: 'NIFTY options lot size must be 75' }
  }
  
  // Validate position sizing method specific fields
  if (config.positionSizingMethod === 'FIXED_QUANTITY') {
    if (!config.fixedQuantity || config.fixedQuantity <= 0) {
      return { valid: false, error: 'Fixed quantity must be greater than 0 when using FIXED_QUANTITY mode' }
    }
    
    if (config.fixedQuantity > 100) {
      return { valid: false, error: 'Fixed quantity cannot exceed 100 lots for safety' }
    }
  }
  
  return { valid: true }
}