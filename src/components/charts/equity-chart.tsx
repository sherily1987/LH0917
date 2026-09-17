"use client";

import { useEffect, useRef } from "react";
import {
  AreaSeries,
  ColorType,
  LineSeries,
  createChart,
  type UTCTimestamp,
} from "lightweight-charts";
import type { EquityPoint } from "@/lib/quant/types";

export function EquityChart({
  equity,
  height = 280,
}: {
  equity: EquityPoint[];
  height?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const chart = createChart(el, {
      height,
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "rgba(228,228,228,0.72)",
        fontFamily: "Geist Mono, ui-monospace, monospace",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: "rgba(255,255,255,0.04)" },
        horzLines: { color: "rgba(255,255,255,0.04)" },
      },
      rightPriceScale: { borderColor: "rgba(255,255,255,0.08)" },
      timeScale: { borderColor: "rgba(255,255,255,0.08)", timeVisible: false },
    });

    const area = chart.addSeries(AreaSeries, {
      lineColor: "#34d399",
      topColor: "rgba(52,211,153,0.28)",
      bottomColor: "rgba(52,211,153,0.02)",
      lineWidth: 2,
    });
    area.setData(
      equity.map((p) => ({ time: p.time as UTCTimestamp, value: p.value })),
    );

    const bench = chart.addSeries(LineSeries, {
      color: "rgba(148,163,184,0.8)",
      lineWidth: 1,
      lineStyle: 2,
      lastValueVisible: false,
      priceLineVisible: false,
    });
    bench.setData(
      equity.map((p) => ({ time: p.time as UTCTimestamp, value: p.benchmark })),
    );

    chart.timeScale().fitContent();
    const observer = new ResizeObserver(() => {
      chart.applyOptions({ width: el.clientWidth, height });
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
      chart.remove();
    };
  }, [equity, height]);

  return <div ref={ref} className="w-full" style={{ height }} />;
}
