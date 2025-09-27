export interface User {
  _id: string
  name: string
  email: string
  phone?: string
  image?: string
  emailVerified?: Date
  phoneVerified?: Date
  createdAt: Date
  updatedAt: Date
  zerodhaConfig?: ZerodhaConfig
}

export interface ZerodhaConfig {
  apiKey: string
  apiSecret: string
  isConnected: boolean
  balance?: number
  lastSync?: Date
}

export interface Trade {
  _id: string
  userId: string
  tradingSymbol: string
  exchange: string
  instrumentToken: number
  quantity: number
  price: number
  product: string
  orderType: string
  transactionType: 'BUY' | 'SELL'
  timestamp: Date
  orderId: string
  botId?: string
  pnl?: number
}

export interface Bot {
  _id: string
  name: string
  description: string
  strategy: string
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH'
  minInvestment: number
  maxInvestment: number
  expectedReturn: number
  isActive: boolean
  parameters: Record<string, any>
  createdAt: Date
  updatedAt: Date
}

export interface UserBotAllocation {
  _id: string
  userId: string
  botId: string
  allocatedAmount: number
  isActive: boolean
  startDate: Date
  endDate?: Date
  currentValue: number
  totalPnl: number
  createdAt: Date
  updatedAt: Date
}

export interface BacktestResult {
  _id: string
  userId: string
  botId: string
  startDate: Date
  endDate: Date
  initialCapital: number
  finalCapital: number
  totalReturn: number
  maxDrawdown: number
  sharpeRatio: number
  totalTrades: number
  winningTrades: number
  losingTrades: number
  parameters: Record<string, any>
  trades: Trade[]
  createdAt: Date
}