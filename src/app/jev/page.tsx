import type { Metadata } from "next";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DirectionForm, DirectionResult } from "@/components/jev/direction-board";
import { decideDirection, type DirectionAnswers, type DirectionDecision } from "@/lib/jev/decide";
import {
  DIRECTION_INTERVALS,
  INTERVAL_SPEC,
  buildDirectionTape,
  type DirectionInterval,
  type DirectionTape,
} from "@/lib/jev/tape";
import { getOHLCV } from "@/lib/market/data";
import { getInstrument, isAllowedSymbol } from "@/lib/market/universe";
import { describeTypeSafeError, judgeDirection } from "@/lib/typesafe/client";
import { hasTypeSafeKey } from "@/lib/typesafe/env";

export const metadata: Metadata = { title: "涨跌" };
export const dynamic = "force-dynamic";

type FrameReading = {
  interval: DirectionInterval;
  tape: DirectionTape;
  answers: DirectionAnswers;
  decision: DirectionDecision;
};

type FrameFailure = {
  interval: DirectionInterval;
  error: string;
};

function first(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

async function readFrame(symbol: string, name: string, interval: DirectionInterval): Promise<FrameReading | FrameFailure> {
  const spec = INTERVAL_SPEC[interval];
  const series = await getOHLCV(symbol, spec.range, spec.yahooInterval, { fresh: true });
  if (interval !== "1d" && series.source !== "yahoo") {
    return { interval, error: `没有拿到真实的${spec.label}。` };
  }
  if (series.candles.length < 40) {
    return { interval, error: `${spec.label} K 线不足，Jev 还读不到趋势事实。` };
  }
  const tape = buildDirectionTape({
    symbol,
    name,
    candles: series.candles,
    source: series.source,
    interval,
  });
  try {
    const answers = await judgeDirection(tape);
    return { interval, tape, answers, decision: decideDirection(tape, answers) };
  } catch (caught) {
    return { interval, error: describeTypeSafeError(caught) };
  }
}

function isReading(frame: FrameReading | FrameFailure): frame is FrameReading {
  return "tape" in frame;
}

export default async function JevPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const requested = first(sp.symbol).trim();
  const symbol = requested && isAllowedSymbol(requested) ? getInstrument(requested).symbol : "BTC-USD";
  const run = first(sp.run) === "1";
  const configured = hasTypeSafeKey();
  const instrument = getInstrument(symbol);

  let missingKey = false;
  let frames: Array<FrameReading | FrameFailure> = [];

  if (run && !configured) {
    missingKey = true;
  } else if (run && configured) {
    frames = await Promise.all(DIRECTION_INTERVALS.map((interval) => readFrame(instrument.symbol, instrument.nameZh, interval)));
  }

  const readings = frames.filter(isReading);
  const demo = readings.some((frame) => frame.tape.source !== "yahoo");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-medium">涨跌</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            日线、小时线和 15 分钟线各看下一根 K 线。代码先算出该周期的收益和七项投票，Jev 再判断偏向涨、跌，还是看不清。看不清或事实打架时这一档显示观望。这不是价格预测，也不是投资建议，不会下单。
          </p>
        </div>
        <Badge variant="outline">{configured ? "Jev 已配置" : "等待密钥"}</Badge>
      </div>

      {missingKey ? (
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

      {demo ? (
        <Alert>
          <AlertTitle>日线用的是演示行情</AlertTitle>
          <AlertDescription>上游日线暂时不可用。Jev 读的是演示 K 线，不是交易所成交价。</AlertDescription>
        </Alert>
      ) : null}

      {frames.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-3">
          {frames.map((frame) => {
            const stance = isReading(frame) ? frame.decision.stance : null;
            const label = stance === "up" ? "看涨" : stance === "down" ? "看跌" : stance === "wait" ? "观望" : "未判断";
            return (
              <Card key={frame.interval} size="sm">
                <CardHeader>
                  <CardDescription>{INTERVAL_SPEC[frame.interval].label}</CardDescription>
                  <CardTitle className={stance === "up" ? "text-up" : stance === "down" ? "text-down" : undefined}>
                    {label}
                  </CardTitle>
                </CardHeader>
              </Card>
            );
          })}
        </div>
      ) : null}

      <div className="space-y-4">
        {frames.map((frame) =>
          isReading(frame) ? (
            <DirectionResult key={frame.interval} tape={frame.tape} answers={frame.answers} decision={frame.decision} />
          ) : (
            <Alert key={frame.interval} variant="destructive">
              <AlertTitle>{INTERVAL_SPEC[frame.interval].label}没有判断出来</AlertTitle>
              <AlertDescription>{frame.error}</AlertDescription>
            </Alert>
          ),
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>选一个标的</CardTitle>
          <CardDescription>一次判断日线、小时线和 15 分钟线。默认是比特币。</CardDescription>
        </CardHeader>
        <CardContent>
          <DirectionForm symbol={symbol} />
        </CardContent>
      </Card>
    </div>
  );
}
