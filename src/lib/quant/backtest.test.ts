import { describe, expect, it } from "vitest";
import { runBacktest } from "@/lib/quant/backtest";
import type { Candle } from "@/lib/quant/types";

function trendingUp(n = 80): Candle[] {
  const candles: Candle[] = [];
  let price = 100;
  const t = 1_700_000_000;
  for (let i = 0; i < n; i++) {
    const open = price;
    price *= 1.01;
    candles.push({
      time: t + i * 86400,
      open,
      high: price * 1.002,
      low: open * 0.998,
      close: price,
      volume: 1_000_000,
    });
  }
  return candles;
}

function oscillating(n = 80): Candle[] {
  const candles: Candle[] = [];
  const t = 1_700_000_000;
  for (let i = 0; i < n; i++) {
    const close = 100 + Math.sin(i / 3) * 8;
    const open = 100 + Math.sin((i - 1) / 3) * 8;
    candles.push({
      time: t + i * 86400,
      open,
      high: Math.max(open, close) + 0.4,
      low: Math.min(open, close) - 0.4,
      close,
      volume: 1_000_000,
    });
  }
  return candles;
}

describe("backtest engine", () => {
  it("buy and hold captures the trend", () => {
    const candles = trendingUp();
    const result = runBacktest(
      candles,
      {
        strategy: "buy-hold",
        params: {},
        initialCapital: 100_000,
        commission: 0,
        slippage: 0,
        allowShort: false,
        allocation: 1,
      },
      { symbol: "TEST", source: "synthetic" },
    );
    expect(result.metrics.totalReturn).toBeGreaterThan(0.3);
    expect(result.metrics.trades).toBeGreaterThanOrEqual(1);
    expect(result.equity.at(-1)?.value).toBeGreaterThan(100_000);
  });

  it("SMA cross stays long in a persistent uptrend", () => {
    const candles = trendingUp(120);
    const result = runBacktest(
      candles,
      {
        strategy: "sma-cross",
        params: { fast: 5, slow: 15 },
        initialCapital: 100_000,
        commission: 0.0005,
        slippage: 0,
        allowShort: false,
        allocation: 1,
      },
      { symbol: "TEST", source: "synthetic" },
    );
    expect(result.metrics.totalReturn).toBeGreaterThan(0.2);
    expect(result.signals.some((s) => s.type === "buy")).toBe(true);
  });

  it("does not look ahead: first fill uses the next open", () => {
    const candles = trendingUp(40);
    const result = runBacktest(
      candles,
      {
        strategy: "buy-hold",
        params: {},
        initialCapital: 10_000,
        commission: 0,
        slippage: 0,
        allowShort: false,
        allocation: 1,
      },
      { symbol: "TEST", source: "synthetic" },
    );
    const firstBuy = result.signals.find((s) => s.type === "buy");
    expect(firstBuy?.price).toBe(candles[1].open);
  });

  it("max drawdown is never positive", () => {
    const result = runBacktest(
      oscillating(),
      {
        strategy: "rsi-reversion",
        params: { period: 6, oversold: 35, overbought: 65, exit: 50 },
        initialCapital: 100_000,
        commission: 0.001,
        slippage: 0.0005,
        allowShort: false,
        allocation: 1,
      },
      { symbol: "TEST", source: "synthetic" },
    );
    expect(result.metrics.maxDrawdown).toBeLessThanOrEqual(0);
    expect(result.equity.every((p) => p.drawdown <= 0)).toBe(true);
  });

  it("shorting is suppressed when allowShort is false", () => {
    const result = runBacktest(
      oscillating(),
      {
        strategy: "sma-cross",
        params: { fast: 3, slow: 8 },
        initialCapital: 100_000,
        commission: 0,
        slippage: 0,
        allowShort: false,
        allocation: 1,
      },
      { symbol: "TEST", source: "synthetic" },
    );
    expect(result.trades.every((t) => t.side === "long")).toBe(true);
  });
});
