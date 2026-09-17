"use client";

import { useEffect, useRef } from "react";
import { AreaSeries, ColorType, createChart, type IChartApi, type UTCTimestamp } from "lightweight-charts";
import type { EquityPoint } from "@/lib/quant/types";

export function DrawdownChart({
  equity,
  height = 140,
}: {
  equity: EquityPoint[];
  height?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || equity.length === 0) return;
    let chart: IChartApi | null = null;
    let raf = 0;
    const mount = () => {
      if (chart || el.clientWidth === 0) {
        if (!chart && el.clientWidth === 0) raf = requestAnimationFrame(mount);
        return;
      }
      chart = createChart(el, {
        width: el.clientWidth,
        height,
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
      const series = chart.addSeries(AreaSeries, {
        lineColor: "#f87171",
        topColor: "rgba(248,113,113,0.05)",
        bottomColor: "rgba(248,113,113,0.28)",
        lineWidth: 1,
      });
      series.setData(equity.map((p) => ({ time: p.time as UTCTimestamp, value: p.drawdown * 100 })));
      chart.timeScale().fitContent();
    };
    const observer = new ResizeObserver(() => {
      if (!chart) mount();
      else chart.applyOptions({ width: el.clientWidth, height });
    });
    observer.observe(el);
    mount();
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      chart?.remove();
    };
  }, [equity, height]);

  return <div ref={ref} className="w-full" style={{ height }} />;
}
