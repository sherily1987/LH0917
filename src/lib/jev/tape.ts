import { readRegime } from "@/lib/desk/regime";
import type { DeskCandle } from "@/lib/desk/types";
import type { Candle, DataSource } from "@/lib/quant/types";

export const DIRECTION_INTERVALS = ["1d", "1h", "15m"] as const;

export type DirectionInterval = (typeof DIRECTION_INTERVALS)[number];

export const INTERVAL_SPEC: Record<
  DirectionInterval,
  {
    label: string;
    meaning: string;
    range: string;
    yahooInterval: "1d" | "1h" | "15m";
    one: string;
    five: string;
    twenty: string;
  }
> = {
  "1d": {
    label: "日线",
    meaning: "the next daily bar after the last bar in `tape`",
    range: "6mo",
    yahooInterval: "1d",
    one: "1 日",
    five: "5 日",
    twenty: "20 日",
  },
  "1h": {
    label: "小时线",
    meaning: "the next one-hour bar after the last bar in `tape`",
    range: "60d",
    yahooInterval: "1h",
    one: "1 小时",
    five: "5 小时",
    twenty: "20 小时",
  },
  "15m": {
    label: "15 分钟线",
    meaning: "the next 15-minute bar after the last bar in `tape`",
    range: "60d",
    yahooInterval: "15m",
    one: "15 分钟",
    five: "75 分钟",
    twenty: "5 小时",
  },
};

export type DirectionTape = {
  symbol: string;
  name: string;
  source: DataSource;
  interval: { id: DirectionInterval; label: string };
  horizon: { meaning: string };
  lastClose: number | null;
  change1BarPct: number | null;
  change5BarPct: number | null;
  change20BarPct: number | null;
  returnLabels: { one: string; five: string; twenty: string };
  regime: string;
  upVotes: number;
  downVotes: number;
  bollingerPercentB: number | null;
  stretched: boolean;
  compressed: boolean;
  votes: Array<{ label: string; vote: -1 | 0 | 1; detail: string }>;
  summary: string;
};

export function buildDirectionTape(input: {
  symbol: string;
  name: string;
  candles: Candle[];
  source: DataSource;
  interval: DirectionInterval;
}): DirectionTape {
  const spec = INTERVAL_SPEC[input.interval];
  const closes = input.candles.map((candle) => candle.close);
  const deskCandles: DeskCandle[] = input.candles.map((candle) => ({
    time: candle.time,
    high: candle.high,
    low: candle.low,
    close: candle.close,
  }));
  const reading = readRegime(deskCandles);
  return {
    symbol: input.symbol,
    name: input.name,
    source: input.source,
    interval: { id: input.interval, label: spec.label },
    horizon: { meaning: spec.meaning },
    lastClose: round(closes.at(-1) ?? null, 2),
    change1BarPct: round(changePct(closes, 1), 4),
    change5BarPct: round(changePct(closes, 5), 4),
    change20BarPct: round(changePct(closes, 20), 4),
    returnLabels: { one: spec.one, five: spec.five, twenty: spec.twenty },
    regime: reading.regime,
    upVotes: reading.upVotes,
    downVotes: reading.downVotes,
    bollingerPercentB: round(reading.bollingerPercentB, 3),
    stretched: reading.stretched,
    compressed: reading.compressed,
    votes: reading.votes.map((vote) => ({
      label: vote.label,
      vote: vote.vote,
      detail: vote.detail,
    })),
    summary: reading.summary,
  };
}

function changePct(closes: number[], barsAgo: number): number | null {
  const last = closes.at(-1);
  const prior = closes.at(-1 - barsAgo);
  if (last == null || prior == null || !(prior > 0)) return null;
  return (last - prior) / prior;
}

function round(value: number | null, digits: number): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}
