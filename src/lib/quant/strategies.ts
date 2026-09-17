import type { Candle, StrategyId, StrategyParams } from "@/lib/quant/types";
import {
  bollinger,
  ema,
  macd,
  roc,
  rollingMax,
  rollingMin,
  rsi,
  sma,
} from "@/lib/quant/indicators";

export type StrategyMeta = {
  id: StrategyId;
  name: string;
  category: "趋势" | "均值回归" | "突破" | "基准";
  summary: string;
  description: string;
  defaults: StrategyParams;
  fields: Array<{
    key: string;
    label: string;
    min?: number;
    max?: number;
    step?: number;
    options?: Array<{ value: string; label: string }>;
  }>;
};

export const STRATEGIES: StrategyMeta[] = [
  {
    id: "buy-hold",
    name: "买入持有",
    category: "基准",
    summary: "全程满仓，用作超额收益对照。",
    description:
      "在第一根可交易 K 线开仓后一直持有到样本结束。用来衡量主动策略是否真正跑赢简单持有。",
    defaults: {},
    fields: [],
  },
  {
    id: "sma-cross",
    name: "双均线交叉",
    category: "趋势",
    summary: "快线上穿慢线做多，下穿离场。",
    description:
      "经典移动平均交叉。短周期均线代表近期趋势，长周期均线代表中期方向。适合波动有持续性的品种，震荡市容易反复止损。",
    defaults: { fast: 10, slow: 30 },
    fields: [
      { key: "fast", label: "快线周期", min: 2, max: 60, step: 1 },
      { key: "slow", label: "慢线周期", min: 5, max: 200, step: 1 },
    ],
  },
  {
    id: "ema-cross",
    name: "EMA 交叉",
    category: "趋势",
    summary: "指数均线交叉，对价格更敏感。",
    description:
      "与 SMA 交叉相同逻辑，但 EMA 对最近价格赋予更高权重，信号更快，也更容易在噪声中误触发。",
    defaults: { fast: 12, slow: 26 },
    fields: [
      { key: "fast", label: "快线周期", min: 2, max: 60, step: 1 },
      { key: "slow", label: "慢线周期", min: 5, max: 200, step: 1 },
    ],
  },
  {
    id: "rsi-reversion",
    name: "RSI 均值回归",
    category: "均值回归",
    summary: "超卖买入，回到中性区域离场。",
    description:
      "RSI 跌破超卖阈值后做多，回到中轴附近平仓。可选在超买区域做空。适合区间震荡，单边趋势中会逆势挨打。",
    defaults: { period: 14, oversold: 30, overbought: 70, exit: 50 },
    fields: [
      { key: "period", label: "RSI 周期", min: 2, max: 50, step: 1 },
      { key: "oversold", label: "超卖", min: 5, max: 45, step: 1 },
      { key: "overbought", label: "超买", min: 55, max: 95, step: 1 },
      { key: "exit", label: "离场中轴", min: 40, max: 60, step: 1 },
    ],
  },
  {
    id: "macd-trend",
    name: "MACD 趋势",
    category: "趋势",
    summary: "MACD 上穿信号线且柱状图为正时做多。",
    description:
      "用 MACD 线与信号线的交叉确认趋势方向。柱状图转正作为过滤，减少一部分滞后交叉的噪声。",
    defaults: { fast: 12, slow: 26, signal: 9 },
    fields: [
      { key: "fast", label: "快线", min: 5, max: 20, step: 1 },
      { key: "slow", label: "慢线", min: 15, max: 50, step: 1 },
      { key: "signal", label: "信号线", min: 5, max: 20, step: 1 },
    ],
  },
  {
    id: "bollinger",
    name: "布林带",
    category: "突破",
    summary: "突破上轨跟随，或跌破下轨回归。",
    description:
      "突破模式：收盘站上上轨做多，跌破中轨离场。回归模式：收盘跌破下轨做多，回到中轨离场。两种模式覆盖趋势和震荡。",
    defaults: { period: 20, multiplier: 2, mode: "breakout" },
    fields: [
      { key: "period", label: "周期", min: 10, max: 60, step: 1 },
      { key: "multiplier", label: "标准差倍数", min: 1, max: 3.5, step: 0.1 },
      {
        key: "mode",
        label: "模式",
        options: [
          { value: "breakout", label: "突破跟随" },
          { value: "reversion", label: "均值回归" },
        ],
      },
    ],
  },
  {
    id: "donchian",
    name: "唐奇安通道",
    category: "突破",
    summary: "海龟法则：创新高买入，跌破退出通道离场。",
    description:
      "当收盘价突破过去 N 根 K 线的最高价时做多，跌破过去 M 根最低价时离场。经典趋势跟踪，交易次数少、盈亏比高。",
    defaults: { entry: 20, exit: 10 },
    fields: [
      { key: "entry", label: "入场通道", min: 5, max: 60, step: 1 },
      { key: "exit", label: "离场通道", min: 3, max: 40, step: 1 },
    ],
  },
  {
    id: "momentum",
    name: "动量 ROC",
    category: "趋势",
    summary: "N 日收益率高于阈值则持有。",
    description:
      "用过去 N 日收益率作为动量因子。动量为正（或超过阈值）时做多，否则空仓。简单、可解释，对参数不那么敏感。",
    defaults: { period: 20, threshold: 0 },
    fields: [
      { key: "period", label: "回看天数", min: 5, max: 120, step: 1 },
      { key: "threshold", label: "开仓阈值", min: -0.2, max: 0.2, step: 0.005 },
    ],
  },
];

export function getStrategy(id: StrategyId): StrategyMeta {
  const found = STRATEGIES.find((item) => item.id === id);
  if (!found) throw new Error(`未知策略: ${id}`);
  return found;
}

function num(params: StrategyParams, key: string, fallback: number): number {
  const value = params[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return fallback;
}

function str(params: StrategyParams, key: string, fallback: string): string {
  const value = params[key];
  return typeof value === "string" && value ? value : fallback;
}

/**
 * Target position after observing bar i. Filled on the next bar's open.
 * 1 = long, 0 = flat, -1 = short.
 */
export function computeTargetPositions(
  candles: Candle[],
  strategy: StrategyId,
  params: StrategyParams,
  allowShort: boolean,
): number[] {
  const closes = candles.map((c) => c.close);
  const highs = candles.map((c) => c.high);
  const lows = candles.map((c) => c.low);
  const n = candles.length;
  const pos = Array<number>(n).fill(0);
  const clamp = (value: number) => {
    if (value < 0 && !allowShort) return 0;
    return value;
  };

  if (strategy === "buy-hold") {
    return pos.map(() => 1);
  }

  if (strategy === "sma-cross" || strategy === "ema-cross") {
    const fastP = Math.max(1, Math.round(num(params, "fast", strategy === "ema-cross" ? 12 : 10)));
    const slowP = Math.max(fastP + 1, Math.round(num(params, "slow", strategy === "ema-cross" ? 26 : 30)));
    const fast = strategy === "ema-cross" ? ema(closes, fastP) : sma(closes, fastP);
    const slow = strategy === "ema-cross" ? ema(closes, slowP) : sma(closes, slowP);
    for (let i = 0; i < n; i++) {
      if (fast[i] == null || slow[i] == null) continue;
      if (fast[i]! > slow[i]!) pos[i] = 1;
      else pos[i] = clamp(-1);
    }
    return pos;
  }

  if (strategy === "rsi-reversion") {
    const period = Math.max(2, Math.round(num(params, "period", 14)));
    const oversold = num(params, "oversold", 30);
    const overbought = num(params, "overbought", 70);
    const exitLevel = num(params, "exit", 50);
    const series = rsi(closes, period);
    let current = 0;
    for (let i = 0; i < n; i++) {
      const value = series[i];
      if (value == null) {
        pos[i] = 0;
        continue;
      }
      if (current === 0 && value <= oversold) current = 1;
      else if (current === 0 && allowShort && value >= overbought) current = -1;
      else if (current === 1 && value >= exitLevel) current = 0;
      else if (current === -1 && value <= exitLevel) current = 0;
      pos[i] = current;
    }
    return pos;
  }

  if (strategy === "macd-trend") {
    const fastP = Math.max(2, Math.round(num(params, "fast", 12)));
    const slowP = Math.max(fastP + 1, Math.round(num(params, "slow", 26)));
    const signalP = Math.max(2, Math.round(num(params, "signal", 9)));
    const series = macd(closes, fastP, slowP, signalP);
    for (let i = 0; i < n; i++) {
      if (series.macd[i] == null || series.signal[i] == null || series.histogram[i] == null) continue;
      if (series.macd[i]! > series.signal[i]! && series.histogram[i]! > 0) pos[i] = 1;
      else pos[i] = clamp(-1);
    }
    return pos;
  }

  if (strategy === "bollinger") {
    const period = Math.max(5, Math.round(num(params, "period", 20)));
    const multiplier = num(params, "multiplier", 2);
    const mode = str(params, "mode", "breakout");
    const bands = bollinger(closes, period, multiplier);
    let current = 0;
    for (let i = 0; i < n; i++) {
      if (bands.mid[i] == null || bands.upper[i] == null || bands.lower[i] == null) {
        pos[i] = 0;
        continue;
      }
      if (mode === "reversion") {
        if (current === 0 && closes[i] < bands.lower[i]!) current = 1;
        else if (current === 0 && allowShort && closes[i] > bands.upper[i]!) current = -1;
        else if (current === 1 && closes[i] >= bands.mid[i]!) current = 0;
        else if (current === -1 && closes[i] <= bands.mid[i]!) current = 0;
      } else {
        if (closes[i] > bands.upper[i]!) current = 1;
        else if (allowShort && closes[i] < bands.lower[i]!) current = -1;
        else if (current === 1 && closes[i] < bands.mid[i]!) current = 0;
        else if (current === -1 && closes[i] > bands.mid[i]!) current = 0;
      }
      pos[i] = current;
    }
    return pos;
  }

  if (strategy === "donchian") {
    const entry = Math.max(2, Math.round(num(params, "entry", 20)));
    const exitP = Math.max(2, Math.round(num(params, "exit", 10)));
    const entryHigh = rollingMax(highs, entry);
    const entryLow = rollingMin(lows, entry);
    const exitLow = rollingMin(lows, exitP);
    const exitHigh = rollingMax(highs, exitP);
    let current = 0;
    for (let i = 1; i < n; i++) {
      const prevHigh = entryHigh[i - 1];
      const prevLow = entryLow[i - 1];
      const prevExitLow = exitLow[i - 1];
      const prevExitHigh = exitHigh[i - 1];
      if (prevHigh != null && closes[i] > prevHigh) current = 1;
      else if (allowShort && prevLow != null && closes[i] < prevLow) current = -1;
      if (current === 1 && prevExitLow != null && closes[i] < prevExitLow) current = 0;
      if (current === -1 && prevExitHigh != null && closes[i] > prevExitHigh) current = 0;
      pos[i] = current;
    }
    return pos;
  }

  if (strategy === "momentum") {
    const period = Math.max(2, Math.round(num(params, "period", 20)));
    const threshold = num(params, "threshold", 0);
    const series = roc(closes, period);
    for (let i = 0; i < n; i++) {
      if (series[i] == null) continue;
      if (series[i]! > threshold) pos[i] = 1;
      else pos[i] = clamp(-1);
    }
    return pos;
  }

  return pos;
}
