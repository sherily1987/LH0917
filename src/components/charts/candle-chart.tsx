"use client";

import { useEffect, useRef } from "react";
import {
  CandlestickSeries,
  ColorType,
  HistogramSeries,
  LineSeries,
  createChart,
  createSeriesMarkers,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
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
      timeScale: {
        borderColor: "rgba(255,255,255,0.08)",
        timeVisible: false,
      },
      crosshair: { horzLine: { labelBackgroundColor: "#1f2933" } },
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#22c55e",
      downColor: "#ef4444",
      borderUpColor: "#22c55e",
      borderDownColor: "#ef4444",
      wickUpColor: "#22c55e",
      wickDownColor: "#ef4444",
    });
    candleSeries.setData(
      candles.map((c) => ({
        time: c.time as UTCTimestamp,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      })),
    );

    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "volume",
    });
    chart.priceScale("volume").applyOptions({
      scaleMargins: { top: 0.82, bottom: 0 },
    });
    volumeSeries.setData(
      candles.map((c) => ({
        time: c.time as UTCTimestamp,
        value: c.volume,
        color: c.close >= c.open ? "rgba(34,197,94,0.35)" : "rgba(239,68,68,0.35)",
      })),
    );

    const overlaySeries: ISeriesApi<"Line">[] = [];
    for (const overlay of overlays) {
      const series = chart.addSeries(LineSeries, {
        color: overlay.color,
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
      });
      series.setData(
        candles.flatMap((c, i) => {
          const value = overlay.values[i];
          return value == null ? [] : [{ time: c.time as UTCTimestamp, value }];
        }),
      );
      overlaySeries.push(series);
    }

    if (signals.length) {
      createSeriesMarkers(
        candleSeries,
        signals.map((signal) => ({
          time: signal.time as UTCTimestamp,
          position: signal.type === "buy" ? "belowBar" : "aboveBar",
          color: signal.type === "buy" ? "#22c55e" : "#ef4444",
          shape: signal.type === "buy" ? "arrowUp" : "arrowDown",
        })),
      );
    }

    chart.timeScale().fitContent();

    const observer = new ResizeObserver(() => {
      chart.applyOptions({ width: el.clientWidth, height });
    });
    observer.observe(el);

    return () => {
      observer.disconnect();
      overlaySeries.forEach((s) => chart.removeSeries(s));
      chart.remove();
    };
  }, [candles, overlays, signals, height]);

  return <div ref={ref} className="w-full" style={{ height }} />;
}
