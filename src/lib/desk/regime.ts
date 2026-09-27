import { adx, bollinger, ema, macd, roc, rollingMax, rollingMin, rsi, sma } from "@/lib/quant/indicators";
import type { DeskCandle, DeskRegime, DeskVote, DeskVoteName } from "@/lib/desk/types";

export type RegimeReading = {
  regime: DeskRegime;
  /** %B >= 1. Blocks new longs. Not a vote. */
  stretched: boolean;
  /** %B <= 0. Blocks new shorts in the both-sides replay. Not a vote. */
  compressed: boolean;
  votes: DeskVote[];
  upVotes: number;
  downVotes: number;
  bollingerPercentB: number | null;
  summary: string;
};

const VOTE_LABEL: Record<DeskVoteName, string> = {
  sma: "SMA 10/30",
  ema: "EMA 12/26",
  macd: "MACD",
  donchian: "唐奇安",
  roc: "ROC",
  rsi: "RSI",
  adx: "ADX",
};

function lastNumber(values: Array<number | null | undefined>): number | null {
  for (let i = values.length - 1; i >= 0; i--) {
    const value = values[i];
    if (value != null && Number.isFinite(value)) return value;
  }
  return null;
}

function direction(up: boolean | null): -1 | 0 | 1 {
  if (up == null) return 0;
  return up ? 1 : -1;
}

function vote(name: DeskVoteName, value: -1 | 0 | 1, detail: string): DeskVote {
  return { name, label: VOTE_LABEL[name], vote: value, detail };
}

/**
 * Seven directional votes. A side needs 5 to call the regime.
 * Bollinger %B is not a vote: %B >= 1 blocks new longs, %B <= 0 blocks new shorts.
 */
export function readRegime(candles: DeskCandle[]): RegimeReading {
  if (candles.length < 40) {
    return {
      regime: "unknown",
      stretched: false,
      compressed: false,
      votes: [],
      upVotes: 0,
      downVotes: 0,
      bollingerPercentB: null,
      summary: "K 线不足，无法判断趋势，等待。",
    };
  }

  const closes = candles.map((item) => item.close);
  const highs = candles.map((item) => item.high);
  const lows = candles.map((item) => item.low);
  const close = closes[closes.length - 1];

  const smaFast = lastNumber(sma(closes, 10));
  const smaSlow = lastNumber(sma(closes, 30));
  const emaFast = lastNumber(ema(closes, 12));
  const emaSlow = lastNumber(ema(closes, 26));
  const histogram = lastNumber(macd(closes).histogram);
  const roc20 = lastNumber(roc(closes, 20));
  const rsi14 = lastNumber(rsi(closes, 14));
  const donHigh = lastNumber(rollingMax(highs, 20));
  const donLow = lastNumber(rollingMin(lows, 20));
  const bands = bollinger(closes, 20, 2);
  const upper = lastNumber(bands.upper);
  const lower = lastNumber(bands.lower);
  const adxPoint = adx(highs, lows, closes, 14).at(-1);
  const percentB =
    upper != null && lower != null && upper !== lower ? (close - lower) / (upper - lower) : null;

  const donMid = donHigh != null && donLow != null ? (donHigh + donLow) / 2 : null;
  const adxUp =
    adxPoint?.adx != null && adxPoint.plusDi != null && adxPoint.minusDi != null && adxPoint.adx >= 20
      ? adxPoint.plusDi > adxPoint.minusDi
      : null;
  const adxDown =
    adxPoint?.adx != null && adxPoint.plusDi != null && adxPoint.minusDi != null && adxPoint.adx >= 20
      ? adxPoint.minusDi > adxPoint.plusDi
      : null;

  const votes: DeskVote[] = [
    vote(
      "sma",
      smaFast == null || smaSlow == null || smaFast === smaSlow ? 0 : direction(smaFast > smaSlow),
      smaFast != null && smaSlow != null ? `SMA10 ${smaFast.toFixed(2)} / SMA30 ${smaSlow.toFixed(2)}` : "均线不足",
    ),
    vote(
      "ema",
      emaFast == null || emaSlow == null || emaFast === emaSlow ? 0 : direction(emaFast > emaSlow),
      emaFast != null && emaSlow != null ? `EMA12 ${emaFast.toFixed(2)} / EMA26 ${emaSlow.toFixed(2)}` : "均线不足",
    ),
    vote(
      "macd",
      histogram == null || Math.abs(histogram) < 1e-8 ? 0 : direction(histogram > 0),
      histogram == null ? "MACD 不足" : `柱状 ${histogram.toFixed(4)}`,
    ),
    vote(
      "donchian",
      donMid == null || close === donMid ? 0 : direction(close > donMid),
      donHigh != null && donLow != null ? `通道 ${donLow.toFixed(2)} – ${donHigh.toFixed(2)}` : "通道不足",
    ),
    vote(
      "roc",
      roc20 == null || Math.abs(roc20) < 1e-8 ? 0 : direction(roc20 > 0),
      roc20 == null ? "ROC 不足" : `20 期 ${(roc20 * 100).toFixed(2)}%`,
    ),
    vote(
      "rsi",
      rsi14 == null || (rsi14 >= 45 && rsi14 <= 55) ? 0 : direction(rsi14 > 55),
      rsi14 == null ? "RSI 不足" : `RSI ${rsi14.toFixed(1)}`,
    ),
    vote(
      "adx",
      adxUp ? 1 : adxDown ? -1 : 0,
      adxPoint?.adx == null ? "ADX 不足" : `ADX ${adxPoint.adx.toFixed(1)}`,
    ),
  ];

  const upVotes = votes.filter((item) => item.vote > 0).length;
  const downVotes = votes.filter((item) => item.vote < 0).length;
  const regime: DeskRegime = upVotes >= 5 ? "up" : downVotes >= 5 ? "down" : "range";
  const stretched = percentB != null && percentB >= 1;
  const compressed = percentB != null && percentB <= 0;
  const summary =
    regime === "up"
      ? `七项投票看多 ${upVotes}、看空 ${downVotes}，趋势向上。`
      : regime === "down"
        ? `七项投票看多 ${upVotes}、看空 ${downVotes}，趋势向下。`
        : `七项投票看多 ${upVotes}、看空 ${downVotes}，趋势不明确，等待。`;

  return {
    regime,
    stretched,
    compressed,
    votes,
    upVotes,
    downVotes,
    bollingerPercentB: percentB,
    summary,
  };
}
