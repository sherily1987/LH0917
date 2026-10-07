import { describe, expect, it } from "vitest";
import type { Decide } from "@/lib/bot/agent";
import { paperBroker, type Broker } from "@/lib/bot/broker";
import { readBotConfig } from "@/lib/bot/config";
import { featuresFromCandles } from "@/lib/bot/features";
import { runBotTick } from "@/lib/bot/run";
import { memoryStore } from "@/lib/bot/store";
import type { Candle } from "@/lib/quant/types";

function candles(start: number, drift: number): Candle[] {
  return Array.from({ length: 90 }, (_, i) => {
    const close = start * (1 + drift) ** i;
    return { time: 1_700_000_000 + i * 86_400, open: close, high: close * 1.01, low: close * 0.99, close, volume: 1_000 };
  });
}

const config = { ...readBotConfig(), mode: "paper" as const, enabled: true, paperStartingCash: 10_000, slippage: 0, feeRate: 0 };

function broker(): Broker {
  const base = paperBroker(config);
  return {
    ...base,
    snapshot: async () => ({
      source: "yahoo",
      markets: [featuresFromCandles("BTC-USD", candles(40_000, 0.004))!, featuresFromCandles("ETH-USD", candles(2_000, -0.002))!],
    }),
  };
}

describe("featuresFromCandles", () => {
  it("summarizes trend and position in range", () => {
    const f = featuresFromCandles("BTC-USD", candles(100, 0.01))!;
    expect(f.return30d).toBeGreaterThan(0.3);
    expect(f.distSma20).toBeGreaterThan(0);
    expect(f.rsi14).toBe(100);
    expect(featuresFromCandles("X", candles(100, 0).slice(0, 10))).toBeNull();
  });
});

describe("runBotTick", () => {
  it("executes whatever the model decides and persists the account", async () => {
    const store = memoryStore();
    const decide: Decide = async (input) => {
      expect(input.equity).toBe(10_000);
      expect(input.snapshot.markets.map((m) => m.symbol)).toEqual(["BTC-USD", "ETH-USD"]);
      return {
        marketView: "BTC 趋势向上",
        orders: [{ symbol: "BTC-USD", side: "buy", size: 0.08, confidence: 0.7, reason: "站上均线" }],
      };
    };

    const run = await runBotTick({ config, store, decide, broker: broker() });
    expect(run.status).toBe("ok");
    expect(run.fills).toHaveLength(1);
    expect(run.fills[0]).toMatchObject({ symbol: "BTC-USD", side: "buy", status: "filled" });

    const state = await store.load();
    expect(state.account?.cash).toBeCloseTo(9_200);
    expect(state.account?.holdings[0].symbol).toBe("BTC-USD");
    expect(state.runs[0].id).toBe(run.id);
  });

  it("feeds the previous runs back to the model and can close the position", async () => {
    const store = memoryStore();
    await runBotTick({
      config,
      store,
      broker: broker(),
      decide: async () => ({ marketView: "", orders: [{ symbol: "BTC-USD", side: "buy", size: 0.1, confidence: 1, reason: "" }] }),
    });
    const run = await runBotTick({
      config,
      store,
      broker: broker(),
      decide: async (input) => {
        expect(input.recentRuns).toHaveLength(1);
        expect(input.holdings).toHaveLength(1);
        return { marketView: "", orders: [{ symbol: "BTC-USD", side: "sell", size: 1, confidence: 1, reason: "止盈" }] };
      },
    });
    expect(run.fills[0].side).toBe("sell");
    const state = await store.load();
    expect(state.account?.holdings).toHaveLength(0);
    expect(state.account?.cash).toBeCloseTo(10_000);
  });

  it("records model failures without touching the account", async () => {
    const store = memoryStore();
    const run = await runBotTick({
      config,
      store,
      broker: broker(),
      decide: async () => {
        throw new Error("gateway unauthorized");
      },
    });
    expect(run.status).toBe("error");
    expect(run.message).toBe("gateway unauthorized");
    const state = await store.load();
    expect(state.account).toBeNull();
    expect(state.runs).toHaveLength(1);
  });

  it("does nothing while paused", async () => {
    const run = await runBotTick({ config: { ...config, enabled: false }, store: memoryStore(), broker: broker() });
    expect(run.status).toBe("skipped");
  });
});
