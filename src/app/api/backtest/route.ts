import { getOHLCV } from "@/lib/market/data";
import { isAllowedSymbol } from "@/lib/market/universe";
import { parseInterval, parseRange, normalizeSymbol } from "@/lib/market/query";
import { runBacktest } from "@/lib/quant/backtest";
import { STRATEGIES } from "@/lib/quant/strategies";
import type { BacktestConfig, StrategyId, StrategyParams } from "@/lib/quant/types";

type Body = {
  symbol?: string;
  range?: string;
  interval?: string;
  strategy?: StrategyId;
  params?: StrategyParams;
  initialCapital?: number;
  commission?: number;
  slippage?: number;
  allowShort?: boolean;
  allocation?: number;
};

export async function POST(request: Request) {
  const body = (await request.json()) as Body;
  const symbol = normalizeSymbol(body.symbol ?? "");
  if (!symbol || !isAllowedSymbol(symbol)) {
    return Response.json({ error: "无效代码" }, { status: 400 });
  }
  const strategy = STRATEGIES.find((item) => item.id === body.strategy);
  if (!strategy) {
    return Response.json({ error: "未知策略" }, { status: 400 });
  }
  const series = await getOHLCV(symbol, parseRange(body.range ?? null), parseInterval(body.interval ?? null));
  const config: BacktestConfig = {
    strategy: strategy.id,
    params: { ...strategy.defaults, ...(body.params ?? {}) },
    initialCapital: clamp(body.initialCapital ?? 100_000, 1_000, 10_000_000),
    commission: clamp(body.commission ?? 0.001, 0, 0.02),
    slippage: clamp(body.slippage ?? 0.0005, 0, 0.02),
    allowShort: Boolean(body.allowShort),
    allocation: clamp(body.allocation ?? 1, 0.1, 1),
  };
  const result = runBacktest(series.candles, config, {
    symbol: series.symbol,
    source: series.source,
  });
  return Response.json(result);
}

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}
