import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createLedger, markEquity, roundCash } from "@/lib/desk/ledger";
import { readRegime } from "@/lib/desk/regime";
import { clampRisk } from "@/lib/desk/risk";
import { canEnterShort, parseStepBody, stepDesk } from "@/lib/desk/step";
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

function crushBelowBand(candles: DeskCandle[]): DeskCandle[] {
  const next = candles.map((item) => ({ ...item }));
  for (let i = 0; i < 8; i++) {
    const reading = readRegime(next);
    if (
      reading.regime === "down" &&
      reading.downVotes >= 5 &&
      reading.bollingerPercentB != null &&
      reading.bollingerPercentB <= 0
    ) {
      return next;
    }
    const last = next[next.length - 1];
    last.close *= 0.992;
    last.low = Math.min(last.low, last.close);
  }
  return next;
}

function fundedLong(price: number, time: number): DeskLedger {
  const ledger = createLedger(10_000, time);
  const quantity = 0.02;
  return {
    ...ledger,
    cash: roundCash(10_000 - quantity * price),
    position: { side: "long", quantity, entryPrice: price, openedAt: time },
  };
}

function fundedShort(price: number, time: number): DeskLedger {
  const ledger = createLedger(10_000, time);
  const quantity = 0.02;
  return {
    ...ledger,
    cash: roundCash(10_000 + quantity * price),
    position: { side: "short", quantity, entryPrice: price, openedAt: time },
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

  it("enters short when five votes are down and percent B is above zero", () => {
    const candles = pathCandles(-1);
    const reading = readRegime(candles);
    expect(reading.regime).toBe("down");
    expect(reading.downVotes).toBeGreaterThanOrEqual(5);
    expect(reading.bollingerPercentB).toBeGreaterThan(0);
    expect(canEnterShort(reading)).toBe(true);

    const market = marketFrom(candles);
    const blocked = stepDesk({ ledger: createLedger(10_000, market.time), market });
    expect(blocked.ledger.position).toBeNull();
    expect(blocked.decision.action).not.toBe("enter");

    const result = stepDesk({
      ledger: createLedger(10_000, market.time),
      market,
      sides: "both",
    });
    expect(result.decision.action).toBe("enter");
    expect(result.decision.reason).toContain("开空");
    expect(result.ledger.position?.side).toBe("short");
    const position = result.ledger.position!;
    const notional = position.quantity * position.entryPrice;
    expect(notional).toBeLessThanOrEqual(10_000 * 0.2 + 1e-4);
    expect(notional).toBeGreaterThan(1_900);
    expect(markEquity(result.ledger, market.price)).toBeCloseTo(10_000, 4);
    expect(result.execution).toBe("paper");
  });

  it("does not short when percent B is at or below zero", () => {
    expect(canEnterShort({ regime: "down", bollingerPercentB: 0 })).toBe(false);
    expect(canEnterShort({ regime: "down", bollingerPercentB: -0.01 })).toBe(false);
    expect(canEnterShort({ regime: "down", bollingerPercentB: null })).toBe(false);
    expect(canEnterShort({ regime: "range", bollingerPercentB: 0.4 })).toBe(false);

    const candles = crushBelowBand(pathCandles(-1));
    const reading = readRegime(candles);
    expect(reading.regime).toBe("down");
    expect(reading.downVotes).toBeGreaterThanOrEqual(5);
    expect(reading.bollingerPercentB).not.toBeNull();
    expect(reading.bollingerPercentB!).toBeLessThanOrEqual(0);

    const market = marketFrom(candles);
    const result = stepDesk({
      ledger: createLedger(10_000, market.time),
      market,
      sides: "both",
    });
    expect(result.ledger.position).toBeNull();
    expect(result.decision.action).not.toBe("enter");
    expect(result.decision.reason).toContain("不开空");
  });

  it("stops a short out when price rises two percent", () => {
    const candles = pathCandles(1);
    const time = candles.at(-1)!.time;
    const result = stepDesk({
      ledger: fundedShort(100, time),
      market: marketFrom(candles, 103),
      sides: "both",
    });
    expect(result.decision.action).toBe("exit");
    expect(result.decision.reason).toContain("止损");
    expect(result.decision.reason).toContain("平空");
    expect(result.ledger.position).toBeNull();
    expect(result.ledger.cash).toBeCloseTo(10_000 + 0.02 * 100 - 0.02 * 103, 6);
    expect(result.ledger.trades.at(-1)?.pnl).toBeCloseTo(-0.06, 6);
  });

  it("takes profit on a short when price falls four percent", () => {
    const candles = pathCandles(1);
    const time = candles.at(-1)!.time;
    const result = stepDesk({
      ledger: fundedShort(100, time),
      market: marketFrom(candles, 95),
      sides: "both",
    });
    expect(result.decision.action).toBe("exit");
    expect(result.decision.reason).toContain("止盈");
    expect(result.decision.reason).toContain("平空");
    expect(result.ledger.position).toBeNull();
    expect(result.ledger.cash).toBeCloseTo(10_000 + 0.02 * 100 - 0.02 * 95, 6);
    expect(result.ledger.trades.at(-1)?.pnl).toBeCloseTo(0.1, 6);
  });

  it("does not reverse from long to short on the same bar", () => {
    const candles = pathCandles(-1);
    const reading = readRegime(candles);
    expect(reading.regime).toBe("down");
    expect(reading.downVotes).toBeGreaterThanOrEqual(5);
    expect(reading.bollingerPercentB).toBeGreaterThan(0);

    const market = marketFrom(candles);
    const closed = stepDesk({
      ledger: fundedLong(market.price, market.time),
      market,
      sides: "both",
    });
    expect(closed.decision.action).toBe("exit");
    expect(closed.decision.reason).toContain("平多");
    expect(closed.ledger.position).toBeNull();
    expect(closed.ledger.trades.filter((trade) => trade.positionSide === "short")).toHaveLength(0);
    expect(closed.ledger.halted).toBe(false);

    const last = candles[candles.length - 1];
    const nextClose = last.close * 0.999;
    const nextCandles = [
      ...candles,
      {
        time: last.time + 86_400,
        high: Math.max(last.close, nextClose) * 1.001,
        low: Math.min(last.close, nextClose) * 0.999,
        close: nextClose,
      },
    ];
    const nextReading = readRegime(nextCandles);
    expect(nextReading.regime).toBe("down");
    expect(nextReading.bollingerPercentB).toBeGreaterThan(0);
    const nextMarket = marketFrom(nextCandles);
    const opened = stepDesk({
      ledger: closed.ledger,
      market: nextMarket,
      sides: "both",
    });
    expect(opened.decision.action).toBe("enter");
    expect(opened.ledger.position?.side).toBe("short");
    expect(opened.ledger.position?.openedAt).toBe(nextMarket.time);
    expect(opened.ledger.trades.filter((trade) => trade.time === market.time && trade.positionSide === "short")).toHaveLength(0);

    const up = easeInsideBand(pathCandles(1));
    const upMarket = marketFrom(up);
    const covered = stepDesk({
      ledger: fundedShort(upMarket.price, upMarket.time),
      market: upMarket,
      sides: "both",
    });
    expect(covered.decision.action).toBe("exit");
    expect(covered.decision.reason).toContain("平空");
    expect(covered.ledger.position).toBeNull();
    expect(covered.ledger.trades.some((trade) => trade.positionSide === "long" && trade.pnl == null)).toBe(false);
  });

  it("does not enable shorts from the public step body", () => {
    const candles = pathCandles(-1);
    const market = marketFrom(candles);
    const parsed = parseStepBody({ command: "step", market, sides: "both" });
    expect(parsed.sides).toBeUndefined();
    const result = stepDesk(parsed);
    expect(result.ledger.position).toBeNull();
    expect(result.decision.action).not.toBe("enter");
  });

  it("does not send a live order from the decision module", () => {
    const source = readFileSync(new URL("./step.ts", import.meta.url), "utf8");
    expect(source.includes("LiveAdapter")).toBe(false);
    expect(source.toLowerCase().includes("binance")).toBe(false);
    expect(source.includes("ccxt")).toBe(false);
  });
});
