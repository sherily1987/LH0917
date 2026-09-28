import { evaluateLiveGate, type LiveGateReport } from "@/lib/desk/gate";
import { deskExecutionMode, readOkxEnv, type OkxEnv } from "@/lib/desk/okx";
import type { DeskReplayBar } from "@/lib/desk/replay";

export type DeskStatus = LiveGateReport & {
  mode: "paper" | "okx-demo" | "okx-live";
};

const TTL_MS = 15 * 60 * 1000;
let cache: { at: number; gate: LiveGateReport } | null = null;

export async function getDeskStatus(env: OkxEnv = readOkxEnv(process.env), now = Date.now()): Promise<DeskStatus> {
  const mode = deskExecutionMode(env);
  if (cache && now - cache.at < TTL_MS) return { mode, ...cache.gate };
  try {
    const bars = await fetchYahoo15m();
    const gate = evaluateLiveGate(bars);
    cache = { at: now, gate };
    return { mode, ...gate };
  } catch {
    return {
      mode,
      confirmBars: 1,
      liveEligible: false,
      summary: "拿不到最近行情，实盘门槛未通过，不会向 OKX 发单。",
      selectionImmediatePct: null,
      selectionConfirmPct: null,
      holdoutReturnPct: null,
      hold20ReturnPct: null,
      hold100ReturnPct: null,
      maxDrawdownPct: null,
      reasons: ["拿不到最近行情。"],
    };
  }
}

export function resetDeskStatusCache(): void {
  cache = null;
}

async function fetchYahoo15m(): Promise<DeskReplayBar[]> {
  const url = "https://query1.finance.yahoo.com/v8/finance/chart/BTC-USD?interval=15m&range=60d&includePrePost=false";
  const response = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "lh-quant" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const payload = (await response.json()) as {
    chart?: {
      result?: Array<{
        timestamp?: number[];
        indicators?: { quote?: Array<{ high?: Array<number | null>; low?: Array<number | null>; close?: Array<number | null> }> };
      }>;
    };
  };
  const result = payload.chart?.result?.[0];
  const timestamps = result?.timestamp ?? [];
  const quote = result?.indicators?.quote?.[0];
  const bars: DeskReplayBar[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    const high = quote?.high?.[i];
    const low = quote?.low?.[i];
    const close = quote?.close?.[i];
    const time = timestamps[i];
    if (time == null || high == null || low == null || close == null || !(close > 0)) continue;
    bars.push({ time, high, low, close });
  }
  if (bars.length < 41) throw new Error("K 线不足");
  return bars;
}
