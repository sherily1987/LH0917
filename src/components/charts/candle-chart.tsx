import type { Candle, SignalMarker } from "@/lib/quant/types";

type Overlay = {
  id: string;
  color: string;
  values: Array<number | null>;
};

export function CandleChart({
  candles,
  overlays = [],
  signals = [],
  height = 420,
}: {
  candles: Candle[];
  overlays?: Overlay[];
  signals?: SignalMarker[];
  height?: number;
}) {
  if (candles.length === 0) {
    return (
      <div className="flex items-center justify-center text-sm text-muted-foreground" style={{ height }}>
        暂无 K 线
      </div>
    );
  }

  const width = 1100;
  const pad = { l: 12, r: 64, t: 16, b: 28 };
  const volumeHeight = 72;
  const plotHeight = height - pad.t - pad.b - volumeHeight;
  const plotWidth = width - pad.l - pad.r;
  const min = Math.min(...candles.map((c) => c.low));
  const max = Math.max(...candles.map((c) => c.high));
  const span = max - min || 1;
  const maxVolume = Math.max(...candles.map((c) => c.volume), 1);
  const slot = plotWidth / candles.length;
  const bodyWidth = Math.max(1.2, slot * 0.62);

  const yPrice = (price: number) => pad.t + ((max - price) / span) * plotHeight;
  const yVolume = (volume: number) => height - pad.b - (volume / maxVolume) * (volumeHeight - 8);
  const xAt = (index: number) => pad.l + slot * index + slot / 2;

  const ticks = [max, min + span * 0.66, min + span * 0.33, min];
  const signalByTime = new Map(signals.map((signal) => [signal.time, signal]));

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-auto w-full"
      style={{ minHeight: height }}
      role="img"
      aria-label="K线图"
    >
      {ticks.map((tick) => (
        <g key={tick}>
          <line
            x1={pad.l}
            x2={width - pad.r}
            y1={yPrice(tick)}
            y2={yPrice(tick)}
            stroke="rgba(255,255,255,0.06)"
          />
          <text
            x={width - pad.r + 8}
            y={yPrice(tick) + 4}
            fill="rgba(228,228,228,0.55)"
            fontSize="11"
            fontFamily="ui-monospace, monospace"
          >
            {tick >= 100 ? tick.toFixed(2) : tick.toFixed(3)}
          </text>
        </g>
      ))}

      {overlays.map((overlay) => {
        const points = overlay.values
          .map((value, index) => (value == null ? null : `${xAt(index).toFixed(2)},${yPrice(value).toFixed(2)}`))
          .filter((point): point is string => Boolean(point))
          .join(" ");
        if (!points) return null;
        return (
          <polyline
            key={overlay.id}
            fill="none"
            stroke={overlay.color}
            strokeWidth="1.4"
            points={points}
          />
        );
      })}

      {candles.map((candle, index) => {
        const x = xAt(index);
        const up = candle.close >= candle.open;
        const color = up ? "#22c55e" : "#ef4444";
        const yOpen = yPrice(candle.open);
        const yClose = yPrice(candle.close);
        const bodyTop = Math.min(yOpen, yClose);
        const bodyHeight = Math.max(1, Math.abs(yClose - yOpen));
        const signal = signalByTime.get(candle.time);
        return (
          <g key={candle.time}>
            <line
              x1={x}
              x2={x}
              y1={yPrice(candle.high)}
              y2={yPrice(candle.low)}
              stroke={color}
              strokeWidth="1"
            />
            <rect
              x={x - bodyWidth / 2}
              y={bodyTop}
              width={bodyWidth}
              height={bodyHeight}
              fill={color}
            />
            <rect
              x={x - bodyWidth / 2}
              y={yVolume(candle.volume)}
              width={bodyWidth}
              height={height - pad.b - yVolume(candle.volume)}
              fill={up ? "rgba(34,197,94,0.35)" : "rgba(239,68,68,0.35)"}
            />
            {signal ? (
              <polygon
                points={
                  signal.type === "buy"
                    ? `${x},${yPrice(candle.low) + 10} ${x - 5},${yPrice(candle.low) + 2} ${x + 5},${yPrice(candle.low) + 2}`
                    : `${x},${yPrice(candle.high) - 10} ${x - 5},${yPrice(candle.high) - 2} ${x + 5},${yPrice(candle.high) - 2}`
                }
                fill={signal.type === "buy" ? "#22c55e" : "#ef4444"}
              />
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}
