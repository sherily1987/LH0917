import type { Metadata } from "next";
import Link from "next/link";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ResearchForm } from "@/components/research/research-form";
import { ResearchTrace } from "@/components/research/research-trace";
import { classifyResearchRequest, describeTypeSafeError } from "@/lib/typesafe/client";
import { hasTypeSafeKey } from "@/lib/typesafe/env";
import { decideResearchRoute, type ResearchDecision, type ResearchJudgments } from "@/lib/typesafe/route";

export const metadata: Metadata = { title: "研究" };
export const dynamic = "force-dynamic";

const QUERY_MAX = 500;

function first(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function KeyMissingAlert() {
  return (
    <Alert>
      <AlertTitle>还没有 TypeSafe 密钥</AlertTitle>
      <AlertDescription>
        在{" "}
        <a href="https://console.typesafe.ai" rel="noreferrer">
          console.typesafe.ai
        </a>{" "}
        创建 API 密钥，写入本地 <code>.env.local</code> 的 <code>TYPESAFE_API_KEY</code>
        。生产环境加到 Vercel 项目环境变量，只放在服务端。
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
  const query = first(sp.q).trim().slice(0, QUERY_MAX);
  const configured = hasTypeSafeKey();

  let error: string | null = null;
  let trace: { answers: ResearchJudgments; decision: ResearchDecision } | null = null;

  if (query && !configured) {
    error = "missing-key";
  } else if (query && configured) {
    try {
      const answers = await classifyResearchRequest(query);
      trace = { answers, decision: decideResearchRoute(answers) };
    } catch (caught) {
      error = describeTypeSafeError(caught);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-medium">研究</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            用一句话描述你想看的东西。TypeSafe 给出选项概率，代码再决定去行情、回测还是模拟组合。
          </p>
        </div>
        <Badge variant="outline">{configured ? "TypeSafe 已配置" : "等待密钥"}</Badge>
      </div>

      {error === "missing-key" ? <KeyMissingAlert /> : null}
      {error && error !== "missing-key" ? (
        <Alert variant="destructive">
          <AlertTitle>解析失败</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {trace ? (
        <ResearchTrace query={query} answers={trace.answers} decision={trace.decision} />
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>说人话</CardTitle>
          <CardDescription>
            解析后会留下判断条，不再直接跳走。也可以在{" "}
            <a href="https://console.typesafe.ai/playground" rel="noreferrer">
              TypeSafe Playground
            </a>{" "}
            里用同一句话对照。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ResearchForm defaultQuery={query} autoFocus={!trace} />
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <Link href="/markets">行情</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/backtest">回测</Link>
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
