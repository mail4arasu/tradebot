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
        
        return {
          date: dateStr,
          formatted: formatExpiryForSymbol(expiryDate),
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
 * Format expiry date for Zerodha symbol format
 */
function formatExpiryForSymbol(date: Date): string {
  const year = date.getFullYear().toString().slice(-2)
  const month = date.toLocaleString('en-US', { month: 'short' }).toUpperCase()
  const day = date.getDate().toString().padStart(2, '0')
  
  return `${year}${month}${day}`
}

/**
 * Fetch quote data for multiple options contracts using proper Zerodha approach
 */
export async function fetchOptionsQuotes(
  contracts: OptionsContract[],
  apiKey: string,
  accessToken: string
): Promise<OptionsContract[]> {
  try {
    console.log(`🔍 Looking for ${contracts.length} options contracts in Zerodha instruments`)
    
    // Get all NFO instruments
    const instruments = await fetchNFOInstruments(apiKey, accessToken)
    
    // Find matching instruments for each contract
    const contractsWithTokens = contracts.map(contract => {
      const matchingInstrument = findMatchingInstrument(contract, instruments)
      if (matchingInstrument) {
        console.log(`✅ Found: ${contract.symbol} → ${matchingInstrument.tradingsymbol} (Token: ${matchingInstrument.instrument_token})`)
        return {
          ...contract,
          instrumentToken: matchingInstrument.instrument_token,
          zerodhaSymbol: matchingInstrument.tradingsymbol
        }
      } else {
        console.log(`❌ Not found: ${contract.symbol}`)
        return contract
      }
    })
    
    // Get tokens for found instruments
    const foundContracts = contractsWithTokens.filter(c => c.instrumentToken)
    if (foundContracts.length === 0) {
      throw new Error('No matching instruments found in Zerodha NFO list')
    }
    
    // Fetch quotes using instrument tokens
    const tokens = foundContracts.map(c => `NFO:${c.instrumentToken}`)
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
      if (!contract.instrumentToken) return contract
      
      const tokenKey = `NFO:${contract.instrumentToken}`
      const quote = quotesData.data[tokenKey]
      
      if (quote) {
        return {
          ...contract,
          premium: quote.last_price,
          openInterest: quote.oi,
          delta: calculateDelta(quote, contract) // Approximate delta calculation
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
      name: data[3],
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
  return instruments
}

/**
 * Find matching Zerodha instrument for our contract
 */
function findMatchingInstrument(contract: OptionsContract, instruments: ZerodhaOptionsData[]): ZerodhaOptionsData | null {
  // Parse expiry date from contract
  const contractExpiryDate = new Date(contract.expiry)
  
  // Find instrument that matches: name=NIFTY, strike, expiry, and instrument_type
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
  
  return match || null
}

/**
 * Approximate delta calculation for options
 * Note: This is a simplified calculation. For accurate delta, use proper options pricing models
 */
function calculateDelta(quote: ZerodhaQuoteData, contract: OptionsContract): number {
  // Simplified delta approximation
  // For CE: closer to ATM = higher delta, for PE: inverse
  // This is a placeholder - in production, use Black-Scholes or similar
  
  const spotPrice = quote.last_price // This should be the underlying spot price
  const strike = contract.strike
  const moneyness = spotPrice / strike
  
  if (contract.optionType === 'CE') {
    // Call option delta increases as it goes ITM
    if (moneyness > 1) {
      return Math.min(0.9, 0.5 + (moneyness - 1) * 2)
    } else {
      return Math.max(0.1, 0.5 - (1 - moneyness) * 2)
    }
  } else {
    // Put option delta (absolute value) increases as it goes ITM
    if (moneyness < 1) {
      return Math.min(0.9, 0.5 + (1 - moneyness) * 2)
    } else {
      return Math.max(0.1, 0.5 - (moneyness - 1) * 2)
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