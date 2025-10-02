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
      const response = await this.makeRequest('GET', `/instruments/${exchange}`)
      return response
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