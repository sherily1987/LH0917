import type { Metadata } from "next";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DirectionForm, DirectionResult } from "@/components/jev/direction-board";
import { decideDirection, type DirectionAnswers, type DirectionDecision } from "@/lib/jev/decide";
import { buildDirectionTape, parseHorizon, type DirectionTape } from "@/lib/jev/tape";
import { getOHLCV } from "@/lib/market/data";
import { getInstrument, isAllowedSymbol } from "@/lib/market/universe";
import { describeTypeSafeError, judgeDirection } from "@/lib/typesafe/client";
import { hasTypeSafeKey } from "@/lib/typesafe/env";

export const metadata: Metadata = { title: "涨跌" };
export const dynamic = "force-dynamic";

function first(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

export default async function JevPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const requested = first(sp.symbol).trim();
  const symbol = requested && isAllowedSymbol(requested) ? getInstrument(requested).symbol : "BTC-USD";
  const horizon = parseHorizon(first(sp.horizon));
  const run = first(sp.run) === "1";
  const configured = hasTypeSafeKey();
  const instrument = getInstrument(symbol);

  let error: string | null = null;
  let reading: { tape: DirectionTape; answers: DirectionAnswers; decision: DirectionDecision } | null = null;

  if (run && !configured) {
    error = "missing-key";
  } else if (run && configured) {
    const series = await getOHLCV(symbol, "6mo", "1d", { fresh: true });
    if (series.candles.length < 40) {
      error = "K 线不足，Jev 还读不到趋势事实。";
    } else {
      const tape = buildDirectionTape({
        symbol: instrument.symbol,
        name: instrument.nameZh,
        candles: series.candles,
        source: series.source,
        horizon,
      });
      try {
        const answers = await judgeDirection(tape);
        reading = { tape, answers, decision: decideDirection(tape, answers) };
      } catch (caught) {
        error = describeTypeSafeError(caught);
      }
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-medium">涨跌</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            代码先算出收益、均线和七项投票，Jev 只判断这些事实偏向涨、跌，还是看不清。看不清或事实打架时显示观望。这不是价格预测，也不是投资建议，不会下单。
          </p>
        </div>
        <Badge variant="outline">{configured ? "Jev 已配置" : "等待密钥"}</Badge>
      </div>

      {error === "missing-key" ? (
        <Alert>
          <AlertTitle>还没有 TypeSafe 密钥</AlertTitle>
          <AlertDescription>
            在{" "}
            <a href="https://console.typesafe.ai" rel="noreferrer">
              console.typesafe.ai
            </a>{" "}
            创建 API 密钥，写入服务端的 <code>TYPESAFE_API_KEY</code>。页面不会把密钥送到浏览器。
          </AlertDescription>
        </Alert>
      ) : null}
      {error && error !== "missing-key" ? (
        <Alert variant="destructive">
          <AlertTitle>这一次没有判断出来</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {reading ? (
        <div className="space-y-3">
          {reading.tape.source !== "yahoo" ? (
            <Alert>
              <AlertTitle>这次用的是演示行情</AlertTitle>
              <AlertDescription>上游价格暂时不可用。Jev 读的是演示 K 线，不是交易所成交价。</AlertDescription>
            </Alert>
          ) : null}
          <DirectionResult tape={reading.tape} answers={reading.answers} decision={reading.decision} />
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>选一个标的</CardTitle>
          <CardDescription>默认看比特币的下一根日线。换标的或换窗口后再判断一次。</CardDescription>
        </CardHeader>
        <CardContent>
          <DirectionForm symbol={symbol} horizon={horizon} />
        </CardContent>
      </Card>
    </div>
  );
}
