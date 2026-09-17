import type { Candle } from "@/lib/quant/types";
import { getInstrument } from "@/lib/market/universe";

function hashString(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  let a = seed || 1;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function boxMuller(rand: () => number): number {
  const u = Math.max(1e-12, rand());
  const v = Math.max(1e-12, rand());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

const RANGE_BARS: Record<string, number> = {
  "1mo": 22,
  "3mo": 66,
  "6mo": 130,
  "1y": 252,
  "2y": 504,
  "5y": 1260,
};

export function syntheticCandles(symbol: string, range: string): Candle[] {
  const instrument = getInstrument(symbol);
  const bars = RANGE_BARS[range] ?? 252;
  const rand = mulberry32(hashString(instrument.symbol + ":" + range));
  const drift = ((hashString(instrument.symbol) % 17) - 8) / 100 / 252;
  const vol =
    instrument.assetClass === "crypto" ? 0.035 : instrument.assetClass === "index" ? 0.009 : 0.016;

  const candles: Candle[] = [];
  let price = instrument.basePrice;
  const now = new Date();
  now.setUTCHours(20, 0, 0, 0);
  const start = new Date(now);
  start.setUTCDate(start.getUTCDate() - bars - 4);

  let t = Math.floor(start.getTime() / 1000);
  while (candles.length < bars) {
    t += 24 * 60 * 60;
    const date = new Date(t * 1000);
    const day = date.getUTCDay();
    if (instrument.assetClass !== "crypto" && (day === 0 || day === 6)) continue;

    const shock = drift + vol * boxMuller(rand);
    const open = price * (1 + vol * 0.15 * boxMuller(rand));
    const close = Math.max(0.01, open * (1 + shock));
    const high = Math.max(open, close) * (1 + Math.abs(vol * 0.6 * rand()));
    const low = Math.min(open, close) * (1 - Math.abs(vol * 0.6 * rand()));
    const volume = Math.round((8_000_000 + rand() * 40_000_000) * (instrument.assetClass === "crypto" ? 40 : 1));
    candles.push({
      time: t,
      open: roundPrice(open),
      high: roundPrice(high),
      low: roundPrice(Math.max(0.01, low)),
      close: roundPrice(close),
      volume,
    });
    price = close;
  }
  return candles;
}

function roundPrice(value: number): number {
  if (value >= 100) return Math.round(value * 100) / 100;
  if (value >= 1) return Math.round(value * 1000) / 1000;
  return Math.round(value * 10000) / 10000;
}
