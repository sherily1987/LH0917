import { BTC_LIVE } from "@/lib/typesafe/questions";
import type { Candle, Quote } from "@/lib/quant/types";

export function barSeconds(interval: string): number {
  if (interval === "1m") return 60;
  if (interval === "5m") return 300;
  if (interval === "15m") return 900;
  if (interval === "1h") return 3600;
  if (interval === "1wk") return 7 * 86400;
  return 86400;
}

export function applyLiveQuote(
  candles: Candle[],
  quote: Quote,
  interval: string,
  nowUnix = Math.floor(Date.now() / 1000),
): Candle[] {
  if (!candles.length || !Number.isFinite(quote.price) || quote.price <= 0) return candles;
  const copy = candles.map((item) => ({ ...item }));
  const last = copy[copy.length - 1];
  const width = barSeconds(interval);
  if (nowUnix - last.time < width + 45) {
    last.close = quote.price;
    last.high = Math.max(last.high, quote.price);
    last.low = Math.min(last.low, quote.price);
    return copy;
  }
  copy.push({
    time: nowUnix,
    open: last.close,
    high: Math.max(last.close, quote.price),
    low: Math.min(last.close, quote.price),
    close: quote.price,
    volume: 0,
  });
  return copy;
}

export function shouldRejudge(input: {
  judgedPrice: number;
  judgedAtMs: number;
  livePrice: number;
  nowMs: number;
  move?: number;
  afterMs?: number;
}): boolean {
  if (!Number.isFinite(input.livePrice) || input.livePrice <= 0) return false;
  if (!Number.isFinite(input.judgedPrice) || input.judgedPrice <= 0) return true;
  const move = input.move ?? BTC_LIVE.rejudgeMove;
  const afterMs = input.afterMs ?? BTC_LIVE.rejudgeAfterMs;
  const drifted = Math.abs(input.livePrice / input.judgedPrice - 1) >= move;
  const stale = input.nowMs - input.judgedAtMs >= afterMs;
  return drifted || stale;
}
