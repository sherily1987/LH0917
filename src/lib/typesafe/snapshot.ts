import { STARTING_CASH, type PaperState } from "@/app/portfolio/paper";
import { BTC_SYMBOL } from "@/lib/typesafe/questions";
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
import { computeTargetPositions, STRATEGIES } from "@/lib/quant/strategies";
import type { Candle, DataSource } from "@/lib/quant/types";
import { getInstrument } from "@/lib/market/universe";

export type BtcSnapshot = ReturnType<typeof buildBtcSnapshot>;

function round(value: number, digits = 4): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function lastNumber(values: Array<number | null | undefined>): number | null {
  for (let i = values.length - 1; i >= 0; i--) {
    const value = values[i];
    if (value != null && Number.isFinite(value)) return round(value);
  }
  return null;
}

function pctChange(later: number, earlier: number): number | null {
  if (!Number.isFinite(later) || !Number.isFinite(earlier) || earlier === 0) return null;
  return round(((later - earlier) / earlier) * 100, 3);
}

function atrPercent(candles: Candle[], period = 14): number | null {
  if (candles.length <= period) return null;
  let sum = 0;
  for (let i = candles.length - period; i < candles.length; i++) {
    const current = candles[i];
    const prev = candles[i - 1];
    const tr = Math.max(
      current.high - current.low,
      Math.abs(current.high - prev.close),
      Math.abs(current.low - prev.close),
    );
    sum += tr;
  }
  const atr = sum / period;
  const last = candles.at(-1)?.close;
  if (!last) return null;
  return round((atr / last) * 100, 3);
}

function positionLabel(value: number): "long" | "flat" | "short" {
  if (value > 0) return "long";
  if (value < 0) return "short";
  return "flat";
}

export function buildBtcSnapshot(input: {
  candles: Candle[];
  source: DataSource;
  paper: PaperState;
  traderNote?: string;
}) {
  const instrument = getInstrument(BTC_SYMBOL);
  const candles = input.candles;
  const last = candles.at(-1);
  const prev = candles.at(-2);
  const close = last?.close ?? instrument.basePrice;
  const closes = candles.map((item) => item.close);
  const highs = candles.map((item) => item.high);
  const lows = candles.map((item) => item.low);

  const sma10 = sma(closes, 10);
  const sma30 = sma(closes, 30);
  const ema12 = ema(closes, 12);
  const ema26 = ema(closes, 26);
  const rsi14 = rsi(closes, 14);
  const macdSeries = macd(closes);
  const bands = bollinger(closes, 20, 2);
  const roc20 = roc(closes, 20);
  const donchianHigh = rollingMax(highs, 20);
  const donchianLow = rollingMin(lows, 20);

  const lastSma10 = lastNumber(sma10);
  const lastSma30 = lastNumber(sma30);
  const lastUpper = lastNumber(bands.upper);
  const lastLower = lastNumber(bands.lower);
  const lastDonHigh = lastNumber(donchianHigh);
  const lastDonLow = lastNumber(donchianLow);

  const weekAgo = candles.at(-6)?.close;
  const monthAgo = candles.at(-21)?.close;
  const yearHigh = highs.length ? Math.max(...highs) : close;
  const yearLow = lows.length ? Math.min(...lows) : close;

  const paperBtc = input.paper.positions.find((item) => item.symbol === BTC_SYMBOL);
  const btcQty = paperBtc?.quantity ?? 0;
  const btcAvg = paperBtc?.avgPrice ?? 0;
  const btcNotional = btcQty * close;
  const otherNotional = input.paper.positions
    .filter((item) => item.symbol !== BTC_SYMBOL)
    .reduce((sum, item) => sum + item.quantity * item.avgPrice, 0);
  const equity = input.paper.cash + btcNotional + otherNotional;
  const note = input.traderNote?.trim().slice(0, 400) || null;

  return {
    desk: {
      purpose:
        "Paper-trading decision support for Bitcoin only. Code computes the numbers. Jev judges the snapshot. The human confirms any paper fill. Not live execution. Not financial advice.",
      instrument: {
        symbol: BTC_SYMBOL,
        name: instrument.name,
        nameZh: instrument.nameZh,
        bars: "Yahoo BTC-USD daily candles, one year",
      },
      constraints: {
        longOnly: true,
        execution: "Paper fills at the latest last price. No short inventory.",
        humanConfirm: true,
      },
    },
    market: {
      source: input.source,
      asOfUnix: last?.time ?? null,
      last: round(close, 2),
      currency: "USD",
      change1dPercent: prev ? pctChange(close, prev.close) : null,
      return7dPercent: weekAgo ? pctChange(close, weekAgo) : null,
      return30dPercent: monthAgo ? pctChange(close, monthAgo) : null,
      range52w: {
        high: round(yearHigh, 2),
        low: round(yearLow, 2),
        percentFromHigh: pctChange(close, yearHigh),
        percentFromLow: pctChange(close, yearLow),
      },
    },
    indicators: {
      rsi14: lastNumber(rsi14),
      sma10: lastSma10,
      sma30: lastSma30,
      sma10VsSma30:
        lastSma10 == null || lastSma30 == null
          ? "unknown"
          : lastSma10 > lastSma30
            ? "above"
            : lastSma10 < lastSma30
              ? "below"
              : "equal",
      ema12: lastNumber(ema12),
      ema26: lastNumber(ema26),
      macdHistogram: lastNumber(macdSeries.histogram),
      bollingerPercentB:
        lastUpper != null && lastLower != null && lastUpper !== lastLower
          ? round((close - lastLower) / (lastUpper - lastLower), 3)
          : null,
      atr14Percent: atrPercent(candles),
      roc20Percent: lastNumber(roc20) != null ? round((lastNumber(roc20) as number) * 100, 3) : null,
      donchian20: {
        high: lastDonHigh,
        low: lastDonLow,
        position:
          lastDonHigh != null && lastDonLow != null && lastDonHigh !== lastDonLow
            ? round((close - lastDonLow) / (lastDonHigh - lastDonLow), 3)
            : null,
      },
    },
    strategySignals: STRATEGIES.filter((item) => item.id !== "buy-hold").map((item) => {
      const series = computeTargetPositions(candles, item.id, item.defaults, true);
      const lastTarget = series.at(-1) ?? 0;
      return {
        id: item.id,
        name: item.name,
        category: item.category,
        lastTarget: positionLabel(lastTarget),
        summary: item.summary,
      };
    }),
    paper: {
      startingCashUsd: STARTING_CASH,
      cashUsd: round(input.paper.cash, 2),
      equityUsd: round(Number.isFinite(equity) ? equity : input.paper.cash, 2),
      btcQuantity: round(btcQty, 8),
      btcAvgPrice: round(btcAvg, 2),
      btcNotionalUsd: round(btcNotional, 2),
      investedPercent: equity > 0 ? round((btcNotional / equity) * 100, 3) : 0,
      side: btcQty > 0 ? ("long" as const) : ("flat" as const),
    },
    traderNote: note,
  };
}
