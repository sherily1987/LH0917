import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createLedger } from "@/lib/desk/ledger";
import { readRegime } from "@/lib/desk/regime";
import { clampRisk } from "@/lib/desk/risk";
import { stepDesk } from "@/lib/desk/step";
import { DEFAULT_RISK, type DeskCandle, type DeskLedger, type DeskMarket } from "@/lib/desk/types";

const START = 1_700_000_000;

function pathCandles(direction: 1 | -1): DeskCandle[] {
  const candles: DeskCandle[] = [];
  let close = 100;
  for (let i = 0; i < 90; i++) {
    close *= 1 + direction * 0.004;
    candles.push({
      time: START + i * 86_400,
      high: close * 1.004,
      low: close * 0.996,
      close,
    });
  }
  return candles;
}

function easeInsideBand(candles: DeskCandle[]): DeskCandle[] {
  const next = candles.map((item) => ({ ...item }));
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

function marketFrom(candles: DeskCandle[], price = candles.at(-1)?.close ?? 0): DeskMarket {
  const last = candles[candles.length - 1];
  return {
    symbol: "BTCUSDT",
    price,
    time: last.time,
    candles,
  };
}

function longLedger(entry: number, time: number): DeskLedger {
  const ledger = createLedger(10_000, time);
  return {
    ...ledger,
    cash: 8_000,
    position: { side: "long", quantity: 0.02, entryPrice: entry, openedAt: time },
  };
}

describe("desk step", () => {
  it("enters long when the regime is up and price is not stretched", () => {
    const candles = easeInsideBand(pathCandles(1));
    const reading = readRegime(candles);
    expect(reading.regime, JSON.stringify(reading)).toBe("up");
    expect(reading.stretched).toBe(false);

    const market = marketFrom(candles);
    const result = stepDesk({
      ledger: createLedger(10_000, market.time),
      market,
      risk: DEFAULT_RISK,
    });

    expect(result.execution).toBe("paper");
    expect(result.decision.action).toBe("enter");
    expect(result.decision.reason).toContain("开多");
    expect(result.ledger.position?.side).toBe("long");
    const notional = result.ledger.position!.quantity * result.ledger.position!.entryPrice;
    expect(notional).toBeLessThanOrEqual(10_000 * 0.2 + 1e-4);
    expect(notional).toBeGreaterThan(1_900);
  });

  it("does not add a second position and keeps size inside the cap", () => {
    const candles = easeInsideBand(pathCandles(1));
    const market = marketFrom(candles);
    const opened = stepDesk({ ledger: createLedger(10_000, market.time), market });
    expect(opened.ledger.position).not.toBeNull();
    const again = stepDesk({
      ledger: opened.ledger,
      market: { ...market, time: market.time + 60 },
    });
    expect(again.ledger.position?.quantity).toBe(opened.ledger.position?.quantity);
    expect(again.decision.action).not.toBe("enter");
    expect(clampRisk({ positionPct: 5, maxPositions: 4 }).positionPct).toBe(1);
    expect(clampRisk({ positionPct: 5, maxPositions: 4 }).maxPositions).toBe(1);
  });

  it("blocks new entries after the daily loss halt", () => {
    const candles = easeInsideBand(pathCandles(1));
    const market = marketFrom(candles);
    const ledger = createLedger(10_000, market.time);
    ledger.cash = 9_400;
    ledger.dayStartEquity = 10_000;
    const result = stepDesk({ ledger, market });
    expect(result.ledger.halted).toBe(true);
    expect(result.ledger.position).toBeNull();
    expect(result.decision.action).toBe("halt");
    expect(result.decision.reason).toContain("停止开新仓");
  });

  it("exits when the hard stop is hit", () => {
    const candles = pathCandles(1);
    const time = candles.at(-1)!.time;
    const result = stepDesk({
      ledger: longLedger(100, time),
      market: marketFrom(candles, 97),
    });
    expect(result.decision.action).toBe("exit");
    expect(result.decision.reason).toContain("止损");
    expect(result.ledger.position).toBeNull();
    expect(result.ledger.cash).toBeCloseTo(8_000 + 0.02 * 97, 6);
  });

  it("exits when take-profit is hit", () => {
    const candles = pathCandles(1);
    const time = candles.at(-1)!.time;
    const result = stepDesk({
      ledger: longLedger(100, time),
      market: marketFrom(candles, 105),
    });
    expect(result.decision.action).toBe("exit");
    expect(result.decision.reason).toContain("止盈");
    expect(result.ledger.position).toBeNull();
    expect(result.ledger.cash).toBeCloseTo(8_000 + 0.02 * 105, 6);
  });

  it("exits when the regime flips down", () => {
    const candles = pathCandles(-1);
    const reading = readRegime(candles);
    expect(reading.regime, JSON.stringify(reading)).toBe("down");
    const market = marketFrom(candles);
    const result = stepDesk({
      ledger: longLedger(market.price, market.time),
      market,
    });
    expect(result.decision.action).toBe("exit");
    expect(result.decision.reason).toContain("趋势");
    expect(result.ledger.position).toBeNull();
  });

  it("flattens on the kill switch and is idempotent for the same tick", () => {
    const candles = easeInsideBand(pathCandles(1));
    const market = marketFrom(candles);
    const ledger = longLedger(market.price, market.time);
    const once = stepDesk({ ledger, market, command: "flatten" });
    const twice = stepDesk({ ledger: once.ledger, market, command: "flatten" });
    expect(once.ledger.position).toBeNull();
    expect(once.decision.action).toBe("flatten");
    expect(twice.ledger).toEqual(once.ledger);
    expect(twice.execution).toBe("paper");
  });

  it("does not send a live order from the decision module", () => {
    const source = readFileSync(new URL("./step.ts", import.meta.url), "utf8");
    expect(source.includes("LiveAdapter")).toBe(false);
    expect(source.toLowerCase().includes("binance")).toBe(false);
    expect(source.includes("ccxt")).toBe(false);
  });
});
