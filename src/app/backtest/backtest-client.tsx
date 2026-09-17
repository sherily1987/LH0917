"use client";

import { useSearchParams } from "next/navigation";
import { BacktestWorkbench } from "@/components/backtest/backtest-workbench";
import { STRATEGIES } from "@/lib/quant/strategies";
import type { StrategyId } from "@/lib/quant/types";

export function BacktestClient() {
  const searchParams = useSearchParams();
  const symbol = searchParams.get("symbol") ?? undefined;
  const rawStrategy = searchParams.get("strategy");
  const strategy = STRATEGIES.some((item) => item.id === rawStrategy)
    ? (rawStrategy as StrategyId)
    : undefined;
  return <BacktestWorkbench initialSymbol={symbol} initialStrategy={strategy} />;
}
