import { rsi, sma, stdev } from "@/lib/quant/indicators";
import type { Candle } from "@/lib/quant/types";
import type { MarketFeatures } from "@/lib/bot/types";

function change(values: number[], bars: number): number {
  if (values.length <= bars) return 0;
  const base = values[values.length - 1 - bars];
  return base === 0 ? 0 : values[values.length - 1] / base - 1;
}

function round(value: number | null, digits = 4): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

/** Summarizes daily candles into the compact features the model reads. */
export function featuresFromCandles(symbol: string, candles: Candle[]): MarketFeatures | null {
  if (candles.length < 31) return null;
  const closes = candles.map((c) => c.close);
  const volumes = candles.map((c) => c.volume);
  const price = closes.at(-1)!;
  const last = closes.length - 1;

  const sma20 = sma(closes, 20)[last];
  const sma50 = sma(closes, 50)[last];
  const returns = closes.slice(1).map((c, i) => (closes[i] === 0 ? 0 : c / closes[i] - 1));
  const vol = stdev(returns, 20).at(-1) ?? null;
  const recent = candles.slice(-30);
  const high30 = Math.max(...recent.map((c) => c.high));
  const low30 = Math.min(...recent.map((c) => c.low));
  // The newest bar is usually today's unfinished candle, so volume uses the last closed bar.
  const avgVolume20 = sma(volumes, 20)[last - 1];

  return {
    symbol,
    price,
    return1d: round(change(closes, 1))!,
    return7d: round(change(closes, 7))!,
    return30d: round(change(closes, 30))!,
    rsi14: round(rsi(closes, 14)[last], 1),
    distSma20: sma20 ? round(price / sma20 - 1) : null,
    distSma50: sma50 ? round(price / sma50 - 1) : null,
    volatility20d: round(vol),
    distHigh30d: round(price / high30 - 1)!,
    distLow30d: round(price / low30 - 1)!,
    volumeRatio: avgVolume20 ? round(volumes[last - 1] / avgVolume20, 2) : null,
  };
}
