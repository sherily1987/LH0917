import type { EquityPoint } from "@/lib/quant/types";

export function EquityChart({
  equity,
  height = 280,
}: {
  equity: EquityPoint[];
  height?: number;
}) {
  if (equity.length < 2) {
    return <div className="text-sm text-muted-foreground" style={{ height }} />;
  }
  const width = 1100;
  const pad = { l: 12, r: 72, t: 16, b: 24 };
  const values = equity.flatMap((p) => [p.value, p.benchmark]);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const plotW = width - pad.l - pad.r;
  const plotH = height - pad.t - pad.b;
  const xAt = (i: number) => pad.l + (i / (equity.length - 1)) * plotW;
  const yAt = (value: number) => pad.t + ((max - value) / span) * plotH;
  const line = (key: "value" | "benchmark") =>
    equity.map((p, i) => `${xAt(i).toFixed(2)},${yAt(p[key]).toFixed(2)}`).join(" ");
  const area = `${xAt(0).toFixed(2)},${(pad.t + plotH).toFixed(2)} ${line("value")} ${xAt(equity.length - 1).toFixed(2)},${(pad.t + plotH).toFixed(2)}`;
  const ticks = [max, min + span / 2, min];

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" style={{ minHeight: height }} role="img" aria-label="净值曲线">
      {ticks.map((tick) => (
        <g key={tick}>
          <line x1={pad.l} x2={width - pad.r} y1={yAt(tick)} y2={yAt(tick)} stroke="rgba(255,255,255,0.06)" />
          <text x={width - pad.r + 8} y={yAt(tick) + 4} fill="rgba(228,228,228,0.55)" fontSize="11" fontFamily="ui-monospace, monospace">
            {tick.toFixed(0)}
          </text>
        </g>
      ))}
      <polygon points={area} fill="rgba(52,211,153,0.16)" />
      <polyline points={line("benchmark")} fill="none" stroke="rgba(148,163,184,0.85)" strokeWidth="1.4" strokeDasharray="5 4" />
      <polyline points={line("value")} fill="none" stroke="#34d399" strokeWidth="2.2" />
    </svg>
  );
}
