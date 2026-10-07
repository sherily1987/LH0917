import type { BotMode } from "@/lib/bot/config";

export type Holding = { symbol: string; quantity: number; avgPrice: number };

export type Account = {
  mode: BotMode;
  cash: number;
  holdings: Holding[];
  peakEquity: number;
  day: { date: string; openEquity: number };
};

export type MarketFeatures = {
  symbol: string;
  price: number;
  return1d: number;
  return7d: number;
  return30d: number;
  rsi14: number | null;
  distSma20: number | null;
  distSma50: number | null;
  volatility20d: number | null;
  distHigh30d: number;
  distLow30d: number;
  volumeRatio: number | null;
};

export type Snapshot = {
  source: "yahoo" | "exchange" | "synthetic";
  markets: MarketFeatures[];
};

export type AiOrder = {
  symbol: string;
  side: "buy" | "sell";
  /** Buys: fraction of total equity to spend. Sells: fraction of the current holding to sell. */
  size: number;
  confidence: number;
  reason: string;
};

export type AiDecision = {
  marketView: string;
  orders: AiOrder[];
};

export type PlannedOrder = {
  symbol: string;
  side: "buy" | "sell";
  quantity: number;
  price: number;
  notional: number;
  reason: string;
  confidence: number;
};

export type RejectedOrder = { order: AiOrder; why: string };

export type Fill = {
  id: string;
  symbol: string;
  side: "buy" | "sell";
  quantity: number;
  price: number;
  fee: number;
  status: "filled" | "failed";
  error?: string;
};

export type BotRun = {
  id: string;
  time: number;
  mode: BotMode;
  model: string;
  status: "ok" | "skipped" | "error";
  message?: string;
  dataSource?: Snapshot["source"];
  equityBefore?: number;
  equityAfter?: number;
  marketView?: string;
  decided: AiOrder[];
  rejected: RejectedOrder[];
  fills: Fill[];
};

export type BotState = {
  account: Account | null;
  runs: BotRun[];
};
