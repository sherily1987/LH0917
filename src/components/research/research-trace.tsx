import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatPercent } from "@/lib/format";
import { RANGE_LABEL, RESEARCH_ACTION_LABEL, type ResearchAction } from "@/lib/typesafe/questions";
import {
  rankedProbabilities,
  type ResearchDecision,
  type ResearchJudgments,
} from "@/lib/typesafe/route";
import { STRATEGIES } from "@/lib/quant/strategies";
import { UNIVERSE } from "@/lib/market/universe";

function actionLabel(id: string): string {
  return RESEARCH_ACTION_LABEL[id as ResearchAction] ?? id;
}

function symbolLabel(id: string): string {
  if (id === "none") return "未点名";
  const item = UNIVERSE.find((row) => row.symbol === id);
  return item ? `${item.symbol} · ${item.nameZh}` : id;
}

function strategyLabel(id: string): string {
  if (id === "none") return "未点名";
  const item = STRATEGIES.find((row) => row.id === id);
  return item ? item.name : id;
}

function rangeLabel(id: string): string {
  if (id === "none") return "未点名";
  return RANGE_LABEL[id as keyof typeof RANGE_LABEL] ?? id;
}

function Bar({
  label,
  value,
  active = false,
}: {
  label: string;
  value: number;
  active?: boolean;
}) {
  const width = `${Math.max(0, Math.min(100, value * 100)).toFixed(1)}%`;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_3.5rem] items-center gap-2">
      <div>
        <div className="mb-1 flex justify-between gap-2 text-xs">
          <span className={active ? "text-foreground" : "text-muted-foreground"}>{label}</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className={active ? "h-full rounded-full bg-primary" : "h-full rounded-full bg-foreground/35"}
            style={{ width }}
          />
        </div>
      </div>
      <span className="text-right font-mono text-xs tabular-nums text-muted-foreground">
        {formatPercent(value, 0, false)}
      </span>
    </div>
  );
}

function ChoiceBlock({
  title,
  choice,
  confidence,
  probabilities,
  labelOf,
}: {
  title: string;
  choice: string;
  confidence: number;
  probabilities?: Record<string, number>;
  labelOf: (id: string) => string;
}) {
  const rows = rankedProbabilities(probabilities);
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-medium">{title}</h3>
        <span className="font-mono text-xs text-muted-foreground">
          置信 {formatPercent(confidence, 0, false)}
        </span>
      </div>
      <p className="font-mono text-sm">{labelOf(choice)}</p>
      {rows.length > 0 ? (
        <div className="space-y-2">
          {rows.map((row) => (
            <Bar key={row.id} label={labelOf(row.id)} value={row.value} active={row.id === choice} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function NoulBlock({ title, value }: { title: string; value: number }) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium">{title}</h3>
      <Bar label="点名了" value={value} active={value >= 0.6} />
      <Bar label="没点名" value={1 - value} active={value < 0.6} />
    </div>
  );
}

export function ResearchTrace({
  query,
  answers,
  decision,
}: {
  query: string;
  answers: ResearchJudgments;
  decision: ResearchDecision;
}) {
  const going = decision.kind === "redirect";
  return (
    <Card>
      <CardHeader>
        <CardTitle>{going ? "TypeSafe 判断" : "需要再明确一点"}</CardTitle>
        <CardDescription>
          {going
            ? `代码把这次判断接到 ${decision.href}`
            : decision.message}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <p className="text-sm text-muted-foreground">
          「{query}」
          {going ? null : ` ${decision.hint}`}
        </p>
        <div className="grid gap-6 md:grid-cols-2">
          <ChoiceBlock
            title="动作"
            choice={answers.action.choice}
            confidence={answers.action.confidence}
            probabilities={answers.action.probabilities}
            labelOf={actionLabel}
          />
          <ChoiceBlock
            title="标的"
            choice={answers.symbol.choice}
            confidence={answers.symbol.confidence}
            probabilities={answers.symbol.probabilities}
            labelOf={symbolLabel}
          />
          <ChoiceBlock
            title="策略"
            choice={answers.strategy.choice}
            confidence={answers.strategy.confidence}
            probabilities={answers.strategy.probabilities}
            labelOf={strategyLabel}
          />
          <ChoiceBlock
            title="区间"
            choice={answers.range.choice}
            confidence={answers.range.confidence}
            probabilities={answers.range.probabilities}
            labelOf={rangeLabel}
          />
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          <NoulBlock title="是否点名标的" value={answers.namesSymbol.noul} />
          <NoulBlock title="是否点名策略" value={answers.namesStrategy.noul} />
          <NoulBlock title="是否点名区间" value={answers.namesRange.noul} />
        </div>
        {going ? (
          <Button asChild>
            <Link href={decision.href}>前往 {decision.reason}</Link>
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
