// Backtesting TypeScript Type Definitions

export interface OHLCV {
  timestamp: Date
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export interface BacktestParams {
  botId: string
  startDate: Date
  endDate: Date
  initialCapital: number
  lotSize: number
  useStratFilter: boolean
  useGaussianFilter: boolean
  useFibEntry: boolean
  maxBulletsPerDay: number
  takeProfitPercent?: number
  useStratStops: boolean
  timezone: string
}

export interface StratSignal {
  is2D2U: boolean
  is2U2D: boolean
  fibLevel?: number
  hos?: number  // High of Signal
  los?: number  // Low of Signal
}

export interface TradingSignal {
  type: 'LONG' | 'SHORT' | null
  entryPrice: number
  fibLevel?: number
  stratSignal?: StratSignal
  gaussianSignal?: boolean
  timestamp: Date
}

export interface TradeDetail {
  id: string
  entryTime: Date
  exitTime?: Date
  symbol: string
  side: 'LONG' | 'SHORT'
  entryPrice: number
  exitPrice?: number
  quantity: number
  pnl?: number
  fees: number
  exitReason?: 'TIME_EXIT' | 'TAKE_PROFIT' | 'STOP_LOSS' | 'STRAT_STOP'
  stratSignal?: StratSignal
  fibEntry?: boolean
}

export interface DailyPnL {
  date: Date
  pnl: number
  trades: number
  wins: number
  losses: number
  equity: number
}

export interface EquityPoint {
  timestamp: Date
  equity: number
  drawdown: number
}

export interface BacktestResult {
  id: string
  params: BacktestParams
  status: 'RUNNING' | 'COMPLETED' | 'FAILED'
  progress: number
  
  // Performance Metrics
  totalReturn: number
  totalReturnPercent: number
  winRate: number
  totalTrades: number
  winningTrades: number
  losingTrades: number
  
  // Risk Metrics
  maxDrawdown: number
  maxDrawdownPercent: number
  recoveryTime: number // days to recover from max drawdown
  sharpeRatio: number
  sortinoRatio: number
  calmarRatio: number
  
  // Consecutive Stats
  consecutiveLosses: number
  consecutiveProfits: number
  maxConsecutiveLosses: number
  maxConsecutiveProfits: number
  
  // Detailed Results
  trades: TradeDetail[]
  equityCurve: EquityPoint[]
  dailyPnL: DailyPnL[]
  
  // Timing
  startTime: Date
  endTime?: Date
  duration?: number // milliseconds
  
  error?: string
}

export interface OpeningRange {
  startTime: Date
  endTime: Date
  high: number
  low: number
  open: number
  close: number
}

export interface GaussianFilterResult {
  bullish: boolean
  bearish: boolean
  value: number
  upper: number
  lower: number
}

export interface HistoricalDataPoint {
  symbol: string
  exchange: string
  timeframe: '5min' | '1day'
  timestamp: Date
  open: number
  high: number
  low: number
  close: number
  volume: number
  createdAt: Date
}