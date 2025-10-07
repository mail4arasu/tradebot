/**
 * Zerodha API Extensions for Options Trading
 * Handles expiry dates, options data, and margin calculations
 */

import { ExpiryDate, OptionsContract } from './optionsAnalysis'

export interface ZerodhaMarginData {
  available: number
  used: number
  total: number
}

export interface ZerodhaOptionsData {
  instrument_token: number
  exchange_token: number
  tradingsymbol: string
  name: string
  last_price: number
  expiry: string
  strike: number
  tick_size: number
  lot_size: number
  instrument_type: string
  segment: string
  exchange: string
}

export interface ZerodhaQuoteData {
  instrument_token: number
  last_price: number
  volume: number
  buy_quantity: number
  sell_quantity: number
  ohlc: {
    open: number
    high: number
    low: number
    close: number
  }
  net_change: number
  oi: number // Open Interest
  oi_day_high: number
  oi_day_low: number
  depth: {
    buy: Array<{ quantity: number; price: number; orders: number }>
    sell: Array<{ quantity: number; price: number; orders: number }>
  }
  implied_volatility?: number // IV provided by Zerodha for options
}

/**
 * Fetch NIFTY expiry dates from Zerodha
 */
export async function fetchNiftyExpiryDates(apiKey: string, accessToken: string): Promise<ExpiryDate[]> {
  try {
    const response = await fetch('https://api.kite.trade/instruments/NFO', {
      method: 'GET',
      headers: {
        'X-Kite-Version': '3',
        'Authorization': `token ${apiKey}:${accessToken}`
      }
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch instruments: ${response.statusText}`)
    }

    const csvData = await response.text()
    const lines = csvData.split('\n')
    const header = lines[0].split(',')
    
    // Find NIFTY options and extract unique expiry dates
    const expirySet = new Set<string>()
    
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim()
      if (!line) continue
      
      const data = line.split(',')
      const name = data[2] // tradingsymbol
      const instrumentType = data[9] // instrument_type
      const expiry = data[5] // expiry
      
      // Filter for NIFTY options
      if (name && name.startsWith('NIFTY') && instrumentType === 'CE' || instrumentType === 'PE') {
        if (expiry && expiry !== 'expiry') {
          expirySet.add(expiry)
        }
      }
    }
    
    // Convert to ExpiryDate format and calculate days to expiry
    const now = new Date()
    const expiryDates: ExpiryDate[] = Array.from(expirySet)
      .map(dateStr => {
        const expiryDate = new Date(dateStr)
        const daysToExpiry = Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        
        const formatted = formatExpiryForSymbol(expiryDate)
        return {
          date: dateStr,
          formatted: formatted,
          daysToExpiry
        }
      })
      .filter(expiry => expiry.daysToExpiry > 0) // Only future expiries
      .sort((a, b) => a.daysToExpiry - b.daysToExpiry) // Sort by nearest first
    
    // Return all available expiry dates instead of limiting to 2
    // Let selectExpiry() function choose the appropriate monthly expiry
    console.log(`📅 Returning ${expiryDates.length} available expiry dates for selectExpiry() to choose from`)
    console.log(`📊 Available expiries: ${expiryDates.slice(0, 10).map(e => e.date).join(', ')}${expiryDates.length > 10 ? '...' : ''}`)
    
    return expiryDates
    
  } catch (error) {
    console.error('Error fetching NIFTY expiry dates:', error)
    throw error
  }
}

/**
 * Format expiry date for Zerodha symbol format (no leading zero for day)
 */
function formatExpiryForSymbol(date: Date): string {
  const year = date.getFullYear().toString().slice(-2)
  const month = date.toLocaleString('en-US', { month: 'short' }).toUpperCase()
  const day = date.getDate().toString() // No padding for Zerodha format
  
  return `${year}${month}${day}`
}

/**
 * Find NIFTY options contracts directly from Zerodha instruments
 */
export async function findNiftyOptionsContracts(
  strikes: number[],
  expiryDate: Date,
  optionType: 'CE' | 'PE',
  apiKey: string,
  accessToken: string
): Promise<OptionsContract[]> {
  try {
    console.log(`🔍 Finding NIFTY ${optionType} options for ${strikes.length} strikes on expiry ${expiryDate.toISOString().split('T')[0]}`)
    
    // Get all NFO instruments
    const instruments = await fetchNFOInstruments(apiKey, accessToken)
    
    // First, let's see what NIFTY expiry dates are actually available
    const allNiftyExpiries = [...new Set(
      instruments
        .filter(inst => inst.name === 'NIFTY' && (inst.instrument_type === 'CE' || inst.instrument_type === 'PE'))
        .map(inst => inst.expiry)
    )].sort()
    
    console.log(`📅 Available NIFTY expiry dates:`)
    allNiftyExpiries.slice(0, 10).forEach((expiry, index) => {
      console.log(`   ${index + 1}. ${expiry}`)
    })
    console.log(`   ... and ${Math.max(0, allNiftyExpiries.length - 10)} more`)
    
    console.log(`🎯 Looking for exact match with expiry: ${expiryDate.toISOString()} (${expiryDate.toISOString().split('T')[0]})`)
    
    // Filter for NIFTY options with matching expiry
    const niftyOptions = instruments.filter(inst => {
      if (inst.name !== 'NIFTY') return false
      if (inst.instrument_type !== optionType) return false
      
      // Check expiry date match
      const instExpiry = new Date(inst.expiry)
      const matches = instExpiry.getTime() === expiryDate.getTime()
      
      if (matches) {
        console.log(`✅ Expiry match found: ${inst.expiry} for instrument ${inst.tradingsymbol}`)
      }
      
      return matches
    })
    
    console.log(`📊 Found ${niftyOptions.length} NIFTY ${optionType} options for target expiry`)
    
    if (niftyOptions.length === 0) {
      // Show closest available expiry dates
      const targetTime = expiryDate.getTime()
      const closestExpiries = allNiftyExpiries
        .map(expiry => ({
          expiry,
          diff: Math.abs(new Date(expiry).getTime() - targetTime)
        }))
        .sort((a, b) => a.diff - b.diff)
        .slice(0, 5)
        
      console.log(`❌ No exact expiry match. Closest available expiry dates:`)
      closestExpiries.forEach((item, index) => {
        const days = Math.round(item.diff / (1000 * 60 * 60 * 24))
        console.log(`   ${index + 1}. ${item.expiry} (${days} days difference)`)
      })
    }
    
    // Find instruments for each requested strike
    const foundContracts: OptionsContract[] = []
    
    strikes.forEach(strike => {
      const instrument = niftyOptions.find(inst => inst.strike === strike)
      
      if (instrument) {
        console.log(`✅ Found Strike ${strike}: ${instrument.tradingsymbol} (Token: ${instrument.instrument_token})`)
        foundContracts.push({
          symbol: instrument.tradingsymbol, // Use actual Zerodha symbol
          strike: instrument.strike,
          expiry: instrument.expiry,
          optionType: instrument.instrument_type as 'CE' | 'PE',
          instrumentToken: instrument.instrument_token,
          zerodhaSymbol: instrument.tradingsymbol
        })
      } else {
        console.log(`❌ Strike ${strike} not available for ${optionType} on ${expiryDate.toISOString().split('T')[0]}`)
        
        // Show closest available strikes
        const closestStrikes = niftyOptions
          .sort((a, b) => Math.abs(a.strike - strike) - Math.abs(b.strike - strike))
          .slice(0, 3)
        
        if (closestStrikes.length > 0) {
          console.log(`   Closest available: ${closestStrikes.map(s => `${s.strike}`).join(', ')}`)
        }
      }
    })
    
    console.log(`🎯 Successfully found ${foundContracts.length}/${strikes.length} contracts`)
    return foundContracts
    
  } catch (error) {
    console.error('Error finding NIFTY options contracts:', error)
    throw error
  }
}

/**
 * Fetch quote data for options contracts using instrument tokens
 */
export async function fetchOptionsQuotes(
  contracts: OptionsContract[],
  apiKey: string,
  accessToken: string
): Promise<OptionsContract[]> {
  try {
    console.log(`📈 Fetching quotes for ${contracts.length} options contracts`)
    console.log(`🔧 API Key length: ${apiKey?.length || 0}, Access Token length: ${accessToken?.length || 0}`)
    
    // Filter contracts that have instrument tokens
    const contractsWithTokens = contracts.filter(c => c.instrumentToken)
    console.log(`🎯 Contracts with tokens: ${contractsWithTokens.length}/${contracts.length}`)
    
    if (contractsWithTokens.length === 0) {
      console.log(`❌ No contracts have instrument tokens!`)
      throw new Error('No contracts with instrument tokens found')
    }
    
    // Log each contract's details
    contractsWithTokens.forEach((contract, index) => {
      console.log(`   ${index + 1}. ${contract.symbol || contract.zerodhaSymbol} - Token: ${contract.instrumentToken}`)
    })
    
    // Fetch NIFTY spot price for delta calculations
    const spotPrice = await fetchNiftySpotPrice(apiKey, accessToken)
    
    // Fetch quotes using exchange:tradingsymbol format (NOT tokens)
    const symbols = contractsWithTokens.map(c => `NFO:${c.zerodhaSymbol || c.symbol}`)
    console.log(`🔗 Quote API symbols: ${symbols.join(', ')}`)
    
    // Build correct URL format for multiple instruments using exchange:tradingsymbol
    const quoteUrl = `https://api.kite.trade/quote?${symbols.map(symbol => `i=${encodeURIComponent(symbol)}`).join('&')}`
    console.log(`🌐 Quote API URL: ${quoteUrl}`)
    
    let quotesResponse
    try {
      quotesResponse = await fetch(quoteUrl, {
        method: 'GET',
        headers: {
          'X-Kite-Version': '3',
          'Authorization': `token ${apiKey}:${accessToken}`
        }
      })
      console.log(`📡 Quote API response status: ${quotesResponse.status}`)
    } catch (fetchError) {
      console.error(`❌ Fetch error in quote API:`, fetchError)
      throw fetchError
    }
    
    if (!quotesResponse.ok) {
      const errorText = await quotesResponse.text()
      console.log(`❌ Quote API error response: ${errorText}`)
      
      // Check for token expiration specifically
      if (errorText.includes('TokenException') || errorText.includes('access_token')) {
        console.error('🔑 CRITICAL: Zerodha access token has expired!')
        console.error('💡 User needs to refresh their Zerodha connection in Settings')
        throw new Error(`Zerodha access token expired. Please go to Settings → Zerodha Integration → "Connect Zerodha Account" to refresh your daily token.`)
      }
      
      throw new Error(`Failed to fetch quotes: ${quotesResponse.statusText} - ${errorText}`)
    }
    
    console.log(`📊 About to parse JSON response...`)
    let quotesData
    try {
      quotesData = await quotesResponse.json()
      console.log(`✅ JSON parsed successfully`)
      console.log(`📊 Quote API response structure:`, JSON.stringify(quotesData, null, 2))
    } catch (jsonError) {
      console.error(`❌ JSON parsing error:`, jsonError)
      throw jsonError
    }
    
    console.log(`📊 Quote response keys: ${Object.keys(quotesData.data || {}).join(', ')}`)
    console.log(`📊 Expected symbols: ${symbols.join(', ')}`)
    
    // Debug: Check if we have any data at all
    const dataKeys = Object.keys(quotesData.data || {})
    console.log(`🔍 Quote API returned ${dataKeys.length} instruments`)
    if (dataKeys.length === 0) {
      console.log(`❌ No quote data returned from API!`)
      console.log(`🔍 Full response:`, JSON.stringify(quotesData, null, 2))
    } else {
      console.log(`✅ Sample quote keys: ${dataKeys.slice(0, 5).join(', ')}`)
      
      // Debug: Show structure of first quote
      const firstKey = dataKeys[0]
      const firstQuote = quotesData.data[firstKey]
      console.log(`🔍 First quote structure for ${firstKey}:`)
      console.log(`   last_price: ${firstQuote?.last_price}`)
      console.log(`   oi: ${firstQuote?.oi}`)
      console.log(`   implied_volatility: ${firstQuote?.implied_volatility}`)
      console.log(`   ohlc: ${JSON.stringify(firstQuote?.ohlc)}`)
      console.log(`   volume: ${firstQuote?.volume}`)
    }
    
    // Map quote data back to contracts using exchange:tradingsymbol
    const updatedContracts = contractsWithTokens.map((contract, index) => {
      const symbolKey = symbols[index] // Use the symbol we built for the API call
      const quote = quotesData.data[symbolKey]
      
      console.log(`🔍 Processing ${contract.symbol || contract.zerodhaSymbol}:`)
      console.log(`   Symbol key: ${symbolKey}`)
      console.log(`   Quote found: ${quote ? 'YES' : 'NO'}`)
      
      if (!quote) {
        // Debug: Show what keys are actually available vs what we're looking for
        const availableKeys = Object.keys(quotesData.data || {})
        const similarKeys = availableKeys.filter(key => key.includes(contract.zerodhaSymbol || contract.symbol || ''))
        console.log(`   🔍 Available similar keys: ${similarKeys.join(', ')}`)
        console.log(`   🔍 First 3 available keys: ${availableKeys.slice(0, 3).join(', ')}`)
      }
      
      if (quote) {
        console.log(`   Quote data: Premium=${quote.last_price}, OI=${quote.oi}, IV=${quote.implied_volatility || 'N/A'}%`)
        
        // Calculate delta using Black-Scholes model with Zerodha's IV
        const delta = calculateDelta(quote, contract, spotPrice)
        
        console.log(`📊 Calculated Delta for ${contract.symbol}: ${delta.toFixed(3)}`)
        
        return {
          ...contract,
          premium: quote.last_price,
          openInterest: quote.oi,
          delta: delta
        }
      } else {
        console.log(`❌ No quote data found for ${contract.symbol || contract.zerodhaSymbol}`)
        console.log(`❌ Skipping contract - no real market data available`)
      }
      
      return contract
    })
    
    // Only return contracts with real market data (premium and OI)
    const contractsWithRealData = updatedContracts.filter(c => c.premium !== undefined && c.openInterest !== undefined)
    console.log(`📈 Successfully fetched quotes for ${contractsWithRealData.length} contracts`)
    console.log(`📈 Contracts processed: ${updatedContracts.length}, with real market data: ${contractsWithRealData.length}`)
    
    if (contractsWithRealData.length === 0) {
      throw new Error('No real market data available from Zerodha API for any contracts')
    }
    
    return contractsWithRealData
    
  } catch (error) {
    console.error('❌ Error fetching options quotes:', error)
    
    // Log error details for debugging
    console.error('🔍 Error details:', error instanceof Error ? error.message : error)
    
    throw error
  }
}

/**
 * Fetch all NFO instruments from Zerodha
 */
async function fetchNFOInstruments(apiKey: string, accessToken: string): Promise<ZerodhaOptionsData[]> {
  const response = await fetch('https://api.kite.trade/instruments/NFO', {
    method: 'GET',
    headers: {
      'X-Kite-Version': '3',
      'Authorization': `token ${apiKey}:${accessToken}`
    }
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch instruments: ${response.statusText}`)
  }

  const csvData = await response.text()
  const lines = csvData.split('\n')
  const instruments: ZerodhaOptionsData[] = []
  
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    
    const data = line.split(',')
    
    // Skip if not enough columns
    if (data.length < 12) continue
    
    instruments.push({
      instrument_token: parseInt(data[0]),
      exchange_token: parseInt(data[1]),
      tradingsymbol: data[2],
      name: data[3].replace(/"/g, ''), // Remove quotes from name field
      last_price: parseFloat(data[4]) || 0,
      expiry: data[5],
      strike: parseFloat(data[6]) || 0,
      tick_size: parseFloat(data[7]) || 0,
      lot_size: parseInt(data[8]) || 0,
      instrument_type: data[9],
      segment: data[10],
      exchange: data[11]
    })
  }
  
  console.log(`📊 Loaded ${instruments.length} NFO instruments`)
  
  // Debug: Show sample instruments and check for NIFTY
  const niftyInstruments = instruments.filter(inst => inst.name === 'NIFTY')
  const allNames = [...new Set(instruments.map(inst => inst.name))].slice(0, 20)
  
  console.log(`🔍 Found ${niftyInstruments.length} NIFTY instruments`)
  console.log(`📋 Sample instrument names found: ${allNames.join(', ')}`)
  
  if (niftyInstruments.length > 0) {
    console.log(`✅ Sample NIFTY instruments:`)
    niftyInstruments.slice(0, 5).forEach((inst, index) => {
      console.log(`   ${index + 1}. ${inst.tradingsymbol} | Name: "${inst.name}" | Type: ${inst.instrument_type} | Expiry: ${inst.expiry}`)
    })
    
    // Show NIFTY options specifically
    const niftyOptions = niftyInstruments.filter(inst => inst.instrument_type === 'CE' || inst.instrument_type === 'PE')
    console.log(`📋 Found ${niftyOptions.length} NIFTY options (CE/PE) out of ${niftyInstruments.length} total NIFTY instruments`)
    
    if (niftyOptions.length > 0) {
      console.log(`✅ Sample NIFTY options:`)
      niftyOptions.slice(0, 10).forEach((inst, index) => {
        console.log(`   ${index + 1}. ${inst.tradingsymbol} | Type: ${inst.instrument_type} | Strike: ${inst.strike} | Expiry: ${inst.expiry}`)
      })
    }
  } else {
    console.log(`❌ No NIFTY instruments found. Checking raw CSV parsing...`)
    // Show first 3 instruments to debug CSV parsing
    instruments.slice(0, 3).forEach((inst, index) => {
      console.log(`   ${index + 1}. Symbol: "${inst.tradingsymbol}" | Name: "${inst.name}" | Type: "${inst.instrument_type}"`)
    })
  }
  
  return instruments
}

/**
 * Find matching Zerodha instrument for our contract
 */
function findMatchingInstrument(contract: OptionsContract, instruments: ZerodhaOptionsData[]): ZerodhaOptionsData | null {
  // Parse expiry date from contract
  const contractExpiryDate = new Date(contract.expiry)
  
  console.log(`🔍 Looking for contract: ${contract.symbol}`)
  console.log(`   Strike: ${contract.strike}, Option Type: ${contract.optionType}, Expiry: ${contract.expiry}`)
  
  // First, find all NIFTY options for this expiry to see what's available
  const niftyOptionsForExpiry = instruments.filter(inst => 
    inst.name === 'NIFTY' && 
    (inst.instrument_type === 'CE' || inst.instrument_type === 'PE') &&
    new Date(inst.expiry).getTime() === contractExpiryDate.getTime()
  )
  
  console.log(`📊 Found ${niftyOptionsForExpiry.length} NIFTY options for expiry ${contract.expiry}`)
  
  // Show sample of available strikes for this expiry and option type
  const sampleStrikes = niftyOptionsForExpiry
    .filter(inst => inst.instrument_type === contract.optionType)
    .slice(0, 10)
    .map(inst => `${inst.tradingsymbol} (Strike: ${inst.strike})`)
  
  if (sampleStrikes.length > 0) {
    console.log(`   Sample ${contract.optionType} strikes available:`)
    sampleStrikes.forEach((strike, index) => {
      console.log(`      ${index + 1}. ${strike}`)
    })
  }
  
  // Find exact match
  const match = instruments.find(instrument => {
    // Must be NIFTY options
    if (instrument.name !== 'NIFTY') return false
    
    // Must match strike price
    if (instrument.strike !== contract.strike) return false
    
    // Must match option type (CE/PE)
    if (instrument.instrument_type !== contract.optionType) return false
    
    // Must match expiry date
    const instrumentExpiryDate = new Date(instrument.expiry)
    if (instrumentExpiryDate.getTime() !== contractExpiryDate.getTime()) return false
    
    return true
  })
  
  if (match) {
    console.log(`✅ MATCH FOUND: ${match.tradingsymbol} (Token: ${match.instrument_token})`)
  } else {
    console.log(`❌ NO MATCH: No instrument found for Strike ${contract.strike} ${contract.optionType} expiry ${contract.expiry}`)
    
    // Show the closest strikes available
    const closestStrikes = niftyOptionsForExpiry
      .filter(inst => inst.instrument_type === contract.optionType)
      .sort((a, b) => Math.abs(a.strike - contract.strike) - Math.abs(b.strike - contract.strike))
      .slice(0, 3)
    
    if (closestStrikes.length > 0) {
      console.log(`   Closest available strikes:`)
      closestStrikes.forEach((inst, index) => {
        console.log(`      ${index + 1}. ${inst.tradingsymbol} (Strike: ${inst.strike})`)
      })
    }
  }
  
  return match || null
}

/**
 * Fetch NIFTY spot price from Zerodha
 */
async function fetchNiftySpotPrice(apiKey: string, accessToken: string): Promise<number> {
  try {
    // Fetch NIFTY 50 index quote
    const response = await fetch('https://api.kite.trade/quote?i=NSE:NIFTY%2050', {
      method: 'GET',
      headers: {
        'X-Kite-Version': '3',
        'Authorization': `token ${apiKey}:${accessToken}`
      }
    })
    
    if (!response.ok) {
      throw new Error(`Failed to fetch NIFTY spot price: ${response.statusText}`)
    }
    
    const data = await response.json()
    const niftyData = data.data['NSE:NIFTY 50']
    
    if (niftyData && niftyData.last_price) {
      console.log(`📈 NIFTY Spot Price: ${niftyData.last_price}`)
      return niftyData.last_price
    }
    
    throw new Error('NIFTY spot price not found in response')
  } catch (error) {
    console.error('Error fetching NIFTY spot price:', error)
    // Fallback to a reasonable approximation based on ATM strikes
    return 24600 // This should be replaced with actual spot price
  }
}

/**
 * Calculate delta using Black-Scholes model with Zerodha's IV
 * Note: Now using IV directly from Zerodha API instead of calculating it
 */
function calculateDelta(quote: ZerodhaQuoteData, contract: OptionsContract, spotPrice: number): number {
  const strike = contract.strike
  const timeToExpiry = getTimeToExpiry(contract.expiry)
  const riskFreeRate = 0.065 // Indian 10-year G-Sec rate (~6.5%)
  
  // Use Zerodha's implied volatility if available, otherwise fallback to estimation
  let impliedVol: number
  if (quote.implied_volatility !== undefined && quote.implied_volatility > 0) {
    impliedVol = quote.implied_volatility / 100 // Convert from percentage to decimal
    console.log(`📊 Using Zerodha IV: ${quote.implied_volatility.toFixed(1)}%`)
  } else {
    // Fallback to estimation if Zerodha doesn't provide IV
    impliedVol = estimateImpliedVolatility(quote.last_price, spotPrice, strike, timeToExpiry, contract.optionType)
    console.log(`📊 Using estimated IV: ${(impliedVol*100).toFixed(1)}% (Zerodha IV not available)`)
  }
  
  console.log(`📊 Black-Scholes Delta calc:`)
  console.log(`   Spot=${spotPrice}, Strike=${strike}, TTM=${timeToExpiry.toFixed(4)} years`)
  console.log(`   Premium=${quote.last_price}, IV=${(impliedVol*100).toFixed(1)}%, Risk-free=${(riskFreeRate*100).toFixed(1)}%`)
  
  const delta = blackScholesDelta(spotPrice, strike, timeToExpiry, riskFreeRate, impliedVol, contract.optionType)
  
  console.log(`   🎯 Black-Scholes Delta: ${delta.toFixed(3)} (${contract.optionType})`)
  return delta
}

/**
 * Black-Scholes Delta calculation
 */
function blackScholesDelta(
  spot: number, 
  strike: number, 
  timeToExpiry: number, 
  riskFreeRate: number, 
  volatility: number, 
  optionType: 'CE' | 'PE'
): number {
  if (timeToExpiry <= 0) {
    // At expiry, delta is either 0 or 1
    if (optionType === 'CE') {
      return spot > strike ? 1 : 0
    } else {
      return spot < strike ? -1 : 0
    }
  }
  
  const d1 = (Math.log(spot / strike) + (riskFreeRate + 0.5 * volatility * volatility) * timeToExpiry) / 
             (volatility * Math.sqrt(timeToExpiry))
  
  const delta = normalCDF(d1)
  
  if (optionType === 'CE') {
    return delta // Call delta is positive
  } else {
    return Math.abs(delta - 1) // Put delta magnitude (converting from negative to positive for our use)
  }
}

/**
 * Standard normal cumulative distribution function (CDF)
 * Approximation using Abramowitz and Stegun method
 */
function normalCDF(x: number): number {
  const a1 =  0.254829592
  const a2 = -0.284496736
  const a3 =  1.421413741
  const a4 = -1.453152027
  const a5 =  1.061405429
  const p  =  0.3275911
  
  const sign = x < 0 ? -1 : 1
  x = Math.abs(x) / Math.sqrt(2)
  
  const t = 1.0 / (1.0 + p * x)
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x)
  
  return 0.5 * (1.0 + sign * y)
}

/**
 * Calculate time to expiry in years
 */
function getTimeToExpiry(expiryString: string): number {
  const expiryDate = new Date(expiryString)
  const now = new Date()
  const diffInMs = expiryDate.getTime() - now.getTime()
  const daysToExpiry = diffInMs / (1000 * 60 * 60 * 24)
  
  // Convert to years and ensure minimum time
  return Math.max(1 / 365, daysToExpiry / 365) // Minimum 1 day
}

/**
 * Calculate implied volatility using Newton-Raphson method
 * This should give us IV closer to what Zerodha uses
 */
function estimateImpliedVolatility(
  optionPrice: number, 
  spot: number, 
  strike: number, 
  timeToExpiry: number, 
  optionType: 'CE' | 'PE'
): number {
  const riskFreeRate = 0.065 // More accurate Indian 10-year G-Sec rate
  let volatility = 0.20 // Initial guess: 20%
  
  // Newton-Raphson method to find IV
  for (let i = 0; i < 20; i++) {
    const theoreticalPrice = blackScholesPrice(spot, strike, timeToExpiry, riskFreeRate, volatility, optionType)
    const vega = blackScholesVega(spot, strike, timeToExpiry, riskFreeRate, volatility)
    
    const priceDiff = theoreticalPrice - optionPrice
    
    if (Math.abs(priceDiff) < 0.01 || vega < 0.001) {
      break // Converged or vega too small
    }
    
    volatility = volatility - (priceDiff / vega)
    volatility = Math.max(0.01, Math.min(2.0, volatility)) // Keep within reasonable bounds
  }
  
  console.log(`   💡 Newton-Raphson IV: ${(volatility*100).toFixed(1)}% (market premium=${optionPrice})`)
  
  return volatility
}

/**
 * Black-Scholes option price calculation
 */
function blackScholesPrice(
  spot: number, 
  strike: number, 
  timeToExpiry: number, 
  riskFreeRate: number, 
  volatility: number, 
  optionType: 'CE' | 'PE'
): number {
  if (timeToExpiry <= 0) {
    return optionType === 'CE' ? Math.max(0, spot - strike) : Math.max(0, strike - spot)
  }
  
  const d1 = (Math.log(spot / strike) + (riskFreeRate + 0.5 * volatility * volatility) * timeToExpiry) / 
             (volatility * Math.sqrt(timeToExpiry))
  const d2 = d1 - volatility * Math.sqrt(timeToExpiry)
  
  if (optionType === 'CE') {
    return spot * normalCDF(d1) - strike * Math.exp(-riskFreeRate * timeToExpiry) * normalCDF(d2)
  } else {
    return strike * Math.exp(-riskFreeRate * timeToExpiry) * normalCDF(-d2) - spot * normalCDF(-d1)
  }
}

/**
 * Black-Scholes Vega calculation (sensitivity to volatility)
 */
function blackScholesVega(
  spot: number, 
  strike: number, 
  timeToExpiry: number, 
  riskFreeRate: number, 
  volatility: number
): number {
  if (timeToExpiry <= 0) return 0
  
  const d1 = (Math.log(spot / strike) + (riskFreeRate + 0.5 * volatility * volatility) * timeToExpiry) / 
             (volatility * Math.sqrt(timeToExpiry))
  
  return spot * Math.sqrt(timeToExpiry) * normalPDF(d1)
}

/**
 * Standard normal probability density function (PDF)
 */
function normalPDF(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI)
}

/**
 * Fetch margin data for options trading
 */
export async function fetchMarginData(
  apiKey: string,
  accessToken: string
): Promise<ZerodhaMarginData> {
  try {
    const response = await fetch('https://api.kite.trade/user/margins', {
      method: 'GET',
      headers: {
        'X-Kite-Version': '3',
        'Authorization': `token ${apiKey}:${accessToken}`
      }
    })
    
    if (!response.ok) {
      throw new Error(`Failed to fetch margins: ${response.statusText}`)
    }
    
    const marginData = await response.json()
    
    // Extract commodity margin data (for options trading)
    const commodityMargin = marginData.data.commodity || marginData.data.equity
    
    return {
      available: commodityMargin.available.cash,
      used: commodityMargin.utilised.debits,
      total: commodityMargin.net
    }
    
  } catch (error) {
    console.error('Error fetching margin data:', error)
    throw error
  }
}

/**
 * Place options order via Zerodha API
 */
export async function placeOptionsOrder(
  symbol: string,
  quantity: number,
  price: number,
  apiKey: string,
  accessToken: string
): Promise<{ orderId: string; status: string }> {
  try {
    const orderData = {
      tradingsymbol: symbol,
      exchange: 'NFO',
      transaction_type: 'BUY',
      order_type: 'MARKET',
      product: 'MIS', // Intraday
      quantity: quantity.toString(),
      validity: 'DAY',
      variety: 'regular'
    }
    
    const response = await fetch('https://api.kite.trade/orders/regular', {
      method: 'POST',
      headers: {
        'X-Kite-Version': '3',
        'Authorization': `token ${apiKey}:${accessToken}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams(orderData)
    })
    
    if (!response.ok) {
      throw new Error(`Failed to place order: ${response.statusText}`)
    }
    
    const result = await response.json()
    
    return {
      orderId: result.data.order_id,
      status: result.status
    }
    
  } catch (error) {
    console.error('Error placing options order:', error)
    throw error
  }
}