// Removed encryption import - using plain text credentials
import crypto from 'crypto'

export class ZerodhaAPI {
  private apiKey: string
  private apiSecret: string
  private accessToken?: string
  private baseUrl = 'https://api.kite.trade'

  constructor(apiKey: string = '', apiSecret: string = '', accessToken?: string) {
    this.apiKey = apiKey
    this.apiSecret = apiSecret
    this.accessToken = accessToken
  }

  // Method to set credentials after initialization
  setCredentials(apiKey: string, apiSecret: string, accessToken: string) {
    this.apiKey = apiKey
    this.apiSecret = apiSecret
    this.accessToken = accessToken
  }

  // Generic method to make authenticated requests to Zerodha API
  private async makeRequest(method: string, endpoint: string, body?: any): Promise<any> {
    if (!this.accessToken) {
      throw new Error('Access token required. Please complete OAuth flow first.')
    }

    try {
      const url = `${this.baseUrl}${endpoint}`
      const options: RequestInit = {
        method,
        headers: {
          'Authorization': `token ${this.apiKey}:${this.accessToken}`,
          'X-Kite-Version': '3',
          'Content-Type': 'application/json'
        }
      }

      if (body && (method === 'POST' || method === 'PUT')) {
        options.body = JSON.stringify(body)
      }

      console.log(`🔗 Making ${method} request to: ${url}`)
      
      const response = await fetch(url, options)
      
      if (!response.ok) {
        const errorText = await response.text()
        console.error(`❌ API Error ${response.status}:`, errorText)
        throw new Error(`API request failed: ${response.status} - ${errorText}`)
      }
      
      const data = await response.json()
      console.log(`✅ API Response received for ${endpoint}`)
      
      return data
    } catch (error) {
      console.error(`❌ Request failed for ${endpoint}:`, error)
      throw error
    }
  }

  async getProfile() {
    if (!this.accessToken) {
      throw new Error('Access token required. Please complete OAuth flow first.')
    }

    try {
      const response = await fetch(`${this.baseUrl}/user/profile`, {
        headers: {
          'Authorization': `token ${this.apiKey}:${this.accessToken}`,
          'X-Kite-Version': '3'
        }
      })
      
      if (!response.ok) {
        const error = await response.text()
        throw new Error(`Failed to fetch profile: ${error}`)
      }
      
      return await response.json()
    } catch (error) {
      console.error('Error fetching profile:', error)
      throw error
    }
  }

  async getMargins() {
    if (!this.accessToken) {
      throw new Error('Access token required. Please complete OAuth flow first.')
    }

    try {
      const response = await fetch(`${this.baseUrl}/user/margins`, {
        headers: {
          'Authorization': `token ${this.apiKey}:${this.accessToken}`,
          'X-Kite-Version': '3'
        }
      })
      
      if (!response.ok) {
        const error = await response.text()
        throw new Error(`Failed to fetch margins: ${error}`)
      }
      
      return await response.json()
    } catch (error) {
      console.error('Error fetching margins:', error)
      throw error
    }
  }

  async getHoldings() {
    if (!this.accessToken) {
      throw new Error('Access token required. Please complete OAuth flow first.')
    }

    try {
      const response = await fetch(`${this.baseUrl}/portfolio/holdings`, {
        headers: {
          'Authorization': `token ${this.apiKey}:${this.accessToken}`,
          'X-Kite-Version': '3'
        }
      })
      
      if (!response.ok) {
        const error = await response.text()
        throw new Error(`Failed to fetch holdings: ${error}`)
      }
      
      return await response.json()
    } catch (error) {
      console.error('Error fetching holdings:', error)
      throw error
    }
  }

  async getPortfolioData() {
    if (!this.accessToken) {
      throw new Error('Access token required. Please complete OAuth flow first.')
    }

    try {
      // Fetch holdings, positions, and margins in parallel for comprehensive portfolio data
      const [holdingsResponse, positionsResponse, marginsResponse] = await Promise.all([
        this.getHoldings(),
        this.getPositions(),
        this.getMargins()
      ])

      // Calculate portfolio summary
      const holdings = holdingsResponse.data || []
      const positions = positionsResponse.data || {}
      const margins = marginsResponse.data || {}

      // Calculate total portfolio value
      let totalInvestmentValue = 0
      let totalCurrentValue = 0
      let totalPnL = 0
      let totalDayPnL = 0

      // Holdings calculations
      holdings.forEach((holding: any) => {
        const investmentValue = holding.average_price * holding.quantity
        const currentValue = holding.last_price * holding.quantity
        const pnl = currentValue - investmentValue
        
        totalInvestmentValue += investmentValue
        totalCurrentValue += currentValue
        totalPnL += pnl
      })

      // Positions calculations (net positions for day trading)
      const netPositions = positions.net || []
      netPositions.forEach((position: any) => {
        const positionPnL = position.pnl || 0
        totalDayPnL += positionPnL
        // Add position P&L to total P&L as well
        totalPnL += positionPnL
      })

      // Extract margin details from Zerodha
      const equity = margins.equity || {}
      const commodity = margins.commodity || {}
      
      // Use Zerodha's direct margin values where available
      const availableMargin = (equity.available?.cash || 0) + (commodity.available?.cash || 0)
      const usedMargin = (equity.utilised?.debits || 0) + (commodity.utilised?.debits || 0)
      // Try to use Zerodha's direct total margin, fallback to calculation
      const totalMargin = (equity.net || 0) + (commodity.net || 0) || (availableMargin + usedMargin)

      return {
        status: 'success',
        data: {
          // Portfolio Summary
          totalInvestmentValue: Math.round(totalInvestmentValue * 100) / 100,
          totalCurrentValue: Math.round(totalCurrentValue * 100) / 100,
          totalPnL: Math.round(totalPnL * 100) / 100,
          totalPnLPercentage: totalInvestmentValue > 0 ? Math.round((totalPnL / totalInvestmentValue) * 10000) / 100 : 0,
          totalDayPnL: Math.round(totalDayPnL * 100) / 100,
          
          // Margin Information
          availableMargin: Math.round(availableMargin * 100) / 100,
          usedMargin: Math.round(usedMargin * 100) / 100,
          totalMargin: Math.round(totalMargin * 100) / 100,
          marginUtilization: totalMargin > 0 ? Math.round((usedMargin / totalMargin) * 10000) / 100 : 0,
          
          // Raw Data
          holdings: holdingsResponse,
          positions: positionsResponse,
          margins: marginsResponse
        }
      }
    } catch (error) {
      console.error('Error fetching portfolio data:', error)
      throw error
    }
  }

  async getOrders() {
    if (!this.accessToken) {
      throw new Error('Access token required. Please complete OAuth flow first.')
    }

    try {
      const response = await fetch(`${this.baseUrl}/orders`, {
        headers: {
          'Authorization': `token ${this.apiKey}:${this.accessToken}`,
          'X-Kite-Version': '3'
        }
      })
      
      if (!response.ok) {
        const error = await response.text()
        throw new Error(`Failed to fetch orders: ${error}`)
      }
      
      return await response.json()
    } catch (error) {
      console.error('Error fetching orders:', error)
      throw error
    }
  }

  async getTrades() {
    if (!this.accessToken) {
      throw new Error('Access token required. Please complete OAuth flow first.')
    }

    try {
      const response = await fetch(`${this.baseUrl}/trades`, {
        headers: {
          'Authorization': `token ${this.apiKey}:${this.accessToken}`,
          'X-Kite-Version': '3'
        }
      })
      
      if (!response.ok) {
        const error = await response.text()
        throw new Error(`Failed to fetch trades: ${error}`)
      }
      
      return await response.json()
    } catch (error) {
      console.error('Error fetching trades:', error)
      throw error
    }
  }

  /**
   * Enhanced method to fetch trades with detailed charges
   * This method fetches both trades and orders to get comprehensive charge information
   */
  async getTradesWithCharges() {
    if (!this.accessToken) {
      throw new Error('Access token required. Please complete OAuth flow first.')
    }

    try {
      console.log('💰 Fetching trades with detailed charges...')

      // Fetch trades and orders concurrently
      const [tradesResponse, ordersResponse] = await Promise.all([
        this.getTrades(),
        this.getOrders()
      ])

      const trades = tradesResponse.data || []
      const orders = ordersResponse.data || []

      console.log(`📊 Found ${trades.length} trades and ${orders.length} orders`)

      // Create a map of orders by order_id for quick lookup
      const ordersMap = new Map()
      orders.forEach((order: any) => {
        ordersMap.set(order.order_id, order)
      })

      // Enhance trades with charge information from orders
      const enhancedTrades = trades.map((trade: any) => {
        const order = ordersMap.get(trade.order_id)
        
        // Calculate or extract charges
        const turnover = trade.quantity * trade.price
        const charges = this.calculateTradeCharges(trade, order, turnover)

        return {
          ...trade,
          turnover,
          charges,
          order_data: order, // Include order data for reference
          enhanced: true
        }
      })

      console.log(`✅ Enhanced ${enhancedTrades.length} trades with charge information`)

      return {
        status: 'success',
        data: enhancedTrades,
        charges_calculated: true
      }

    } catch (error) {
      console.error('Error fetching trades with charges:', error)
      throw error
    }
  }

  /**
   * Calculate or extract charges for a trade
   * Zerodha API doesn't always provide detailed charges, so we calculate them
   */
  private calculateTradeCharges(trade: any, order: any, turnover: number) {
    // Try to extract charges from trade data if available
    if (trade.charges && typeof trade.charges === 'object') {
      console.log('📊 Using provided charges from trade data')
      return this.normalizeCharges(trade.charges, turnover)
    }

    // Try to extract charges from order data if available
    if (order && order.charges && typeof order.charges === 'object') {
      console.log('📊 Using provided charges from order data')
      return this.normalizeCharges(order.charges, turnover)
    }

    // Calculate charges based on Zerodha's standard rates
    console.log('🧮 Calculating charges using standard rates')
    return this.calculateStandardCharges(trade, turnover)
  }

  /**
   * Normalize charges from Zerodha API response
   */
  private normalizeCharges(rawCharges: any, turnover: number) {
    return {
      brokerage: rawCharges.brokerage || 0,
      stt: rawCharges.stt || rawCharges.securities_transaction_tax || 0,
      exchangeCharges: rawCharges.exchange_charges || rawCharges.transaction_charges || 0,
      gst: rawCharges.gst || (rawCharges.cgst || 0) + (rawCharges.sgst || 0) + (rawCharges.igst || 0),
      cgst: rawCharges.cgst || 0,
      sgst: rawCharges.sgst || 0,
      igst: rawCharges.igst || 0,
      sebiCharges: rawCharges.sebi_charges || rawCharges.sebi || 0,
      stampCharges: rawCharges.stamp_charges || rawCharges.stamp || 0,
      totalCharges: rawCharges.total || rawCharges.total_charges || this.calculateTotalCharges(rawCharges),
      netAmount: turnover - (rawCharges.total || rawCharges.total_charges || 0),
      currency: 'INR',
      source: 'zerodha_api'
    }
  }

  /**
   * Calculate charges using standard Zerodha rates
   */
  private calculateStandardCharges(trade: any, turnover: number) {
    const isBuy = trade.transaction_type === 'BUY'
    const isSell = trade.transaction_type === 'SELL'
    
    // Standard Zerodha rates for equity derivatives
    const brokerage = Math.min(turnover * 0.0003, 20) // 0.03% or ₹20 max per order
    const exchangeCharges = turnover * 0.0019 // 0.0019% of turnover
    const stt = isSell ? turnover * 0.0125 : 0 // 0.0125% on sell side
    const stampCharges = isBuy ? turnover * 0.00003 : 0 // 0.003% on buy side
    const sebiCharges = turnover * 0.000001 // ₹1 per crore
    
    const taxableAmount = brokerage + exchangeCharges
    const cgst = taxableAmount * 0.09 // 9%
    const sgst = taxableAmount * 0.09 // 9%
    const gst = cgst + sgst
    
    const totalCharges = brokerage + stt + exchangeCharges + gst + sebiCharges + stampCharges
    
    return {
      brokerage,
      stt,
      exchangeCharges,
      gst,
      cgst,
      sgst,
      igst: 0,
      sebiCharges,
      stampCharges,
      totalCharges,
      netAmount: isBuy ? -(turnover + totalCharges) : (turnover - totalCharges),
      currency: 'INR',
      source: 'calculated'
    }
  }

  /**
   * Calculate total charges from charge components
   */
  private calculateTotalCharges(charges: any): number {
    return (charges.brokerage || 0) +
           (charges.stt || charges.securities_transaction_tax || 0) +
           (charges.exchange_charges || charges.transaction_charges || 0) +
           (charges.gst || (charges.cgst || 0) + (charges.sgst || 0) + (charges.igst || 0)) +
           (charges.sebi_charges || charges.sebi || 0) +
           (charges.stamp_charges || charges.stamp || 0)
  }

  // New method to fetch historical trades using orders endpoint
  async getHistoricalTrades(fromDate?: string, toDate?: string) {
    if (!this.accessToken) {
      throw new Error('Access token required. Please complete OAuth flow first.')
    }

    try {
      // Zerodha's /trades endpoint only gives current day trades
      // For historical data, we need to use /orders endpoint and filter completed orders
      const response = await fetch(`${this.baseUrl}/orders`, {
        headers: {
          'Authorization': `token ${this.apiKey}:${this.accessToken}`,
          'X-Kite-Version': '3'
        }
      })
      
      if (!response.ok) {
        const error = await response.text()
        throw new Error(`Failed to fetch orders: ${error}`)
      }
      
      const ordersData = await response.json()
      const orders = ordersData.data || []
      
      // Filter completed orders and convert to trade-like format
      const historicalTrades = orders
        .filter((order: any) => order.status === 'COMPLETE' && order.filled_quantity > 0)
        .map((order: any) => ({
          trade_id: `${order.order_id}_${order.order_timestamp}`, // Generate unique trade ID
          order_id: order.order_id,
          tradingsymbol: order.tradingsymbol,
          exchange: order.exchange,
          instrument_token: order.instrument_token,
          transaction_type: order.transaction_type,
          quantity: order.filled_quantity,
          price: order.average_price || order.price,
          product: order.product,
          order_type: order.order_type,
          trade_date: order.order_timestamp,
          fill_timestamp: order.order_timestamp,
          // Mark as historical data
          _source: 'historical_orders'
        }))
      
      // Apply date filtering if provided
      let filteredTrades = historicalTrades
      if (fromDate || toDate) {
        filteredTrades = historicalTrades.filter((trade: any) => {
          const tradeDate = new Date(trade.trade_date)
          const from = fromDate ? new Date(fromDate) : null
          const to = toDate ? new Date(toDate + 'T23:59:59') : null
          
          if (from && tradeDate < from) return false
          if (to && tradeDate > to) return false
          return true
        })
      }
      
      return {
        status: 'success',
        data: filteredTrades
      }
    } catch (error) {
      console.error('Error fetching historical trades:', error)
      throw error
    }
  }

  async getPositions() {
    if (!this.accessToken) {
      throw new Error('Access token required. Please complete OAuth flow first.')
    }

    try {
      const response = await fetch(`${this.baseUrl}/portfolio/positions`, {
        headers: {
          'Authorization': `token ${this.apiKey}:${this.accessToken}`,
          'X-Kite-Version': '3'
        }
      })
      
      if (!response.ok) {
        const error = await response.text()
        throw new Error(`Failed to fetch positions: ${error}`)
      }
      
      return await response.json()
    } catch (error) {
      console.error('Error fetching positions:', error)
      throw error
    }
  }

  async placeOrder(variety: string, orderParams: any) {
    if (!this.accessToken) {
      throw new Error('Access token required. Please complete OAuth flow first.')
    }

    try {
      const formBody = new URLSearchParams()
      formBody.append('exchange', orderParams.exchange)
      formBody.append('tradingsymbol', orderParams.tradingsymbol)
      formBody.append('transaction_type', orderParams.transaction_type)
      formBody.append('quantity', orderParams.quantity.toString())
      formBody.append('order_type', orderParams.order_type)
      formBody.append('product', orderParams.product)
      formBody.append('validity', orderParams.validity)
      if (orderParams.price) formBody.append('price', orderParams.price.toString())
      if (orderParams.trigger_price) formBody.append('trigger_price', orderParams.trigger_price.toString())
      if (orderParams.tag) formBody.append('tag', orderParams.tag)

      const response = await fetch(`${this.baseUrl}/orders/${variety}`, {
        method: 'POST',
        headers: {
          'Authorization': `token ${this.apiKey}:${this.accessToken}`,
          'X-Kite-Version': '3',
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: formBody.toString()
      })
      
      if (!response.ok) {
        const error = await response.text()
        throw new Error(`Failed to place order: ${error}`)
      }
      
      return await response.json()
    } catch (error) {
      console.error('Error placing order:', error)
      throw error
    }
  }

  static getLoginUrl(apiKey: string, redirectUrl: string): string {
    return `https://kite.zerodha.com/connect/login?api_key=${apiKey}&v=3&redirect_url=${encodeURIComponent(redirectUrl)}`
  }

  static async getAccessToken(apiKey: string, apiSecret: string, requestToken: string): Promise<string> {
    try {
      console.log('getAccessToken called with:', {
        apiKey: apiKey.substring(0, 6) + '***',
        apiSecret: apiSecret.substring(0, 6) + '***',
        requestToken: requestToken,
        requestTokenLength: requestToken.length
      })
      
      const checksum = crypto.createHash('sha256').update(apiKey + requestToken + apiSecret).digest('hex')
      
      // Try URL encoded form data instead of FormData
      const formBody = new URLSearchParams()
      formBody.append('api_key', apiKey)
      formBody.append('request_token', requestToken)
      formBody.append('checksum', checksum)
      
      console.log('Form body values:', {
        api_key: apiKey.substring(0, 6) + '***',
        request_token: requestToken,
        checksum: checksum.substring(0, 10) + '***'
      })
      
      console.log('Raw form body:', formBody.toString())

      const response = await fetch('https://api.kite.trade/session/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formBody.toString()
      })

      if (!response.ok) {
        const error = await response.text()
        throw new Error(`Failed to get access token: ${error}`)
      }

      const data = await response.json()
      return data.data.access_token
    } catch (error) {
      console.error('Error getting access token:', error)
      throw error
    }
  }

  // Historical Data Methods
  async getInstruments(exchange: string = 'NFO'): Promise<any[]> {
    try {
      // Zerodha instruments endpoint doesn't use /instruments/{exchange}
      // It uses /instruments endpoint and returns CSV data
      const url = `${this.baseUrl}/instruments`
      
      console.log(`🔗 Fetching instruments from: ${url}`)
      
      const response = await fetch(url, {
        headers: {
          'Authorization': `token ${this.apiKey}:${this.accessToken}`,
          'X-Kite-Version': '3'
        }
      })
      
      if (!response.ok) {
        const errorText = await response.text()
        console.error(`❌ Instruments API Error ${response.status}:`, errorText)
        throw new Error(`Instruments API failed: ${response.status} - ${errorText}`)
      }
      
      // Zerodha returns CSV data, not JSON
      const csvData = await response.text()
      console.log(`✅ Got CSV data, first 200 chars:`, csvData.substring(0, 200))
      
      // Parse CSV to JSON
      const lines = csvData.trim().split('\n')
      const headers = lines[0].split(',')
      const instruments = lines.slice(1).map(line => {
        const values = line.split(',')
        const instrument: any = {}
        headers.forEach((header, index) => {
          instrument[header] = values[index]
        })
        return instrument
      })
      
      // Filter by exchange if specified
      if (exchange && exchange !== 'ALL') {
        return instruments.filter(inst => inst.exchange === exchange)
      }
      
      return instruments
    } catch (error) {
      console.error('Error fetching instruments:', error)
      throw error
    }
  }

  async getHistoricalData(
    instrumentToken: number,
    interval: string,
    fromDate: Date,
    toDate: Date
  ): Promise<any[]> {
    try {
      const from = fromDate.toISOString().split('T')[0]
      const to = toDate.toISOString().split('T')[0]
      
      const url = `/instruments/historical/${instrumentToken}/${interval}?from=${from}&to=${to}`
      const response = await this.makeRequest('GET', url)
      
      // Transform response to standard format
      return response.data.candles.map((candle: any[]) => ({
        date: candle[0],
        open: candle[1],
        high: candle[2], 
        low: candle[3],
        close: candle[4],
        volume: candle[5],
        oi: candle[6] || 0
      }))
    } catch (error) {
      console.error('Error fetching historical data:', error)
      throw error
    }
  }

  async getQuote(instruments: string[]): Promise<any> {
    try {
      const response = await this.makeRequest('GET', `/quote?i=${instruments.join('&i=')}`)
      return response.data
    } catch (error) {
      console.error('Error fetching quote:', error)
      throw error
    }
  }

  async getLTP(instruments: string[]): Promise<any> {
    try {
      const response = await this.makeRequest('GET', `/quote/ltp?i=${instruments.join('&i=')}`)
      return response.data
    } catch (error) {
      console.error('Error fetching LTP:', error)
      throw error
    }
  }
}