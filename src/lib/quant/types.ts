export type Candle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type Quote = {
  symbol: string;
  name: string;
  currency: string;
  price: number;
  change: number;
  changePercent: number;
  previousClose: number;
  open: number;
  high: number;
  low: number;
  volume: number;
  marketCap?: number;
};

export type DataSource = "yahoo" | "synthetic";

export type StrategyId =
  | "buy-hold"
  | "sma-cross"
  | "ema-cross"
  | "rsi-reversion"
  | "macd-trend"
  | "bollinger"
  | "donchian"
  | "momentum";

export type StrategyParams = Record<string, number | string>;

export type Trade = {
  side: "long" | "short";
  entryTime: number;
  exitTime: number;
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  pnl: number;
  pnlPercent: number;
  barsHeld: number;
};

export type SignalMarker = {
  time: number;
  type: "buy" | "sell";
  price: number;
};

export type EquityPoint = {
  time: number;
  value: number;
  drawdown: number;
  benchmark: number;
};

export type PerformanceMetrics = {
  startEquity: number;
  endEquity: number;
  totalReturn: number;
  benchmarkReturn: number;
  alpha: number;
  cagr: number;
  sharpe: number;
  sortino: number;
  maxDrawdown: number;
  calmar: number;
  volatility: number;
  winRate: number;
  profitFactor: number;
  trades: number;
  avgTradeReturn: number;
  exposure: number;
  avgHoldBars: number;
};

export type BacktestResult = {
  symbol: string;
  strategy: StrategyId;
  params: StrategyParams;
  source: DataSource;
  equity: EquityPoint[];
  trades: Trade[];
  signals: SignalMarker[];
  metrics: PerformanceMetrics;
  candlesUsed: number;
};

export type BacktestConfig = {
  strategy: StrategyId;
  params: StrategyParams;
  initialCapital: number;
  commission: number;
  slippage: number;
  allowShort: boolean;
  allocation: number;
};
