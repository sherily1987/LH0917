"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { formatPercent, formatPrice } from "@/lib/format";
import { BTC_LIVE, BTC_SYMBOL } from "@/lib/typesafe/questions";
import { shouldRejudge } from "@/lib/typesafe/live-policy";

function clock(ms: number): string {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(ms);
}

export function LiveDesk({
  judgedPrice,
  judgedAtMs,
  interval,
}: {
  judgedPrice: number;
  judgedAtMs: number;
  interval: string;
}) {
  const router = useRouter();
  const [livePrice, setLivePrice] = useState(judgedPrice);
  const [liveChange, setLiveChange] = useState<number | null>(null);
  const [status, setStatus] = useState<"watching" | "rejudging">("watching");
  const judging = useRef(false);

  useEffect(() => {
    judging.current = false;
    setStatus("watching");
    setLivePrice(judgedPrice);
  }, [judgedAtMs, judgedPrice]);

  useEffect(() => {
    let cancelled = false;

    const tick = async () => {
      if (cancelled || document.hidden) return;
      try {
        const response = await fetch(`/api/btc/quote`, { cache: "no-store" });
        if (!response.ok) return;
        const data = (await response.json()) as { price?: number; changePercent?: number };
        if (cancelled || !Number.isFinite(data.price)) return;
        const price = data.price as number;
        setLivePrice(price);
        setLiveChange(Number.isFinite(data.changePercent) ? (data.changePercent as number) : null);
        if (judging.current) return;
        if (
          shouldRejudge({
            judgedPrice,
            judgedAtMs,
            livePrice: price,
            nowMs: Date.now(),
          })
        ) {
          judging.current = true;
          setStatus("rejudging");
          router.refresh();
        }
      } catch {
        // keep the last printed quote
      }
    };

    const id = setInterval(() => {
      void tick();
    }, BTC_LIVE.quotePollMs);
    const onVisible = () => {
      if (!document.hidden) void tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    void tick();
    return () => {
      cancelled = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [judgedAtMs, judgedPrice, router]);

  const move = judgedPrice > 0 ? livePrice / judgedPrice - 1 : 0;

  return (
    <div className="rounded-xl border bg-card px-3 py-2 text-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-mono text-lg tabular-nums">
          {formatPrice(livePrice)}
          <span className="ml-2 text-xs text-muted-foreground">{BTC_SYMBOL}</span>
        </p>
        <p className="font-mono text-xs text-muted-foreground">
          {status === "rejudging" ? "正在重判…" : `盯盘中 · ${interval}`}
        </p>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        日涨跌 {liveChange == null ? "—" : formatPercent(liveChange)}
        {" · "}
        距上次判断 {formatPercent(move)}
        {" · "}
        {clock(judgedAtMs)} 问过 Jev
      </p>
    </div>
  );
}
