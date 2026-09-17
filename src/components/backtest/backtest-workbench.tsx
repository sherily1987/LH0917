"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { DrawdownChart } from "@/components/charts/drawdown-chart";
import { EquityChart } from "@/components/charts/equity-chart";
import { MetricCard } from "@/components/market/metric-card";
import { PriceChange } from "@/components/market/price-change";
import { RANGES } from "@/lib/market/query";
import { UNIVERSE } from "@/lib/market/universe";
import { formatDate, formatNumber, formatPercent, formatPrice } from "@/lib/format";
import { runBacktest } from "@/lib/quant/backtest";
import { STRATEGIES, getStrategy } from "@/lib/quant/strategies";
import type {
  BacktestResult,
  Candle,
  DataSource,
  StrategyId,
  StrategyParams,
} from "@/lib/quant/types";

const RANGE_LABEL: Record<(typeof RANGES)[number], string> = {
  "1mo": "1 个月",
  "3mo": "3 个月",
  "6mo": "6 个月",
  "1y": "1 年",
  "2y": "2 年",
  "5y": "5 年",
};

type SeriesPayload = {
  symbol: string;
  candles: Candle[];
  source: DataSource;
};

export function BacktestWorkbench({
  initialSymbol,
  initialStrategy,
}: {
  initialSymbol?: string;
  initialStrategy?: StrategyId;
}) {
  const [symbol, setSymbol] = useState(initialSymbol ?? "AAPL");
  const [strategy, setStrategy] = useState<StrategyId>(initialStrategy ?? "sma-cross");
  const [range, setRange] = useState<(typeof RANGES)[number]>("2y");
  const [params, setParams] = useState<StrategyParams>(
    getStrategy(initialStrategy ?? "sma-cross").defaults,
  );
  const [capital, setCapital] = useState(100000);
  const [commission, setCommission] = useState(0.001);
  const [slippage, setSlippage] = useState(0.0005);
  const [allowShort, setAllowShort] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BacktestResult | null>(null);

  const meta = useMemo(() => getStrategy(strategy), [strategy]);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/ohlcv?symbol=${encodeURIComponent(symbol)}&range=${range}&interval=1d`,
      );
      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        throw new Error(payload.error ?? "行情获取失败");
      }
      const series = (await response.json()) as SeriesPayload;
      const next = runBacktest(
        series.candles,
        {
          strategy,
          params,
          initialCapital: capital,
          commission,
          slippage,
          allowShort,
          allocation: 1,
        },
        { symbol: series.symbol, source: series.source },
      );
      setResult(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "回测失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[320px_1fr]">
      <Card>
        <CardHeader>
          <CardTitle>参数</CardTitle>
          <CardDescription>下一根 K 线开盘成交，已计入手续费与滑点。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field label="标的">
            <Select
              value={symbol}
              onValueChange={(value) => {
                if (value) setSymbol(value);
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {UNIVERSE.map((item) => (
                  <SelectItem key={item.symbol} value={item.symbol}>
                    {item.symbol} · {item.nameZh}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="区间">
            <Select
              value={range}
              onValueChange={(value) => {
                if (value && RANGES.includes(value as (typeof RANGES)[number])) {
                  setRange(value as (typeof RANGES)[number]);
                }
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RANGES.map((item) => (
                  <SelectItem key={item} value={item}>
                    {RANGE_LABEL[item]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="策略">
            <Select
              value={strategy}
              onValueChange={(value) => {
                const id = value as StrategyId;
                setStrategy(id);
                setParams(getStrategy(id).defaults);
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STRATEGIES.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <p className="text-xs leading-5 text-muted-foreground">{meta.description}</p>
          {meta.fields.map((field) =>
            field.options ? (
              <Field key={field.key} label={field.label}>
                <Select
                  value={String(params[field.key] ?? field.options[0].value)}
                  onValueChange={(value) =>
                    setParams((current) => ({ ...current, [field.key]: value ?? "" }))
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {field.options.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            ) : (
              <Field key={field.key} label={field.label}>
                <Input
                  type="number"
                  value={String(params[field.key] ?? "")}
                  min={field.min}
                  max={field.max}
                  step={field.step}
                  onChange={(e) =>
                    setParams((current) => ({
                      ...current,
                      [field.key]: e.target.value === "" ? "" : Number(e.target.value),
                    }))
                  }
                />
              </Field>
            ),
          )}
          <Field label="初始资金">
            <Input
              type="number"
              value={capital}
              min={1000}
              step={1000}
              onChange={(e) => setCapital(Number(e.target.value))}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="手续费">
              <Input
                type="number"
                step="0.0001"
                value={commission}
                onChange={(e) => setCommission(Number(e.target.value))}
              />
            </Field>
            <Field label="滑点">
              <Input
                type="number"
                step="0.0001"
                value={slippage}
                onChange={(e) => setSlippage(Number(e.target.value))}
              />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={allowShort}
              onChange={(e) => setAllowShort(e.target.checked)}
              className="size-4 accent-primary"
            />
            允许做空
          </label>
          <Button className="w-full" onClick={() => void run()} disabled={busy}>
            {busy ? "回测中…" : "运行回测"}
          </Button>
        </CardContent>
      </Card>

      <div className="space-y-4">
        {error ? (
          <Alert variant="destructive">
            <AlertTitle>无法完成回测</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        {!result ? (
          <Card>
            <CardHeader>
              <CardTitle>等待运行</CardTitle>
              <CardDescription>
                选择标的和策略后，系统会拉取日线并在浏览器中完成回测。结果可与买入持有曲线对照。
              </CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-medium">
                {result.symbol} · {getStrategy(result.strategy).name}
              </h2>
              <Badge variant="outline">{result.source === "yahoo" ? "实时行情" : "演示数据"}</Badge>
              <Badge variant="secondary">{result.candlesUsed} 根 K 线</Badge>
              <Button variant="ghost" size="sm" asChild>
                <Link href={`/markets/${encodeURIComponent(result.symbol)}`}>查看行情</Link>
              </Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                label="策略收益"
                value={formatPercent(result.metrics.totalReturn)}
                tone={result.metrics.totalReturn >= 0 ? "up" : "down"}
                hint={`CAGR ${formatPercent(result.metrics.cagr)}`}
              />
              <MetricCard
                label="相对买入持有"
                value={formatPercent(result.metrics.alpha)}
                tone={result.metrics.alpha >= 0 ? "up" : "down"}
                hint={`基准 ${formatPercent(result.metrics.benchmarkReturn)}`}
              />
              <MetricCard
                label="夏普比率"
                value={formatNumber(result.metrics.sharpe, 2)}
                hint={`波动 ${formatPercent(result.metrics.volatility, 1, false)}`}
              />
              <MetricCard
                label="最大回撤"
                value={formatPercent(result.metrics.maxDrawdown)}
                tone="down"
                hint={`卡玛 ${formatNumber(result.metrics.calmar, 2)}`}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard label="胜率" value={formatPercent(result.metrics.winRate, 1, false)} />
              <MetricCard label="盈亏比" value={formatNumber(result.metrics.profitFactor, 2)} />
              <MetricCard label="交易次数" value={String(result.metrics.trades)} />
              <MetricCard
                label="仓位暴露"
                value={formatPercent(result.metrics.exposure, 0, false)}
                hint={`终值 ${formatPrice(result.metrics.endEquity)}`}
              />
            </div>
            <Card>
              <CardHeader>
                <CardTitle>净值曲线</CardTitle>
                <CardDescription>绿色为策略，灰色虚线为同期买入持有。</CardDescription>
              </CardHeader>
              <CardContent>
                <EquityChart equity={result.equity} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>回撤</CardTitle>
              </CardHeader>
              <CardContent>
                <DrawdownChart equity={result.equity} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>成交明细</CardTitle>
              </CardHeader>
              <CardContent>
                {result.trades.length === 0 ? (
                  <p className="text-sm text-muted-foreground">该参数组合没有产生交易。</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>方向</TableHead>
                        <TableHead>开仓</TableHead>
                        <TableHead>平仓</TableHead>
                        <TableHead className="text-right">开仓价</TableHead>
                        <TableHead className="text-right">平仓价</TableHead>
                        <TableHead className="text-right">盈亏</TableHead>
                        <TableHead className="text-right">持有</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {result.trades.slice(-40).reverse().map((trade, index) => (
                        <TableRow key={`${trade.entryTime}-${index}`}>
                          <TableCell>{trade.side === "long" ? "多" : "空"}</TableCell>
                          <TableCell className="font-mono">{formatDate(trade.entryTime)}</TableCell>
                          <TableCell className="font-mono">{formatDate(trade.exitTime)}</TableCell>
                          <TableCell className="text-right font-mono">
                            {formatPrice(trade.entryPrice)}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {formatPrice(trade.exitPrice)}
                          </TableCell>
                          <TableCell className="text-right">
                            <span className="mr-2 font-mono">{formatPrice(trade.pnl)}</span>
                            <PriceChange value={trade.pnlPercent} />
                          </TableCell>
                          <TableCell className="text-right font-mono">{trade.barsHeld}d</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
