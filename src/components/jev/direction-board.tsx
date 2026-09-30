import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { formatPercent } from "@/lib/format";
import type { DirectionDecision, DirectionAnswers } from "@/lib/jev/decide";
import { DIRECTION_HORIZONS, HORIZON_LABEL, type DirectionHorizon, type DirectionTape } from "@/lib/jev/tape";
import { UNIVERSE } from "@/lib/market/universe";
import { cn } from "@/lib/utils";

const STANCE_LABEL = {
  up: "看涨",
  down: "看跌",
  wait: "观望",
} as const;

const LEAN_LABEL: Record<string, string> = {
  up: "涨",
  down: "跌",
  unclear: "看不清",
};

function Bar({ label, value, active = false }: { label: string; value: number; active?: boolean }) {
  const width = `${Math.max(0, Math.min(100, value * 100)).toFixed(1)}%`;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_3.5rem] items-center gap-2">
      <div>
        <div className="mb-1 text-xs text-muted-foreground">{label}</div>
        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
          <div className={cn("h-full rounded-full", active ? "bg-primary" : "bg-foreground/35")} style={{ width }} />
        </div>
      </div>
      <span className="text-right font-mono text-xs tabular-nums text-muted-foreground">
        {formatPercent(value, 0, false)}
      </span>
    </div>
  );
}

export function DirectionForm({
  symbol,
  horizon,
}: {
  symbol: string;
  horizon: DirectionHorizon;
}) {
  return (
    <form action="/jev" method="get" className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
      <input type="hidden" name="run" value="1" />
      <div className="space-y-1.5">
        <Label htmlFor="symbol">标的</Label>
        <NativeSelect id="symbol" name="symbol" defaultValue={symbol} aria-label="标的">
          {UNIVERSE.map((item) => (
            <option key={item.symbol} value={item.symbol}>
              {item.symbol} · {item.nameZh}
            </option>
          ))}
        </NativeSelect>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="horizon">看多远</Label>
        <NativeSelect id="horizon" name="horizon" defaultValue={horizon} aria-label="看多远">
          {DIRECTION_HORIZONS.map((id) => (
            <option key={id} value={id}>
              {HORIZON_LABEL[id]}
            </option>
          ))}
        </NativeSelect>
      </div>
      <Button type="submit">让 Jev 判断</Button>
    </form>
  );
}

export function DirectionResult({
  tape,
  answers,
  decision,
}: {
  tape: DirectionTape;
  answers: DirectionAnswers;
  decision: DirectionDecision;
}) {
  const probabilities = answers.lean.probabilities ?? {};
  const rows = (["up", "down", "unclear"] as const).map((id) => ({
    id,
    value: probabilities[id] ?? 0,
  }));
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          <span className={cn(decision.stance === "up" && "text-up", decision.stance === "down" && "text-down")}>
            {STANCE_LABEL[decision.stance]}
          </span>
          <Badge variant="outline">{tape.symbol}</Badge>
          <Badge variant="secondary">{tape.horizon.label}</Badge>
        </CardTitle>
        <CardDescription>{decision.reason}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-2">
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="text-sm font-medium">涨跌分布</h3>
              <span className="font-mono text-xs text-muted-foreground">
                置信 {formatPercent(answers.lean.confidence, 0, false)}
              </span>
            </div>
            <p className="font-mono text-sm">Jev 选了「{LEAN_LABEL[answers.lean.choice] ?? answers.lean.choice}」</p>
            <div className="space-y-2">
              {rows.map((row) => (
                <Bar
                  key={row.id}
                  label={LEAN_LABEL[row.id]}
                  value={row.value}
                  active={row.id === answers.lean.choice}
                />
              ))}
            </div>
          </div>
          <div className="space-y-3">
            <h3 className="text-sm font-medium">事实是否站得住</h3>
            <Bar label="事实同向" value={answers.factsAgree.noul} active={answers.factsAgree.noul >= 0.6} />
            <Bar label="事实打架" value={answers.conflict.noul} active={answers.conflict.noul >= 0.6} />
            <Bar label="已经延伸" value={answers.stretched.noul} active={answers.stretched.noul >= 0.6} />
          </div>
        </div>
        <div>
          <h3 className="mb-2 text-sm font-medium">交给 Jev 的事实</h3>
          <p className="text-sm text-muted-foreground">{tape.summary || "K 线还不够形成趋势投票。"}</p>
          <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
            <Fact label="现价" value={tape.lastClose == null ? "—" : tape.lastClose.toFixed(2)} />
            <Fact label="1 日" value={pct(tape.change1dPct)} />
            <Fact label="5 日" value={pct(tape.change5dPct)} />
            <Fact label="20 日" value={pct(tape.change20dPct)} />
            <Fact label="看多票" value={String(tape.upVotes)} />
            <Fact label="看空票" value={String(tape.downVotes)} />
          </dl>
          {tape.votes.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {tape.votes.map((vote) => (
                <span
                  key={vote.label}
                  title={vote.detail}
                  className={cn(
                    "rounded-full border px-2 py-0.5 text-xs",
                    vote.vote > 0 ? "text-up" : vote.vote < 0 ? "text-down" : "text-muted-foreground",
                  )}
                >
                  {vote.label} {vote.vote > 0 ? "多" : vote.vote < 0 ? "空" : "平"}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border px-3 py-2">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-mono">{value}</dd>
    </div>
  );
}

function pct(value: number | null): string {
  if (value == null) return "—";
  return formatPercent(value);
}
