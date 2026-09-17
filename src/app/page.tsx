import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { QuoteTable } from "@/components/market/quote-table";
import { MetricCard } from "@/components/market/metric-card";
import { PriceChange } from "@/components/market/price-change";
import { getOHLCV, getQuotes } from "@/lib/market/data";
import { INDEX_SYMBOLS, WATCHLIST_SYMBOLS } from "@/lib/market/universe";
import { formatPercent, formatPrice } from "@/lib/format";
import { STRATEGIES } from "@/lib/quant/strategies";

export const revalidate = 60;

export default async function DashboardPage() {
  const symbols = [...INDEX_SYMBOLS, ...WATCHLIST_SYMBOLS];
  const [{ quotes, source }, sparkSeries] = await Promise.all([
    getQuotes(symbols),
    Promise.all(WATCHLIST_SYMBOLS.map((symbol) => getOHLCV(symbol, "3mo", "1d"))),
  ]);
  const quoteMap = new Map(quotes.map((quote) => [quote.symbol, quote]));
  const indices = INDEX_SYMBOLS.map((symbol) => quoteMap.get(symbol)).filter(Boolean);
  const watchlist = WATCHLIST_SYMBOLS.map((symbol) => quoteMap.get(symbol)).filter(
    (quote): quote is NonNullable<typeof quote> => Boolean(quote),
  );
  const sparklines = Object.fromEntries(
    sparkSeries.map((series) => [series.symbol, series.candles.slice(-40).map((c) => c.close)]),
  );
  const breadth =
    watchlist.length === 0
      ? 0
      : watchlist.filter((item) => item.changePercent > 0).length / watchlist.length;
  const leader = [...watchlist].sort((a, b) => b.changePercent - a.changePercent)[0];
  const laggard = [...watchlist].sort((a, b) => a.changePercent - b.changePercent)[0];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs tracking-[0.2em] text-muted-foreground">LH QUANT</p>
          <h1 className="text-2xl font-medium">盘面</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            把行情、策略与回测放在同一套研究工作流里。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline">{source === "yahoo" ? "Yahoo 实时" : "演示数据"}</Badge>
          <Button asChild>
            <Link href="/backtest">开始回测</Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        {indices.map((quote) =>
          quote ? (
            <Card key={quote.symbol} size="sm">
              <CardHeader className="pb-1">
                <CardTitle className="flex items-center justify-between text-sm">
                  <span className="font-mono">{quote.symbol}</span>
                  <PriceChange value={quote.changePercent} />
                </CardTitle>
                <CardDescription>{quote.name}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="font-mono text-2xl tabular-nums">{formatPrice(quote.price)}</div>
              </CardContent>
            </Card>
          ) : null,
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <MetricCard
          label="自选上涨占比"
          value={formatPercent(breadth, 0, false)}
          hint={`${watchlist.filter((q) => q.changePercent > 0).length} / ${watchlist.length}`}
        />
        <MetricCard
          label="领涨"
          value={leader ? leader.symbol : "—"}
          hint={leader ? formatPercent(leader.changePercent) : undefined}
          tone="up"
        />
        <MetricCard
          label="领跌"
          value={laggard ? laggard.symbol : "—"}
          hint={laggard ? formatPercent(laggard.changePercent) : undefined}
          tone="down"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>自选</CardTitle>
          <CardDescription>点击代码进入 K 线与指标。</CardDescription>
          <CardAction>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/markets">全部行情</Link>
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          <QuoteTable quotes={watchlist} sparklines={sparklines} />
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>策略库</CardTitle>
            <CardDescription>内置趋势、突破与均值回归模板。</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-2">
            {STRATEGIES.filter((item) => item.id !== "buy-hold").map((item) => (
              <Link
                key={item.id}
                href={`/backtest?strategy=${item.id}`}
                className="rounded-lg border px-3 py-2 transition-colors hover:bg-muted/50"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">{item.name}</span>
                  <Badge variant="outline">{item.category}</Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{item.summary}</p>
              </Link>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>研究路径</CardTitle>
            <CardDescription>从观察到交易的最短闭环。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm leading-6 text-muted-foreground">
            <p>1. 在行情页确认趋势、波动和成交量。</p>
            <p>2. 选一个策略模板，用两年日线回测夏普、回撤和超额收益。</p>
            <p>3. 信号合理后再到模拟组合里按现价纸上交易。</p>
            <div className="flex gap-2 pt-2">
              <Button variant="outline" asChild>
                <Link href="/strategies">浏览策略</Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href="/portfolio">模拟组合</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
