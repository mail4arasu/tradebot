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
    
    return expiryDates.slice(0, 2) // Return only next 2 expiries
    
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
    
    // Filter contracts that have instrument tokens
    const contractsWithTokens = contracts.filter(c => c.instrumentToken)
    if (contractsWithTokens.length === 0) {
      throw new Error('No contracts with instrument tokens found')
    }
    
    // Fetch NIFTY spot price for delta calculations
    const spotPrice = await fetchNiftySpotPrice(apiKey, accessToken)
    
    // Fetch quotes using instrument tokens
    const tokens = contractsWithTokens.map(c => `NFO:${c.instrumentToken}`)
    const quotesResponse = await fetch(`https://api.kite.trade/quote?i=${tokens.join('&i=')}`, {
      method: 'GET',
      headers: {
        'X-Kite-Version': '3',
        'Authorization': `token ${apiKey}:${accessToken}`
      }
    })
    
    if (!quotesResponse.ok) {
      throw new Error(`Failed to fetch quotes: ${quotesResponse.statusText}`)
    }
    
    const quotesData = await quotesResponse.json()
    
    // Map quote data back to contracts
    const updatedContracts = contractsWithTokens.map(contract => {
      const tokenKey = `NFO:${contract.instrumentToken}`
      const quote = quotesData.data[tokenKey]
      
      if (quote) {
        const delta = calculateDelta(quote, contract, spotPrice)
        return {
          ...contract,
          premium: quote.last_price,
          openInterest: quote.oi,
          delta: delta
        }
      }
      
      return contract
    })
    
    console.log(`📈 Successfully fetched quotes for ${updatedContracts.filter(c => c.premium).length} contracts`)
    return updatedContracts
    
  } catch (error) {
    console.error('Error fetching options quotes:', error)
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
 * Simplified delta calculation using actual spot price
 * Note: This is an approximation. For precise delta, use Black-Scholes model
 */
function calculateDelta(quote: ZerodhaQuoteData, contract: OptionsContract, spotPrice: number): number {
  const strike = contract.strike
  const moneyness = spotPrice / strike
  
  console.log(`📊 Delta calc: Spot=${spotPrice}, Strike=${strike}, Moneyness=${moneyness.toFixed(3)}, Type=${contract.optionType}`)
  
  if (contract.optionType === 'CE') {
    // Call option delta: increases as option goes ITM (spot > strike)
    if (moneyness >= 1.02) {
      // Deep ITM: delta around 0.7-0.9
      const delta = Math.min(0.9, 0.5 + (moneyness - 1) * 3)
      console.log(`   📈 CE Deep ITM: ${delta.toFixed(3)}`)
      return delta
    } else if (moneyness >= 0.98) {
      // ATM: delta around 0.5
      const delta = 0.5 + (moneyness - 1) * 5 // Sensitive around ATM
      console.log(`   ⚖️ CE ATM: ${delta.toFixed(3)}`)
      return Math.max(0.3, Math.min(0.7, delta))
    } else {
      // OTM: delta decreases as it goes further OTM
      const delta = Math.max(0.05, 0.5 * moneyness)
      console.log(`   📉 CE OTM: ${delta.toFixed(3)}`)
      return delta
    }
  } else {
    // Put option delta: increases as option goes ITM (spot < strike)
    if (moneyness <= 0.98) {
      // Deep ITM: delta around 0.7-0.9
      const delta = Math.min(0.9, 0.5 + (1 - moneyness) * 3)
      console.log(`   📈 PE Deep ITM: ${delta.toFixed(3)}`)
      return delta
    } else if (moneyness <= 1.02) {
      // ATM: delta around 0.5
      const delta = 0.5 + (1 - moneyness) * 5 // Sensitive around ATM
      console.log(`   ⚖️ PE ATM: ${delta.toFixed(3)}`)
      return Math.max(0.3, Math.min(0.7, delta))
    } else {
      // OTM: delta decreases as it goes further OTM
      const delta = Math.max(0.05, 0.5 / moneyness)
      console.log(`   📉 PE OTM: ${delta.toFixed(3)}`)
      return delta
    }
  }
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