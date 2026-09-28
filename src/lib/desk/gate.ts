import { HOLDOUT_DAYS, OKX_COSTS, holdReturn, liveGateDecision } from "@/lib/desk/costs";
import { ReplayError, replayDeskWindow, type DeskReplayBar } from "@/lib/desk/replay";
import { DEFAULT_CAPITAL } from "@/lib/desk/types";

const DAY = 86_400;

export type LiveGateReport = {
  confirmBars: 1 | 2;
  liveEligible: boolean;
  summary: string;
  selectionImmediatePct: number | null;
  selectionConfirmPct: number | null;
  holdoutReturnPct: number | null;
  hold20ReturnPct: number | null;
  hold100ReturnPct: number | null;
  maxDrawdownPct: number | null;
  reasons: string[];
};

/**
 * Pick the regime rule on the bars before the last 14 days, then score only that
 * rule on the last 14 days. Costs are OKX taker plus slippage. Sides are long and short.
 */
export function evaluateLiveGate(bars: DeskReplayBar[]): LiveGateReport {
  const sorted = uniqueBars(bars);
  if (sorted.length <= 40) return blocked("K 线不够，实盘门槛未通过。");
  const end = sorted[sorted.length - 1].time;
  const holdoutStart = end - HOLDOUT_DAYS * DAY;
  const tradableStart = sorted[39].time;
  if (holdoutStart <= tradableStart) return blocked("样本不足 14 天，实盘门槛未通过。");

  const selectionBars = sorted.filter((bar) => bar.time < holdoutStart);
  try {
    const immediate = replayDeskWindow({
      bars: selectionBars,
      windowStart: tradableStart,
      capital: DEFAULT_CAPITAL,
      sides: "both",
      confirmBars: 1,
      costs: OKX_COSTS,
    });
    const confirmed = replayDeskWindow({
      bars: selectionBars,
      windowStart: tradableStart,
      capital: DEFAULT_CAPITAL,
      sides: "both",
      confirmBars: 2,
      costs: OKX_COSTS,
    });
    const confirmBars: 1 | 2 = confirmed.endingEquity > immediate.endingEquity ? 2 : 1;
    const holdout = replayDeskWindow({
      bars: sorted,
      windowStart: holdoutStart,
      capital: DEFAULT_CAPITAL,
      sides: "both",
      confirmBars,
      costs: OKX_COSTS,
    });
    const startBar = sorted.find((bar) => bar.time >= holdoutStart) ?? sorted[sorted.length - 1];
    const endPrice = sorted[sorted.length - 1].close;
    const hold20 = holdReturn(startBar.close, endPrice, 0.2, OKX_COSTS);
    const hold100 = holdReturn(startBar.close, endPrice, 1, OKX_COSTS);
    const decision = liveGateDecision({
      returnPct: holdout.returnPct,
      hold20Pct: hold20,
      maxDrawdownPct: holdout.maxDrawdownPct,
    });
    const ruleText = confirmBars === 2 ? "连续两根确认" : "第一根反向就平";
    const summary = decision.liveEligible
      ? `最后 14 天过了实盘门槛。规则用${ruleText}。这不是收益承诺。`
      : `实盘门槛未通过。规则用${ruleText}。${decision.reasons.join("")}`;
    return {
      confirmBars,
      liveEligible: decision.liveEligible,
      summary,
      selectionImmediatePct: immediate.returnPct,
      selectionConfirmPct: confirmed.returnPct,
      holdoutReturnPct: holdout.returnPct,
      hold20ReturnPct: hold20,
      hold100ReturnPct: hold100,
      maxDrawdownPct: holdout.maxDrawdownPct,
      reasons: decision.reasons,
    };
  } catch (error) {
    if (error instanceof ReplayError) return blocked(error.message);
    throw error;
  }
}

function blocked(summary: string): LiveGateReport {
  return {
    confirmBars: 1,
    liveEligible: false,
    summary,
    selectionImmediatePct: null,
    selectionConfirmPct: null,
    holdoutReturnPct: null,
    hold20ReturnPct: null,
    hold100ReturnPct: null,
    maxDrawdownPct: null,
    reasons: [summary],
  };
}

function uniqueBars(bars: DeskReplayBar[]): DeskReplayBar[] {
  const sorted = [...bars].sort((a, b) => a.time - b.time);
  const out: DeskReplayBar[] = [];
  for (const bar of sorted) {
    const prev = out[out.length - 1];
    if (prev && prev.time === bar.time) out[out.length - 1] = bar;
    else out.push(bar);
  }
  return out;
}
