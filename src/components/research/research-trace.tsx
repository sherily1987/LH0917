import { tradeAction } from "@/app/portfolio/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatPercent, formatPrice } from "@/lib/format";
import {
  BTC_HORIZON_LABEL,
  BTC_PLAY_LABEL,
  BTC_STANCE_LABEL,
  BTC_SYMBOL,
  type BtcHorizon,
  type BtcPlay,
  type BtcStance,
} from "@/lib/typesafe/questions";
import {
  rankedProbabilities,
  stanceCopy,
  type BtcDecision,
  type BtcJudgments,
} from "@/lib/typesafe/decision";

function stanceLabel(id: string): string {
  return BTC_STANCE_LABEL[id as BtcStance] ?? id;
}

function playLabel(id: string): string {
  return BTC_PLAY_LABEL[id as BtcPlay] ?? id;
}

function horizonLabel(id: string): string {
  return BTC_HORIZON_LABEL[id as BtcHorizon] ?? id;
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

function ScoreBlock({
  title,
  score,
  confidence,
  max = 3,
}: {
  title: string;
  score: number;
  confidence: number;
  max?: number;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-medium">{title}</h3>
        <span className="font-mono text-xs text-muted-foreground">
          置信 {formatPercent(confidence, 0, false)}
        </span>
      </div>
      <p className="font-mono text-sm">
        {score.toFixed(2)} / {max}
      </p>
      <Bar label={title} value={max === 0 ? 0 : score / max} active />
    </div>
  );
}

function NoulBlock({ title, value }: { title: string; value: number }) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium">{title}</h3>
      <Bar label="更像是" value={value} active={value >= 0.6} />
      <Bar label="更不像" value={1 - value} active={value < 0.6} />
    </div>
  );
}

export function DecisionPanel({
  answers,
  decision,
}: {
  answers: BtcJudgments;
  decision: BtcDecision;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Jev 判断 · 代码定仓</CardTitle>
        <CardDescription>{stanceCopy(decision)}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <p className="text-sm text-muted-foreground">{decision.reason}</p>
        <div className="grid gap-6 md:grid-cols-3">
          <ChoiceBlock
            title="纸上立场"
            choice={answers.stance.choice}
            confidence={answers.stance.confidence}
            probabilities={answers.stance.probabilities}
            labelOf={stanceLabel}
          />
          <ChoiceBlock
            title="更贴近的策略"
            choice={answers.play.choice}
            confidence={answers.play.confidence}
            probabilities={answers.play.probabilities}
            labelOf={playLabel}
          />
          <ChoiceBlock
            title="持有周期"
            choice={answers.horizon.choice}
            confidence={answers.horizon.confidence}
            probabilities={answers.horizon.probabilities}
            labelOf={horizonLabel}
          />
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          <ScoreBlock title="趋势干净程度" score={answers.trendQuality.score} confidence={answers.trendQuality.confidence} />
          <ScoreBlock title="震荡程度" score={answers.chop.score} confidence={answers.chop.confidence} />
          <ScoreBlock title="价格拉伸" score={answers.stretch.score} confidence={answers.stretch.confidence} />
        </div>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          <NoulBlock title="适不适合趋势跟踪" value={answers.trendFits.noul} />
          <NoulBlock title="适不适合均值回归" value={answers.meanReversionFits.noul} />
          <NoulBlock title="要不要回避新风险" value={answers.skipNewRisk.noul} />
          <NoulBlock title="现有多头还站得住吗" value={answers.keepInventory.noul} />
        </div>
        {decision.paperSide && decision.quantity > 0 ? (
          <form action={tradeAction} className="flex flex-wrap items-center gap-3">
            <input type="hidden" name="symbol" value={BTC_SYMBOL} />
            <input type="hidden" name="quantity" value={String(decision.quantity)} />
            <Button type="submit" name="side" value={decision.paperSide}>
              确认纸上
              {decision.paperSide === "buy" ? "买入" : "卖出"} {decision.quantity} {BTC_SYMBOL}
              （约 {formatPrice(decision.notionalUsd)}）
            </Button>
            <p className="text-xs text-muted-foreground">不会发到交易所。你点了才会改模拟组合。</p>
          </form>
        ) : null}
      </CardContent>
    </Card>
  );
}
