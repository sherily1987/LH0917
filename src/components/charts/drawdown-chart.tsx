import type { EquityPoint } from "@/lib/quant/types";

export function DrawdownChart({
  equity,
  height = 140,
}: {
  equity: EquityPoint[];
  height?: number;
}) {
  if (equity.length < 2) {
    return <div className="text-sm text-muted-foreground" style={{ height }} />;
  }
  const width = 1100;
  const pad = { l: 12, r: 72, t: 12, b: 20 };
  const values = equity.map((p) => p.drawdown * 100);
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 0);
  const span = max - min || 1;
  const plotW = width - pad.l - pad.r;
  const plotH = height - pad.t - pad.b;
  const xAt = (i: number) => pad.l + (i / (equity.length - 1)) * plotW;
  const yAt = (value: number) => pad.t + ((max - value) / span) * plotH;
  const line = values.map((value, i) => `${xAt(i).toFixed(2)},${yAt(value).toFixed(2)}`).join(" ");
  const area = `${xAt(0).toFixed(2)},${yAt(0).toFixed(2)} ${line} ${xAt(values.length - 1).toFixed(2)},${yAt(0).toFixed(2)}`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" style={{ minHeight: height }} role="img" aria-label="回撤">
      <line x1={pad.l} x2={width - pad.r} y1={yAt(0)} y2={yAt(0)} stroke="rgba(255,255,255,0.12)" />
      <polygon points={area} fill="rgba(248,113,113,0.22)" />
      <polyline points={line} fill="none" stroke="#f87171" strokeWidth="1.6" />
      <text x={width - pad.r + 8} y={yAt(min) + 4} fill="rgba(228,228,228,0.55)" fontSize="11" fontFamily="ui-monospace, monospace">
        {min.toFixed(1)}%
      </text>
    </svg>
  );
}
