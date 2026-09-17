import type { Metadata } from "next";
import { Suspense } from "react";
import { BacktestClient } from "@/app/backtest/backtest-client";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = { title: "回测" };

export default function BacktestPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-medium">回测</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          事件驱动引擎：收盘出信号、次日开盘成交，输出收益、夏普、回撤和成交明细。
        </p>
      </div>
      <Suspense fallback={<Skeleton className="h-[520px] w-full" />}>
        <BacktestClient />
      </Suspense>
    </div>
  );
}
