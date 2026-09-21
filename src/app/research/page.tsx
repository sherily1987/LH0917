import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ResearchForm } from "@/components/research/research-form";
import { formatPercent } from "@/lib/format";
import { classifyResearchRequest, describeTypeSafeError } from "@/lib/typesafe/client";
import { hasTypeSafeKey } from "@/lib/typesafe/env";
import { RESEARCH_ACTION_LABEL } from "@/lib/typesafe/questions";
import { decideResearchRoute, type ResearchJudgments } from "@/lib/typesafe/route";

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

function JudgmentRow({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b py-2 last:border-b-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">
        <span className="font-mono text-foreground">{value}</span>
        <span className="ml-2 text-xs text-muted-foreground">{detail}</span>
      </span>
    </div>
  );
}

function ClarifyCard({ query, answers, message, hint }: {
  query: string;
  answers: ResearchJudgments;
  message: string;
  hint: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>需要再明确一点</CardTitle>
        <CardDescription>{message}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">{hint}</p>
        <div className="text-sm">
          <JudgmentRow
            label="动作"
            value={RESEARCH_ACTION_LABEL[answers.action.choice]}
            detail={formatPercent(answers.action.confidence, 0, false)}
          />
          <JudgmentRow
            label="标的"
            value={answers.symbol.choice}
            detail={`置信 ${formatPercent(answers.symbol.confidence, 0, false)} · 点名 ${formatPercent(answers.namesSymbol.noul, 0, false)}`}
          />
          <JudgmentRow
            label="策略"
            value={answers.strategy.choice}
            detail={`置信 ${formatPercent(answers.strategy.confidence, 0, false)} · 点名 ${formatPercent(answers.namesStrategy.noul, 0, false)}`}
          />
          <JudgmentRow
            label="区间"
            value={answers.range.choice}
            detail={`置信 ${formatPercent(answers.range.confidence, 0, false)} · 点名 ${formatPercent(answers.namesRange.noul, 0, false)}`}
          />
        </div>
        <ResearchForm defaultQuery={query} />
      </CardContent>
    </Card>
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
  let clarify: { message: string; hint: string; answers: ResearchJudgments } | null = null;
  let destination: string | null = null;

  if (query && !configured) {
    error = "missing-key";
  } else if (query && configured) {
    try {
      const answers = await classifyResearchRequest(query);
      const decision = decideResearchRoute(answers);
      if (decision.kind === "clarify") {
        clarify = decision;
      } else {
        destination = decision.href;
      }
    } catch (caught) {
      error = describeTypeSafeError(caught);
    }
  }

  if (destination) {
    redirect(destination);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-medium">研究</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            用一句话描述你想看的东西，服务端 TypeSafe 判断会把它接到行情、回测或模拟组合。
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

      {clarify ? (
        <ClarifyCard
          query={query}
          answers={clarify.answers}
          message={clarify.message}
          hint={clarify.hint}
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>说人话</CardTitle>
            <CardDescription>问题和阈值写在服务端，密钥不会进浏览器。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ResearchForm defaultQuery={query} autoFocus />
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
      )}
    </div>
  );
}
