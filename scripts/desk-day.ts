import { replayDeskWindow, type DeskReplayBar, type DeskReplayResult } from "@/lib/desk/replay";
import { DEFAULT_CAPITAL, type DeskDecision } from "@/lib/desk/types";

const DAY_SEC = 24 * 60 * 60;
const MIN_WARMUP = 40;
const MIN_SPAN_SEC = 20 * 60 * 60;

type LoadedBars = {
  source: string;
  url: string;
  interval: string;
  bars: DeskReplayBar[];
};

type YahooChart = {
  chart?: {
    result?: Array<{
      timestamp?: number[];
      indicators?: {
        quote?: Array<{
          high?: Array<number | null>;
          low?: Array<number | null>;
          close?: Array<number | null>;
        }>;
      };
    }>;
    error?: { description?: string } | null;
  };
};

const YAHOO_ATTEMPTS: Array<{ host: string; interval: string; range: string }> = [
  { host: "query1.finance.yahoo.com", interval: "15m", range: "5d" },
  { host: "query2.finance.yahoo.com", interval: "15m", range: "5d" },
  { host: "query1.finance.yahoo.com", interval: "15m", range: "7d" },
  { host: "query2.finance.yahoo.com", interval: "1h", range: "10d" },
  { host: "query1.finance.yahoo.com", interval: "1h", range: "5d" },
];

async function main() {
  const loaded = await loadRealBars();
  const last = loaded.bars[loaded.bars.length - 1];
  if (!last || !(last.close > 1_000) || last.close > 10_000_000) {
    throw new Error("拿到的价格不像 BTC 真实行情，已停止，不会用假数据。");
  }

  const windowStart = last.time - DAY_SEC;
  const report = replayDeskWindow({
    bars: loaded.bars,
    windowStart,
    capital: DEFAULT_CAPITAL,
  });
  if (report.warmupBars < MIN_WARMUP) {
    throw new Error(`预热 K 线只有 ${report.warmupBars} 根，不足 ${MIN_WARMUP}，无法按交易台规则判断趋势。`);
  }
  if (report.windowEnd - report.windowStart < MIN_SPAN_SEC) {
    throw new Error("行情没有覆盖最近约 24 小时，已停止。");
  }

  console.log(formatReport(loaded, report));
}

async function loadRealBars(): Promise<LoadedBars> {
  const errors: string[] = [];
  for (const attempt of YAHOO_ATTEMPTS) {
    const url = yahooUrl(attempt);
    try {
      const bars = await fetchYahoo(url);
      if (bars.length > MIN_WARMUP) {
        return { source: "Yahoo Finance BTC-USD", url, interval: attempt.interval, bars };
      }
      errors.push(`${url} 只有 ${bars.length} 根 K 线`);
    } catch (error) {
      errors.push(`${url} ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  try {
    const fallback = await fetchCryptoCompare();
    if (fallback.bars.length > MIN_WARMUP) return fallback;
    errors.push(`${fallback.url} 只有 ${fallback.bars.length} 根 K 线`);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }

  throw new Error(`没有拿到真实 BTC K 线，已停止。\n${errors.join("\n")}`);
}

function yahooUrl(attempt: { host: string; interval: string; range: string }): string {
  const url = new URL(`https://${attempt.host}/v8/finance/chart/BTC-USD`);
  url.searchParams.set("interval", attempt.interval);
  url.searchParams.set("range", attempt.range);
  url.searchParams.set("includePrePost", "false");
  return url.toString();
}

async function fetchYahoo(url: string): Promise<DeskReplayBar[]> {
  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      Accept: "application/json,text/plain,*/*",
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const payload = (await response.json()) as YahooChart;
  if (payload.chart?.error) {
    throw new Error(payload.chart.error.description || "Yahoo 返回错误");
  }
  const result = payload.chart?.result?.[0];
  const timestamps = result?.timestamp;
  const quote = result?.indicators?.quote?.[0];
  if (!timestamps || !quote) throw new Error("Yahoo 没有返回 K 线");

  const bars: DeskReplayBar[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    const high = quote.high?.[i];
    const low = quote.low?.[i];
    const close = quote.close?.[i];
    const time = timestamps[i];
    if (
      time == null ||
      high == null ||
      low == null ||
      close == null ||
      !Number.isFinite(time) ||
      !Number.isFinite(high) ||
      !Number.isFinite(low) ||
      !Number.isFinite(close) ||
      !(close > 0)
    ) {
      continue;
    }
    bars.push({ time, high, low, close });
  }
  return bars;
}

async function fetchCryptoCompare(): Promise<LoadedBars> {
  const url = "https://min-api.cryptocompare.com/data/v2/histominute?fsym=BTC&tsym=USD&aggregate=15&limit=500";
  const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`CryptoCompare HTTP ${response.status}`);
  const payload = (await response.json()) as {
    Response?: string;
    Message?: string;
    Data?: { Data?: Array<{ time?: number; high?: number; low?: number; close?: number }> };
  };
  if (payload.Response === "Error") throw new Error(payload.Message || "CryptoCompare 返回错误");
  const rows = payload.Data?.Data ?? [];
  const bars: DeskReplayBar[] = [];
  for (const row of rows) {
    if (
      row.time == null ||
      row.high == null ||
      row.low == null ||
      row.close == null ||
      !(row.close > 0)
    ) {
      continue;
    }
    bars.push({ time: row.time, high: row.high, low: row.low, close: row.close });
  }
  return { source: "CryptoCompare BTC-USD", url, interval: "15m", bars };
}

function formatReport(loaded: LoadedBars, report: DeskReplayResult): string {
  const lines = [
    "Paper BTC desk, one-day replay (simulation only, not investment advice)",
    `source: ${loaded.source}`,
    `url: ${loaded.url}`,
    `interval: ${loaded.interval}`,
    `window_start_utc: ${iso(report.windowStart)}`,
    `window_end_utc: ${iso(report.windowEnd)}`,
    `bars_replayed: ${report.barsReplayed}`,
    `warmup_bars: ${report.warmupBars}`,
    `starting_equity_usdt: ${money(report.startingEquity)}`,
    `ending_equity_usdt: ${money(report.endingEquity)}`,
    `return_usdt: ${signed(report.returnUsdt)}`,
    `return_pct: ${pct(report.returnPct)}`,
    `entries: ${report.entries}`,
    `exits: ${report.exits}`,
    `ending_position: ${report.position}`,
    `max_drawdown_usdt: ${money(report.maxDrawdownUsdt)}`,
    `max_drawdown_pct: ${(report.maxDrawdownPct * 100).toFixed(2)}%`,
    `halted: ${report.halted ? "yes" : "no"}`,
    `regime_up: ${report.regimeCounts.up}`,
    `regime_down: ${report.regimeCounts.down}`,
    `regime_range: ${report.regimeCounts.range}`,
    `regime_unknown: ${report.regimeCounts.unknown}`,
    `stretched_bars: ${report.regimeCounts.stretched}`,
  ];

  if (report.position === "long" && report.openUnrealizedPnl != null) {
    lines.push(
      `open_entry_price: ${px(report.openEntryPrice ?? 0)}`,
      `open_quantity: ${qty(report.openQuantity ?? 0)}`,
      `open_unrealized_pnl_usdt: ${signed(report.openUnrealizedPnl)}`,
    );
  }

  const realized = report.trades.reduce((sum, trade) => sum + (trade.pnl ?? 0), 0);
  lines.push(`realized_pnl_usdt: ${signed(realized)}`);
  lines.push(`last_close: ${px(loaded.bars[loaded.bars.length - 1]?.close ?? 0)}`);
  const tail = trailingPrintNote(loaded);
  if (tail) lines.push(tail);

  lines.push("", report.trades.length ? "trades:" : "trades: none");
  report.trades.forEach((trade, index) => {
    const pnl = trade.pnl == null ? "pnl: n/a" : `pnl_usdt: ${signed(trade.pnl)}`;
    lines.push(
      `${index + 1}. ${iso(trade.time)} ${trade.side} price ${px(trade.price)} qty ${qty(trade.quantity)} ${pnl}`,
    );
    lines.push(`   reason: ${trade.reason}`);
  });

  lines.push("", "last_decision:");
  lines.push(formatDecision(report.lastDecision));
  if (report.haltReason) lines.push(`halt_reason: ${report.haltReason}`);
  lines.push(
    "",
    "Stops and take-profits are checked at each bar close, the same way stepDesk checks the latest price. Intrabar wicks are not fills.",
    "One day is noise. This is a paper account with 10,000 USDT, long or flat, 20% of equity, 2% stop, 4% take-profit, 5% daily halt. It does not show that the strategy makes money, and it is not investment advice. No exchange was called.",
  );
  return lines.join("\n");
}

function formatDecision(decision: DeskDecision | null): string {
  if (!decision) return "none";
  const up = decision.votes.filter((vote) => vote.vote > 0).length;
  const down = decision.votes.filter((vote) => vote.vote < 0).length;
  const lines = [
    `time: ${iso(decision.time)}`,
    `action: ${decision.action}`,
    `regime: ${decision.regime}`,
    `stretched: ${decision.stretched}`,
    `votes_up: ${up}`,
    `votes_down: ${down}`,
    `reason: ${decision.reason}`,
  ];
  for (const vote of decision.votes) {
    const side = vote.vote > 0 ? "up" : vote.vote < 0 ? "down" : "flat";
    lines.push(`  ${vote.label}: ${side} (${vote.detail})`);
  }
  return lines.join("\n");
}

function trailingPrintNote(loaded: LoadedBars): string | null {
  const bars = loaded.bars;
  if (bars.length < 2) return null;
  const gap = bars[bars.length - 1].time - bars[bars.length - 2].time;
  const expected = loaded.interval === "15m" ? 900 : loaded.interval === "1h" ? 3600 : null;
  if (expected == null || Math.abs(gap - expected) <= 5) return null;
  return `last_point: Yahoo latest print ${iso(bars[bars.length - 1].time)}, ${gap}s after the previous ${loaded.interval} bar. It is a real quote and is the final mark-to-market step.`;
}

function iso(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toISOString().replace(".000Z", "Z");
}

function money(value: number): string {
  return value.toFixed(2);
}

function signed(value: number): string {
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}`;
}

function pct(value: number): string {
  const body = `${(value * 100).toFixed(2)}%`;
  return value > 0 ? `+${body}` : body;
}

function px(value: number): string {
  return value.toFixed(2);
}

function qty(value: number): string {
  return value.toFixed(8);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
