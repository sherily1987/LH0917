import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CandleChart } from "@/components/charts/candle-chart";
import { MetricCard } from "@/components/market/metric-card";
import { formatCompact, formatPercent, formatPrice } from "@/lib/format";
import { getOHLCV } from "@/lib/market/data";
import { ASSET_CLASS_LABEL, UNIVERSE, getInstrument, isAllowedSymbol } from "@/lib/market/universe";
import { sma } from "@/lib/quant/indicators";

export const revalidate = 60;

export function generateStaticParams() {
  return UNIVERSE.map((item) => ({ symbol: item.symbol }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ symbol: string }>;
}) {
  const { symbol } = await params;
  const instrument = getInstrument(symbol);
  return { title: `${instrument.symbol} ${instrument.nameZh}` };
}

export default async function MarketDetailPage({
  params,
}: {
  params: Promise<{ symbol: string }>;
}) {
  const { symbol: raw } = await params;
  const symbol = decodeURIComponent(raw).toUpperCase();
  if (!isAllowedSymbol(symbol)) notFound();

  const series = await getOHLCV(symbol, "1y", "1d");
  const instrument = getInstrument(symbol);
  const closes = series.candles.map((c) => c.close);
  const sma20 = sma(closes, 20);
  const sma60 = sma(closes, 60);
  const quote = series.quote;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-mono text-2xl">{instrument.symbol}</h1>
            <Badge variant="outline">{ASSET_CLASS_LABEL[instrument.assetClass]}</Badge>
            <Badge variant="secondary">{series.source === "yahoo" ? "实时" : "演示"}</Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {instrument.nameZh} · {instrument.name} · {instrument.sector}
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild>
            <Link href={`/backtest?symbol=${encodeURIComponent(instrument.symbol)}`}>回测该标的</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/portfolio">加入模拟组合</Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="最新价"
          value={formatPrice(quote.price, quote.currency)}
          hint={`开盘 ${formatPrice(quote.open, quote.currency)}`}
        />
        <MetricCard
          label="涨跌幅"
          value={formatPercent(quote.changePercent)}
          tone={quote.changePercent >= 0 ? "up" : "down"}
          hint={`涨跌 ${formatPrice(quote.change, quote.currency)}`}
        />
        <MetricCard
          label="日内高低"
          value={`${formatPrice(quote.low, quote.currency)} – ${formatPrice(quote.high, quote.currency)}`}
        />
        <MetricCard label="成交量" value={formatCompact(quote.volume)} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>日线</CardTitle>
          <CardDescription>绿涨红跌，叠加 20 / 60 日均线。</CardDescription>
        </CardHeader>
        <CardContent>
          <CandleChart
            candles={series.candles}
            overlays={[
              { id: "sma20", color: "#60a5fa", values: sma20 },
              { id: "sma60", color: "#fbbf24", values: sma60 },
            ]}
          />
        </CardContent>
      </Card>

      <div className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">快速策略：</span>
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/backtest?symbol=${instrument.symbol}&strategy=sma-cross`}>双均线</Link>
        </Button>
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/backtest?symbol=${instrument.symbol}&strategy=rsi-reversion`}>RSI</Link>
        </Button>
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/backtest?symbol=${instrument.symbol}&strategy=donchian`}>唐奇安</Link>
        </Button>
      </div>
    </div>
  );
}
