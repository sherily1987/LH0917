import { computeTargetPositions } from "@/lib/quant/strategies";
import type {
  BacktestConfig,
  BacktestResult,
  Candle,
  DataSource,
  EquityPoint,
  PerformanceMetrics,
  SignalMarker,
  Trade,
} from "@/lib/quant/types";

const EPS = 1e-10;

function sign(value: number): number {
  if (value > EPS) return 1;
  if (value < -EPS) return -1;
  return 0;
}

function computeMetrics(
  equity: EquityPoint[],
  trades: Trade[],
  startEquity: number,
  barsInMarket: number,
  totalBars: number,
): PerformanceMetrics {
  const endEquity = equity.at(-1)?.value ?? startEquity;
  const totalReturn = startEquity === 0 ? 0 : endEquity / startEquity - 1;
  const benchmarkReturn =
    startEquity === 0 ? 0 : (equity.at(-1)?.benchmark ?? startEquity) / startEquity - 1;
  const returns: number[] = [];
  for (let i = 1; i < equity.length; i++) {
    const prev = equity[i - 1].value;
    if (prev > 0) returns.push(equity[i].value / prev - 1);
  }

  const mean = returns.length ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
  const variance =
    returns.length > 1
      ? returns.reduce((acc, r) => acc + (r - mean) ** 2, 0) / (returns.length - 1)
      : 0;
  const std = Math.sqrt(variance);
  const downside = returns.filter((r) => r < 0);
  const downVar =
    downside.length > 1
      ? downside.reduce((acc, r) => acc + r ** 2, 0) / downside.length
      : downside.length === 1
        ? downside[0] ** 2
        : 0;
  const downStd = Math.sqrt(downVar);
  const sharpe = std === 0 ? 0 : (mean / std) * Math.sqrt(252);
  const sortino = downStd === 0 ? 0 : (mean / downStd) * Math.sqrt(252);
  const maxDrawdown = equity.reduce((m, p) => Math.min(m, p.drawdown), 0);
  const years = equity.length > 1 ? (equity.length - 1) / 252 : 0;
  const cagr = years > 0 && startEquity > 0 ? (endEquity / startEquity) ** (1 / years) - 1 : 0;
  const calmar = maxDrawdown === 0 ? 0 : cagr / Math.abs(maxDrawdown);
  const wins = trades.filter((t) => t.pnl > 0);
  const losses = trades.filter((t) => t.pnl < 0);
  const grossProfit = wins.reduce((a, t) => a + t.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((a, t) => a + t.pnl, 0));
  const profitFactor = grossLoss === 0 ? (grossProfit > 0 ? Infinity : 0) : grossProfit / grossLoss;
  const avgHoldBars =
    trades.length === 0 ? 0 : trades.reduce((a, t) => a + t.barsHeld, 0) / trades.length;
  const avgTradeReturn =
    trades.length === 0 ? 0 : trades.reduce((a, t) => a + t.pnlPercent, 0) / trades.length;

  return {
    startEquity,
    endEquity,
    totalReturn,
    benchmarkReturn,
    alpha: totalReturn - benchmarkReturn,
    cagr,
    sharpe,
    sortino,
    maxDrawdown,
    calmar,
    volatility: std * Math.sqrt(252),
    winRate: trades.length === 0 ? 0 : wins.length / trades.length,
    profitFactor: Number.isFinite(profitFactor) ? profitFactor : 99,
    trades: trades.length,
    avgTradeReturn,
    exposure: totalBars === 0 ? 0 : barsInMarket / totalBars,
    avgHoldBars,
  };
}

export function runBacktest(
  candles: Candle[],
  config: BacktestConfig,
  meta: { symbol: string; source: DataSource },
): BacktestResult {
  const initialCapital = config.initialCapital;
  const allocation = Math.min(1, Math.max(0, config.allocation));
  const targets = computeTargetPositions(
    candles,
    config.strategy,
    config.params,
    config.allowShort,
  );

  let cash = initialCapital;
  let shares = 0;
  let entryPrice = 0;
  let entryTime = 0;
  let entryBar = 0;
  let entrySide: "long" | "short" = "long";
  let barsInMarket = 0;
  let peak = initialCapital;
  let firstClose: number | null = null;

  const trades: Trade[] = [];
  const signals: SignalMarker[] = [];
  const equity: EquityPoint[] = [];

  const closePosition = (price: number, time: number, barIndex: number, reasonPrice: number) => {
    if (Math.abs(shares) < EPS) return;
    const exitPx = price;
    const pnl = shares * (exitPx - entryPrice);
    const notional = Math.abs(shares) * exitPx;
    const commission = notional * config.commission;
    cash += shares * exitPx - commission;
    const cost = Math.abs(shares) * entryPrice;
    trades.push({
      side: entrySide,
      entryTime,
      exitTime: time,
      entryPrice,
      exitPrice: exitPx,
      quantity: Math.abs(shares),
      pnl: pnl - commission,
      pnlPercent: cost === 0 ? 0 : (pnl - commission) / cost,
      barsHeld: Math.max(1, barIndex - entryBar),
    });
    signals.push({
      time,
      type: shares > 0 ? "sell" : "buy",
      price: reasonPrice,
    });
    shares = 0;
  };

  const openPosition = (
    target: number,
    price: number,
    time: number,
    barIndex: number,
    markPrice: number,
  ) => {
    if (target === 0) return;
    const nav = cash;
    const slip = target > 0 ? 1 + config.slippage : 1 - config.slippage;
    const px = price * slip;
    const budget = (nav * allocation) / (1 + config.commission);
    if (budget <= 0 || px <= 0) return;
    const quantity = budget / px;
    const signed = target * quantity;
    const commission = Math.abs(signed) * px * config.commission;
    cash -= signed * px + commission;
    shares = signed;
    entryPrice = px;
    entryTime = time;
    entryBar = barIndex;
    entrySide = target > 0 ? "long" : "short";
    signals.push({
      time,
      type: target > 0 ? "buy" : "sell",
      price: markPrice,
    });
  };

  for (let i = 0; i < candles.length; i++) {
    const candle = candles[i];
    if (firstClose == null) firstClose = candle.close;

    if (i > 0) {
      const desired = sign(targets[i - 1]);
      const current = sign(shares);
      if (desired !== current) {
        const fill = candle.open;
        if (current !== 0) closePosition(fill * (current > 0 ? 1 - config.slippage : 1 + config.slippage), candle.time, i, candle.open);
        if (desired !== 0) openPosition(desired, candle.open, candle.time, i, candle.open);
      }
    }

    const nav = cash + shares * candle.close;
    peak = Math.max(peak, nav);
    const drawdown = peak === 0 ? 0 : nav / peak - 1;
    const benchmark =
      firstClose && firstClose !== 0 ? initialCapital * (candle.close / firstClose) : initialCapital;
    equity.push({ time: candle.time, value: nav, drawdown, benchmark });
    if (Math.abs(shares) > EPS) barsInMarket += 1;
  }

  const last = candles.at(-1);
  if (last && Math.abs(shares) > EPS) {
    closePosition(last.close, last.time, candles.length - 1, last.close);
    const nav = cash;
    peak = Math.max(peak, nav);
    const lastPoint = equity.at(-1);
    if (lastPoint) {
      lastPoint.value = nav;
      lastPoint.drawdown = peak === 0 ? 0 : nav / peak - 1;
    }
  }

  return {
    symbol: meta.symbol,
    strategy: config.strategy,
    params: config.params,
    source: meta.source,
    equity,
    trades,
    signals,
    metrics: computeMetrics(equity, trades, initialCapital, barsInMarket, candles.length),
    candlesUsed: candles.length,
  };
}
