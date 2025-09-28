import { decrypt } from '@/utils/encryption'
import crypto from 'crypto'

export class ZerodhaAPI {
  private apiKey: string
  private apiSecret: string
  private accessToken?: string
  private baseUrl = 'https://api.kite.trade'

  constructor(encryptedApiKey: string, encryptedApiSecret: string, accessToken?: string) {
    this.apiKey = decrypt(encryptedApiKey)
    this.apiSecret = decrypt(encryptedApiSecret)
    this.accessToken = accessToken ? decrypt(accessToken) : undefined
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
}