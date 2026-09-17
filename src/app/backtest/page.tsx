import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DrawdownChart } from "@/components/charts/drawdown-chart";
import { EquityChart } from "@/components/charts/equity-chart";
import { MetricCard } from "@/components/market/metric-card";
import { PriceChange } from "@/components/market/price-change";
import { getOHLCV } from "@/lib/market/data";
import { RANGES } from "@/lib/market/query";
import { UNIVERSE, isAllowedSymbol } from "@/lib/market/universe";
import { formatDate, formatNumber, formatPercent, formatPrice } from "@/lib/format";
import { runBacktest } from "@/lib/quant/backtest";
import { STRATEGIES, getStrategy } from "@/lib/quant/strategies";
import type { BacktestResult, StrategyId, StrategyParams } from "@/lib/quant/types";

export const metadata: Metadata = { title: "回测" };

const RANGE_LABEL: Record<(typeof RANGES)[number], string> = {
  "1mo": "1 个月",
  "3mo": "3 个月",
  "6mo": "6 个月",
  "1y": "1 年",
  "2y": "2 年",
  "5y": "5 年",
};

function first(value: string | string[] | undefined, fallback: string) {
  if (Array.isArray(value)) return value[0] ?? fallback;
  return value && value.length > 0 ? value : fallback;
}

function num(value: string, fallback: number) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export default async function BacktestPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const symbol = first(sp.symbol, "AAPL").toUpperCase();
  const range = first(sp.range, "2y");
  const strategyId = first(sp.strategy, "sma-cross") as StrategyId;
  const run = first(sp.run, "") === "1";
  const strategyMeta = STRATEGIES.some((item) => item.id === strategyId)
    ? getStrategy(strategyId)
    : getStrategy("sma-cross");
  const params: StrategyParams = { ...strategyMeta.defaults };
  for (const field of strategyMeta.fields) {
    const raw = first(sp[field.key], String(strategyMeta.defaults[field.key] ?? ""));
    params[field.key] = field.options ? raw : num(raw, Number(strategyMeta.defaults[field.key] ?? 0));
  }
  const capital = num(first(sp.capital, "100000"), 100000);
  const commission = num(first(sp.commission, "0.001"), 0.001);
  const slippage = num(first(sp.slippage, "0.0005"), 0.0005);
  const allowShort = first(sp.allowShort, "") === "1";

  let result: BacktestResult | null = null;
  let error: string | null = null;
  if (run) {
    if (!isAllowedSymbol(symbol) || !(RANGES as readonly string[]).includes(range)) {
      error = "标的或区间无效";
    } else {
      try {
        const series = await getOHLCV(symbol, range, "1d");
        result = runBacktest(
          series.candles,
          {
            strategy: strategyMeta.id,
            params,
            initialCapital: capital,
            commission,
            slippage,
            allowShort,
            allocation: 1,
          },
          { symbol: series.symbol, source: series.source },
        );
      } catch {
        error = "回测失败，请稍后重试";
      }
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-medium">回测</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          事件驱动引擎：收盘出信号、次日开盘成交，输出收益、夏普、回撤和成交明细。
        </p>
      </div>
      <div className="grid gap-6 xl:grid-cols-[320px_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>参数</CardTitle>
            <CardDescription>下一根 K 线开盘成交，已计入手续费与滑点。</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" action="/backtest" method="get">
              <input type="hidden" name="run" value="1" />
              <Field label="标的">
                <NativeSelect name="symbol" defaultValue={isAllowedSymbol(symbol) ? symbol : "AAPL"}>
                  {UNIVERSE.map((item) => (
                    <option key={item.symbol} value={item.symbol}>
                      {item.symbol} · {item.nameZh}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="区间">
                <NativeSelect name="range" defaultValue={(RANGES as readonly string[]).includes(range) ? range : "2y"}>
                  {RANGES.map((item) => (
                    <option key={item} value={item}>
                      {RANGE_LABEL[item]}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="策略">
                <NativeSelect name="strategy" defaultValue={strategyMeta.id}>
                  {STRATEGIES.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <p className="text-xs leading-5 text-muted-foreground">{strategyMeta.description}</p>
              {strategyMeta.fields.map((field) =>
                field.options ? (
                  <Field key={field.key} label={field.label}>
                    <NativeSelect name={field.key} defaultValue={String(params[field.key])}>
                      {field.options.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </NativeSelect>
                  </Field>
                ) : (
                  <Field key={field.key} label={field.label}>
                    <Input
                      type="number"
                      name={field.key}
                      defaultValue={String(params[field.key])}
                      min={field.min}
                      max={field.max}
                      step={field.step}
                    />
                  </Field>
                ),
              )}
              <Field label="初始资金">
                <Input type="number" name="capital" min={1000} step={1000} defaultValue={capital} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="手续费">
                  <Input type="number" name="commission" step="0.0001" defaultValue={commission} />
                </Field>
                <Field label="滑点">
                  <Input type="number" name="slippage" step="0.0001" defaultValue={slippage} />
                </Field>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="allowShort"
                  value="1"
                  defaultChecked={allowShort}
                  className="size-4 accent-primary"
                />
                允许做空
              </label>
              <Button type="submit" className="w-full">
                运行回测
              </Button>
            </form>
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
                  选择标的和策略后点击运行。结果会与买入持有曲线对照。
                </CardDescription>
              </CardHeader>
            </Card>
          ) : (
            <BacktestResults result={result} />
          )}
        </div>
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

function BacktestResults({ result }: { result: BacktestResult }) {
  return (
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
                {result.trades
                  .slice(-40)
                  .reverse()
                  .map((trade, index) => (
                    <TableRow key={`${trade.entryTime}-${index}`}>
                      <TableCell>{trade.side === "long" ? "多" : "空"}</TableCell>
                      <TableCell className="font-mono">{formatDate(trade.entryTime)}</TableCell>
                      <TableCell className="font-mono">{formatDate(trade.exitTime)}</TableCell>
                      <TableCell className="text-right font-mono">{formatPrice(trade.entryPrice)}</TableCell>
                      <TableCell className="text-right font-mono">{formatPrice(trade.exitPrice)}</TableCell>
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
  );
}
