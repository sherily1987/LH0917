import type { Metadata } from "next";
import Link from "next/link";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MetricCard } from "@/components/market/metric-card";
import { DeskNoteForm } from "@/components/research/research-form";
import { DecisionPanel } from "@/components/research/research-trace";
import { LiveDesk } from "@/components/research/live-desk";
import { readPaperState } from "@/app/portfolio/actions";
import { formatNumber, formatPercent, formatPrice } from "@/lib/format";
import { describeTypeSafeError, judgeBtcSnapshot } from "@/lib/typesafe/client";
import { composeBtcDecision, type BtcJudgments } from "@/lib/typesafe/decision";
import { hasTypeSafeKey } from "@/lib/typesafe/env";
import { getBtcLiveMarket } from "@/lib/typesafe/live";
import { BTC_PLAY_LABEL, BTC_SYMBOL, type BtcPlay } from "@/lib/typesafe/questions";
import { buildBtcSnapshot } from "@/lib/typesafe/snapshot";

export const metadata: Metadata = { title: "BTC 决策" };
export const dynamic = "force-dynamic";

const NOTE_MAX = 400;

function first(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function KeyMissingAlert() {
  return (
    <Alert>
      <AlertTitle>还没有 TypeSafe 密钥</AlertTitle>
      <AlertDescription>
        行情数字已经由本终端算好。要让 Jev 给出纸上立场，请在{" "}
        <a href="https://console.typesafe.ai" rel="noreferrer">
          console.typesafe.ai
        </a>{" "}
        创建 API 密钥，写入服务端 <code>TYPESAFE_API_KEY</code>。
      </AlertDescription>
    </Alert>
  );
}

export default async function ResearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const note = first(sp.note).trim().slice(0, NOTE_MAX);
  const configured = hasTypeSafeKey();
  const judgedAtMs = Date.now();

  const [market, paper] = await Promise.all([getBtcLiveMarket(), readPaperState()]);
  const snapshot = buildBtcSnapshot({
    candles: market.series.candles,
    source: market.series.source,
    paper,
    traderNote: note,
    interval: market.interval,
    range: market.range,
    barsLabel: market.barsLabel,
    quote: market.quote,
  });

  let error: string | null = null;
  let judgments: BtcJudgments | null = null;

  if (configured) {
    try {
      judgments = (await judgeBtcSnapshot(snapshot)) as BtcJudgments;
    } catch (caught) {
      error = describeTypeSafeError(caught);
    }
  }

  const decision = judgments ? composeBtcDecision(judgments, snapshot) : null;
  const playHref =
    decision && decision.play !== "cash"
      ? `/backtest?symbol=${encodeURIComponent(BTC_SYMBOL)}&strategy=${encodeURIComponent(decision.play)}&range=1y&run=1`
      : `/backtest?symbol=${encodeURIComponent(BTC_SYMBOL)}&range=1y`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-medium">BTC 决策</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            现价大约每 10 秒刷新。价格波动超过 0.2% 或满 45 秒，就用最新快照再问一次 Jev。不是交易所逐笔推送。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline">{market.series.source === "yahoo" ? "Yahoo 实时" : "演示数据"}</Badge>
          <Badge variant="outline">{market.interval}</Badge>
          <Badge variant="outline">{configured ? "TypeSafe 已配置" : "等待密钥"}</Badge>
        </div>
      </div>

      <LiveDesk judgedPrice={snapshot.market.last} judgedAtMs={judgedAtMs} interval={market.interval} />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="BTC 现价"
          value={formatPrice(snapshot.market.last)}
          hint={snapshot.market.change1dPercent != null ? `${snapshot.market.change1dPercent.toFixed(2)}% 日涨跌` : undefined}
          tone={
            snapshot.market.change1dPercent == null
              ? undefined
              : snapshot.market.change1dPercent > 0
                ? "up"
                : snapshot.market.change1dPercent < 0
                  ? "down"
                  : undefined
          }
        />
        <MetricCard
          label="RSI(14)"
          value={snapshot.indicators.rsi14 != null ? formatNumber(snapshot.indicators.rsi14, 1) : "—"}
          hint={`SMA10 ${snapshot.indicators.sma10VsSma30} SMA30`}
        />
        <MetricCard
          label="ATR(14)"
          value={
            snapshot.indicators.atr14Percent != null
              ? `${snapshot.indicators.atr14Percent.toFixed(2)}%`
              : "—"
          }
          hint={
            snapshot.market.return30dPercent != null
              ? `30 日 ${snapshot.market.return30dPercent.toFixed(1)}%`
              : undefined
          }
        />
        <MetricCard
          label="纸上 BTC"
          value={snapshot.paper.side === "long" ? `${snapshot.paper.btcQuantity}` : "空仓"}
          hint={`现金 ${formatPrice(snapshot.paper.cashUsd)}`}
        />
      </div>

      {configured ? null : <KeyMissingAlert />}
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>判断失败</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {judgments && decision ? <DecisionPanel answers={judgments} decision={decision} /> : null}

      <Card>
        <CardHeader>
          <CardTitle>本终端算出的快照</CardTitle>
          <CardDescription>
            这些数字不经过 Jev。窗口高低来自当前 {market.interval} K 线，现价来自 Yahoo 报价。
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm md:grid-cols-2">
          <p>
            7 日 {snapshot.market.return7dPercent != null ? `${snapshot.market.return7dPercent.toFixed(2)}%` : "—"}
            {" · "}
            布林 %B{" "}
            {snapshot.indicators.bollingerPercentB != null
              ? snapshot.indicators.bollingerPercentB.toFixed(2)
              : "—"}
            {" · "}
            ROC20{" "}
            {snapshot.indicators.roc20Percent != null
              ? `${snapshot.indicators.roc20Percent.toFixed(2)}%`
              : "—"}
          </p>
          <p>
            纸上仓位 {snapshot.paper.side === "long" ? "多头" : "空仓"} · 占净值{" "}
            {formatPercent(snapshot.paper.investedPercent / 100, 1, false)}
          </p>
          <ul className="md:col-span-2 grid gap-1 font-mono text-xs text-muted-foreground sm:grid-cols-2">
            {snapshot.strategySignals.map((item) => (
              <li key={item.id}>
                {item.name} · {item.lastTarget === "long" ? "做多" : item.lastTarget === "short" ? "做空" : "空仓"}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>约束（可选）</CardTitle>
          <CardDescription>
            不填也会对当前 BTC 快照做判断。填写后会写进 `traderNote`，例如只做小仓或先观望。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <DeskNoteForm defaultNote={note} />
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <Link href={`/markets/${encodeURIComponent(BTC_SYMBOL)}`}>BTC 行情</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href={playHref}>
                {decision && decision.play !== "cash"
                  ? `回测 ${BTC_PLAY_LABEL[decision.play as BtcPlay] ?? decision.play}`
                  : "回测 BTC"}
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/portfolio">模拟组合</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
