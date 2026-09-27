import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { LiveAdapter, PaperAdapter, createExecutionAdapter } from "@/lib/desk/execution";

const order = {
  symbol: "BTCUSDT" as const,
  side: "buy" as const,
  quantity: 0.01,
  price: 60_000,
};

describe("execution adapters", () => {
  it("fills paper orders locally", () => {
    const fill = new PaperAdapter().submit(order);
    expect(fill).toEqual({ ...order, mode: "paper" });
    expect(createExecutionAdapter().mode).toBe("paper");
  });

  it("refuses live orders when keys or the arm flag are missing", () => {
    expect(() => new LiveAdapter({}).submit(order)).toThrow(/不会发送真实订单/);
    expect(() =>
      new LiveAdapter({ EXCHANGE_API_KEY: "k", EXCHANGE_API_SECRET: "s" }).submit(order),
    ).toThrow(/DESK_LIVE_ARM/);
  });

  it("still does not transmit an order when keys and ARM are both set", () => {
    let calls = 0;
    const previous = globalThis.fetch;
    globalThis.fetch = (async () => {
      calls += 1;
      return new Response("no");
    }) as typeof fetch;
    try {
      expect(() =>
        new LiveAdapter({
          EXCHANGE_API_KEY: "k",
          EXCHANGE_API_SECRET: "s",
          DESK_LIVE_ARM: "1",
        }).submit(order),
      ).toThrow(/禁止向交易所发送订单/);
      expect(calls).toBe(0);
    } finally {
      globalThis.fetch = previous;
    }
  });

  it("live adapter source has no exchange client", () => {
    const source = readFileSync(new URL("./execution.ts", import.meta.url), "utf8");
    expect(source.toLowerCase()).not.toMatch(/binance|ccxt|withdraw/);
    expect(source).not.toMatch(/fetch\s*\(/);
  });
});
