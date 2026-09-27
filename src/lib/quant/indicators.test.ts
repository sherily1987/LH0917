import { describe, expect, it } from "vitest";
import { adx, ema, rsi, sma } from "@/lib/quant/indicators";

describe("indicators", () => {
  it("computes SMA", () => {
    const values = [1, 2, 3, 4, 5];
    expect(sma(values, 3)).toEqual([null, null, 2, 3, 4]);
  });

  it("computes EMA seed from SMA", () => {
    const values = [1, 2, 3, 4, 5, 6];
    const result = ema(values, 3);
    expect(result[2]).toBe(2);
    expect(result[3]).toBeCloseTo(3, 8);
    expect(result[4]).toBeCloseTo(4, 8);
  });

  it("keeps RSI in 0-100", () => {
    const values = [10, 11, 12, 11, 13, 14, 13, 15, 16, 15, 17, 18, 17, 19, 20, 18, 21];
    const result = rsi(values, 5).filter((v): v is number => v != null);
    expect(result.length).toBeGreaterThan(0);
    expect(result.every((v) => v >= 0 && v <= 100)).toBe(true);
  });

  it("ADX leans positive in a rising market", () => {
    const closes = Array.from({ length: 80 }, (_, i) => 100 + i * 0.8);
    const highs = closes.map((close) => close + 0.4);
    const lows = closes.map((close) => close - 0.3);
    const last = adx(highs, lows, closes, 14).at(-1);
    expect(last?.adx).not.toBeNull();
    expect(last?.plusDi ?? 0).toBeGreaterThan(last?.minusDi ?? 0);
  });

  it("RSI is 100 when there are only gains", () => {
    const values = Array.from({ length: 20 }, (_, i) => 10 + i);
    const last = rsi(values, 14).at(-1);
    expect(last).toBe(100);
  });
});
