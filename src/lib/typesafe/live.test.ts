import { describe, expect, it } from "vitest";
import { EMPTY_PAPER } from "@/app/portfolio/paper";
import { applyLiveQuote, barSeconds, shouldRejudge } from "@/lib/typesafe/live-policy";
import { BTC_LIVE, BTC_SYMBOL } from "@/lib/typesafe/questions";
import { buildBtcSnapshot } from "@/lib/typesafe/snapshot";
import type { Candle } from "@/lib/quant/types";

function candle(time: number, close: number): Candle {
  return { time, open: close, high: close, low: close, close, volume: 1 };
}

describe("shouldRejudge", () => {
  it("waits when the quote has barely moved and the last judgment is fresh", () => {
    expect(
      shouldRejudge({
        judgedPrice: 100_000,
        judgedAtMs: 1_000,
        livePrice: 100_100,
        nowMs: 1_000 + 10_000,
      }),
    ).toBe(false);
  });

  it("rejudges after the desk interval even if price is unchanged", () => {
    expect(
      shouldRejudge({
        judgedPrice: 100_000,
        judgedAtMs: 1_000,
        livePrice: 100_000,
        nowMs: 1_000 + BTC_LIVE.rejudgeAfterMs,
      }),
    ).toBe(true);
  });

  it("rejudges when the live quote moves past the starting gate", () => {
    expect(
      shouldRejudge({
        judgedPrice: 100_000,
        judgedAtMs: 1_000,
        livePrice: 100_000 * (1 + BTC_LIVE.rejudgeMove),
        nowMs: 1_000 + 5_000,
      }),
    ).toBe(true);
  });
});

describe("applyLiveQuote", () => {
  it("updates the current 15-minute bar instead of inventing a daily high", () => {
    const now = 1_700_000_900;
    const bars = [candle(1_700_000_000, 100), candle(1_700_000_900, 101)];
    const next = applyLiveQuote(
      bars,
      {
        symbol: BTC_SYMBOL,
        name: "Bitcoin",
        currency: "USD",
        price: 102,
        change: 1,
        changePercent: 0.01,
        previousClose: 101,
        open: 101,
        high: 120,
        low: 90,
        volume: 9,
      },
      "15m",
      now,
    );
    expect(next).toHaveLength(2);
    expect(next[1].close).toBe(102);
    expect(next[1].high).toBe(102);
    expect(next[0].close).toBe(100);
  });

  it("appends a bar when the quote is past the current interval", () => {
    const bars = [candle(1_000, 100)];
    const next = applyLiveQuote(
      bars,
      {
        symbol: BTC_SYMBOL,
        name: "Bitcoin",
        currency: "USD",
        price: 103,
        change: 3,
        changePercent: 0.03,
        previousClose: 100,
        open: 100,
        high: 103,
        low: 100,
        volume: 1,
      },
      "15m",
      1_000 + barSeconds("15m") + 60,
    );
    expect(next).toHaveLength(2);
    expect(next[1].close).toBe(103);
  });
});

describe("buildBtcSnapshot lookbacks", () => {
  it("uses clock time rather than bar count for 7d and 30d returns", () => {
    const now = 2_000_000_000;
    const candles = Array.from({ length: 50 }, (_, i) =>
      candle(now - (49 - i) * 900, 100 + i),
    );
    candles[0] = candle(now - 30 * 86400, 50);
    candles[20] = candle(now - 7 * 86400, 80);
    candles[49] = candle(now, 100);
    const snap = buildBtcSnapshot({
      candles,
      source: "synthetic",
      paper: EMPTY_PAPER,
      interval: "15m",
      range: "1mo",
      nowUnix: now,
    });
    expect(snap.market.interval).toBe("15m");
    expect(snap.market.return7dPercent).toBe(25);
    expect(snap.market.return30dPercent).toBe(100);
    expect(snap.market.window.low).toBe(50);
  });
});
