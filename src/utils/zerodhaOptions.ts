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
 * Fetch quote data for multiple options contracts
 */
export async function fetchOptionsQuotes(
  contracts: OptionsContract[],
  apiKey: string,
  accessToken: string
): Promise<OptionsContract[]> {
  try {
    // Get instrument tokens for the symbols
    const instrumentTokens = await getInstrumentTokens(
      contracts.map(c => c.symbol),
      apiKey,
      accessToken
    )
    
    if (instrumentTokens.length === 0) {
      throw new Error('No instrument tokens found for the symbols')
    }
    
    // Fetch quotes for all tokens
    const quotesResponse = await fetch(`https://api.kite.trade/quote?i=${instrumentTokens.join('&i=')}`, {
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
    const updatedContracts = contracts.map(contract => {
      const tokenKey = Object.keys(quotesData.data).find(key => {
        const quote = quotesData.data[key]
        return quote.tradingsymbol === contract.symbol
      })
      
      if (tokenKey) {
        const quote: ZerodhaQuoteData = quotesData.data[tokenKey]
        return {
          ...contract,
          premium: quote.last_price,
          openInterest: quote.oi,
          delta: calculateDelta(quote, contract) // Approximate delta calculation
        }
      }
      
      return contract
    })
    
    return updatedContracts
    
  } catch (error) {
    console.error('Error fetching options quotes:', error)
    throw error
  }
}

/**
 * Get instrument tokens for given trading symbols
 */
async function getInstrumentTokens(
  symbols: string[],
  apiKey: string,
  accessToken: string
): Promise<string[]> {
  try {
    console.log(`🔍 Searching for symbols: ${symbols.join(', ')}`)
    
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
    const tokens: string[] = []
    const availableNiftyOptions: string[] = []
    
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim()
      if (!line) continue
      
      const data = line.split(',')
      const instrumentToken = data[0] // instrument_token
      const tradingSymbol = data[2] // tradingsymbol
      const instrumentType = data[9] // instrument_type
      
      // Collect sample NIFTY options for comparison
      if (tradingSymbol && tradingSymbol.startsWith('NIFTY') && 
          (instrumentType === 'CE' || instrumentType === 'PE') && 
          availableNiftyOptions.length < 10) {
        availableNiftyOptions.push(tradingSymbol)
      }
      
      if (symbols.includes(tradingSymbol)) {
        tokens.push(`NFO:${instrumentToken}`)
        console.log(`✅ Found matching symbol: ${tradingSymbol} → ${instrumentToken}`)
      }
    }
    
    if (tokens.length === 0) {
      console.log(`❌ No matching symbols found. Sample NIFTY options available:`)
      availableNiftyOptions.forEach((symbol, index) => {
        console.log(`   ${index + 1}. ${symbol}`)
      })
    }
    
    return tokens
    
  } catch (error) {
    console.error('Error getting instrument tokens:', error)
    return []
  }
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