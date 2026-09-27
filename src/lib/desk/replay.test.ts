import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readRegime } from "@/lib/desk/regime";
import { replayDeskWindow, type DeskReplayBar } from "@/lib/desk/replay";

const START = 1_700_000_000;
const STEP = 900;

function pathBars(count: number, direction: 1 | -1 = 1): DeskReplayBar[] {
  const bars: DeskReplayBar[] = [];
  let close = 100;
  for (let i = 0; i < count; i++) {
    close *= 1 + direction * 0.004;
    bars.push({
      time: START + i * STEP,
      high: close * 1.004,
      low: close * 0.996,
      close,
    });
  }
  return bars;
}

function easeInsideBand(bars: DeskReplayBar[]): DeskReplayBar[] {
  const next = bars.map((item) => ({ ...item }));
  let saved = next.map((item) => ({ ...item }));
  for (let i = 0; i < 16; i++) {
    const reading = readRegime(next);
    if (reading.regime === "up" && !reading.stretched) return next;
    if (reading.regime === "up") saved = next.map((item) => ({ ...item }));
    const last = next[next.length - 1];
    last.close *= 0.992;
    last.low = Math.min(last.low, last.close);
  }
  return saved;
}

describe("desk day replay", () => {
  it("steps only bars inside the window and keeps earlier bars as warmup", () => {
    const bars = easeInsideBand(pathBars(110));
    const windowStart = bars[100].time;
    const report = replayDeskWindow({ bars, windowStart, capital: 10_000 });

    expect(report.barsReplayed).toBe(10);
    expect(report.warmupBars).toBe(100);
    expect(report.windowStart).toBe(windowStart);
    expect(report.windowEnd).toBe(bars[109].time);
    expect(report.startingEquity).toBe(10_000);
    expect(report.endingEquity).toBeGreaterThan(0);
    expect(report.returnUsdt).toBeCloseTo(report.endingEquity - report.startingEquity, 6);
    for (const trade of report.trades) {
      expect(trade.time).toBeGreaterThanOrEqual(windowStart);
    }
  });

  it("uses the desk stop after an in-window entry", () => {
    const eased = easeInsideBand(pathBars(100));
    const setup = readRegime(eased);
    expect(setup.regime, JSON.stringify(setup)).toBe("up");
    expect(setup.stretched).toBe(false);

    const last = eased[eased.length - 1];
    const crashClose = last.close * 0.97;
    const crash: DeskReplayBar = {
      time: last.time + STEP,
      high: Math.max(last.close, crashClose),
      low: Math.min(last.close, crashClose),
      close: crashClose,
    };
    const report = replayDeskWindow({
      bars: [...eased, crash],
      windowStart: last.time,
      capital: 10_000,
    });

    expect(report.entries).toBe(1);
    expect(report.exits).toBe(1);
    expect(report.position).toBe("flat");
    expect(report.trades[0]?.side).toBe("buy");
    expect(report.trades[0]?.time).toBe(last.time);
    expect(report.trades[1]?.side).toBe("sell");
    expect(report.trades[1]?.reason).toContain("止损");
    expect(report.trades[1]?.pnl).toBeLessThan(0);
    expect(report.returnUsdt).toBeCloseTo(report.trades[1]!.pnl!, 6);
    expect(report.returnPct).toBeLessThan(0);
    expect(report.maxDrawdownUsdt).toBeGreaterThan(0);
    expect(report.openUnrealizedPnl).toBeNull();
  });

  it("does not open on warmup bars that sit outside the window", () => {
    const eased = easeInsideBand(pathBars(100));
    const last = eased[eased.length - 1];
    const windowBar: DeskReplayBar = {
      time: last.time + STEP,
      high: last.close,
      low: last.close * 0.97,
      close: last.close * 0.97,
    };
    const report = replayDeskWindow({
      bars: [...eased, windowBar],
      windowStart: windowBar.time,
      capital: 10_000,
    });

    expect(report.barsReplayed).toBe(1);
    expect(report.warmupBars).toBe(100);
    expect(report.trades.some((trade) => trade.time === last.time)).toBe(false);
    for (const trade of report.trades) {
      expect(trade.time).toBe(windowBar.time);
    }
  });

  it("rejects an empty series", () => {
    expect(() => replayDeskWindow({ bars: [], windowStart: START })).toThrow(/没有 K 线/);
  });

  it("does not send orders to an exchange", () => {
    const replay = readFileSync(new URL("./replay.ts", import.meta.url), "utf8");
    const script = readFileSync(new URL("../../../scripts/desk-day.ts", import.meta.url), "utf8");
    for (const source of [replay, script]) {
      expect(source.includes("LiveAdapter")).toBe(false);
      expect(source.toLowerCase().includes("binance")).toBe(false);
      expect(source.includes("ccxt")).toBe(false);
    }
  });
});
