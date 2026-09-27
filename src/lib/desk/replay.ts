import { markEquity, roundCash, createLedger } from "@/lib/desk/ledger";
import { stepDesk } from "@/lib/desk/step";
import {
  DEFAULT_CAPITAL,
  DEFAULT_RISK,
  DESK_SYMBOL,
  type DeskCandle,
  type DeskDecision,
  type DeskRisk,
  type DeskSides,
  type DeskTrade,
} from "@/lib/desk/types";

export type DeskReplayBar = {
  time: number;
  high: number;
  low: number;
  close: number;
};

export type DeskReplayTrade = {
  time: number;
  side: "buy" | "sell";
  positionSide: "long" | "short";
  effect: "open" | "close";
  quantity: number;
  price: number;
  reason: string;
  pnl: number | null;
};

export type DeskReplayResult = {
  /** First replayed bar. Indicators use earlier bars, but those bars are not traded. */
  windowStart: number;
  windowEnd: number;
  barsReplayed: number;
  warmupBars: number;
  startingEquity: number;
  endingEquity: number;
  returnUsdt: number;
  returnPct: number;
  entries: number;
  exits: number;
  longEntries: number;
  shortEntries: number;
  wins: number;
  losses: number;
  scratches: number;
  position: "long" | "short" | "flat";
  openQuantity: number | null;
  openEntryPrice: number | null;
  openUnrealizedPnl: number | null;
  trades: DeskReplayTrade[];
  maxDrawdownUsdt: number;
  maxDrawdownPct: number;
  sides: DeskSides;
  halted: boolean;
  haltReason: string | null;
  lastDecision: DeskDecision | null;
  regimeCounts: { up: number; down: number; range: number; unknown: number; stretched: number };
};

export class ReplayError extends Error {}

/**
 * Replay the paper desk over bars at or after `windowStart`.
 * Each step receives the current bar inside the candle list. `stepDesk` would
 * otherwise fold a print into the previous candle whenever the gap is under one
 * day, which is correct for daily bars plus a live quote and wrong for 15m bars.
 *
 * `sides` defaults to long-only. "both" also opens shorts. A close still returns
 * inside `stepDesk` before any new order, so a flip does not reverse on the same bar.
 */
export function replayDeskWindow(input: {
  bars: DeskReplayBar[];
  windowStart: number;
  capital?: number;
  risk?: Partial<DeskRisk>;
  sides?: DeskSides;
}): DeskReplayResult {
  if (!Number.isFinite(input.windowStart) || input.windowStart <= 0) {
    throw new ReplayError("回放窗口起点无效。");
  }
  const candles = normalizeBars(input.bars);
  const startIndex = candles.findIndex((bar) => bar.time >= input.windowStart);
  if (startIndex < 0) throw new ReplayError("窗口内没有 K 线。");

  const capital = input.capital ?? DEFAULT_CAPITAL;
  const sides: DeskSides = input.sides === "both" ? "both" : "long";
  const first = candles[startIndex];
  const last = candles[candles.length - 1];
  let ledger = createLedger(capital, first.time);
  const startingEquity = ledger.cash;
  const equities = [startingEquity];
  const regimeCounts = { up: 0, down: 0, range: 0, unknown: 0, stretched: 0 };
  const trades: DeskReplayTrade[] = [];
  const seen = new Set<string>();

  for (let i = startIndex; i < candles.length; i++) {
    const bar = candles[i];
    const result = stepDesk({
      ledger,
      market: {
        symbol: DESK_SYMBOL,
        price: bar.close,
        time: bar.time,
        candles: candles.slice(0, i + 1),
      },
      risk: input.risk ?? DEFAULT_RISK,
      command: "step",
      capital: startingEquity,
      agentRunning: true,
      sides,
    });
    ledger = result.ledger;
    equities.push(markEquity(ledger, bar.close));
    regimeCounts[result.decision.regime] += 1;
    if (result.decision.stretched) regimeCounts.stretched += 1;
    for (const trade of result.ledger.trades) {
      if (seen.has(trade.id) || trade.time < first.time) continue;
      seen.add(trade.id);
      trades.push(toReplayTrade(trade));
    }
  }

  const endingEquity = equities[equities.length - 1] ?? startingEquity;
  const entries = trades.filter((trade) => trade.effect === "open").length;
  const exits = trades.filter((trade) => trade.effect === "close").length;
  const longEntries = trades.filter((trade) => trade.effect === "open" && trade.positionSide === "long").length;
  const shortEntries = trades.filter((trade) => trade.effect === "open" && trade.positionSide === "short").length;
  const wins = trades.filter((trade) => trade.effect === "close" && (trade.pnl ?? 0) > 0).length;
  const losses = trades.filter((trade) => trade.effect === "close" && (trade.pnl ?? 0) < 0).length;
  const scratches = trades.filter((trade) => trade.effect === "close" && (trade.pnl ?? 0) === 0).length;
  const drawdown = maxDrawdown(equities);
  const position = ledger.position;
  const unrealized = unrealizedPnl(position, last.close);

  return {
    windowStart: first.time,
    windowEnd: last.time,
    barsReplayed: candles.length - startIndex,
    warmupBars: startIndex,
    startingEquity,
    endingEquity,
    returnUsdt: roundCash(endingEquity - startingEquity),
    returnPct: startingEquity === 0 ? 0 : (endingEquity - startingEquity) / startingEquity,
    entries,
    exits,
    longEntries,
    shortEntries,
    wins,
    losses,
    scratches,
    position: position?.side ?? "flat",
    openQuantity: position?.quantity ?? null,
    openEntryPrice: position?.entryPrice ?? null,
    openUnrealizedPnl: unrealized,
    trades,
    maxDrawdownUsdt: drawdown.usdt,
    maxDrawdownPct: drawdown.pct,
    sides,
    halted: ledger.halted,
    haltReason: ledger.haltReason,
    lastDecision: ledger.lastDecision,
    regimeCounts,
  };
}

function unrealizedPnl(
  position: { side: "long" | "short"; quantity: number; entryPrice: number } | null,
  price: number,
): number | null {
  if (!position) return null;
  const raw =
    position.side === "short"
      ? (position.entryPrice - price) * position.quantity
      : (price - position.entryPrice) * position.quantity;
  return roundCash(raw);
}

function toReplayTrade(trade: DeskTrade): DeskReplayTrade {
  return {
    time: trade.time,
    side: trade.side,
    positionSide: trade.positionSide,
    effect: trade.pnl == null ? "open" : "close",
    quantity: trade.quantity,
    price: trade.price,
    reason: trade.reason,
    pnl: trade.pnl,
  };
}

function normalizeBars(bars: DeskReplayBar[]): DeskCandle[] {
  if (!Array.isArray(bars) || bars.length === 0) throw new ReplayError("没有 K 线。");
  const sorted = [...bars].sort((a, b) => a.time - b.time);
  const out: DeskCandle[] = [];
  for (const bar of sorted) {
    if (!Number.isFinite(bar.time) || bar.time <= 0) throw new ReplayError("K 线时间无效。");
    if (!Number.isFinite(bar.high) || !Number.isFinite(bar.low) || !Number.isFinite(bar.close) || !(bar.close > 0)) {
      throw new ReplayError("K 线价格无效。");
    }
    const candle: DeskCandle = {
      time: bar.time,
      high: Math.max(bar.high, bar.low, bar.close),
      low: Math.min(bar.high, bar.low, bar.close),
      close: bar.close,
    };
    const prev = out[out.length - 1];
    if (prev && prev.time === candle.time) out[out.length - 1] = candle;
    else out.push(candle);
  }
  return out;
}

function maxDrawdown(equities: number[]): { usdt: number; pct: number } {
  let peak = equities[0] ?? 0;
  let usdt = 0;
  let pct = 0;
  for (const equity of equities) {
    if (equity > peak) peak = equity;
    const drop = peak - equity;
    if (drop > usdt) usdt = drop;
    const dropPct = peak > 0 ? drop / peak : 0;
    if (dropPct > pct) pct = dropPct;
  }
  return { usdt: roundCash(usdt), pct };
}
