import { readRegime } from "@/lib/desk/regime";
import type { DeskCandle } from "@/lib/desk/types";
import type { Candle, DataSource } from "@/lib/quant/types";

export const DIRECTION_HORIZONS = ["session", "week"] as const;

export type DirectionHorizon = (typeof DIRECTION_HORIZONS)[number];

export const HORIZON_LABEL: Record<DirectionHorizon, string> = {
  session: "下一根日线",
  week: "大约五个交易日",
};

const HORIZON_TEXT: Record<DirectionHorizon, string> = {
  session: "the next daily session after the last bar in `tape`",
  week: "about the next five daily sessions after the last bar in `tape`",
};

export type DirectionTape = {
  symbol: string;
  name: string;
  source: DataSource;
  horizon: { id: DirectionHorizon; label: string; meaning: string };
  lastClose: number | null;
  change1dPct: number | null;
  change5dPct: number | null;
  change20dPct: number | null;
  regime: string;
  upVotes: number;
  downVotes: number;
  bollingerPercentB: number | null;
  stretched: boolean;
  compressed: boolean;
  votes: Array<{ label: string; vote: -1 | 0 | 1; detail: string }>;
  summary: string;
};

export function parseHorizon(value: string | undefined): DirectionHorizon {
  return value === "week" ? "week" : "session";
}

export function buildDirectionTape(input: {
  symbol: string;
  name: string;
  candles: Candle[];
  source: DataSource;
  horizon: DirectionHorizon;
}): DirectionTape {
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
    horizon: {
      id: input.horizon,
      label: HORIZON_LABEL[input.horizon],
      meaning: HORIZON_TEXT[input.horizon],
    },
    lastClose: round(closes.at(-1) ?? null, 2),
    change1dPct: round(changePct(closes, 1), 4),
    change5dPct: round(changePct(closes, 5), 4),
    change20dPct: round(changePct(closes, 20), 4),
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
