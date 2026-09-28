import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { LiveAdapter, PaperAdapter, createExecutionAdapter } from "@/lib/desk/execution";
import { resetOkxSession, type OkxHttp } from "@/lib/desk/okx";

const order = {
  symbol: "BTCUSDT" as const,
  side: "buy" as const,
  quantity: 0.01,
  price: 60_000,
};

const armed = {
  OKX_API_KEY: "k",
  OKX_API_SECRET: "s",
  OKX_API_PASSPHRASE: "p",
  DESK_LIVE_ARM: "1",
  OKX_SIMULATED: "1",
};

function okHttp(calls: Array<{ path: string; simulated: boolean }>): OkxHttp {
  return async (input) => {
    calls.push({ path: input.path, simulated: input.simulated });
    if (input.path.startsWith("/api/v5/account/config")) {
      return { code: "0", data: [{ posMode: "net_mode" }] };
    }
    if (input.path.startsWith("/api/v5/public/instruments")) {
      return { code: "0", data: [{ ctVal: "0.01", lotSz: "1" }] };
    }
    if (input.path === "/api/v5/account/set-leverage") return { code: "0", data: [{}] };
    if (input.path === "/api/v5/trade/order") return { code: "0", data: [{ ordId: "1" }] };
    return { code: "1", msg: "unexpected" };
  };
}

describe("execution adapters", () => {
  it("fills paper orders locally", () => {
    const fill = new PaperAdapter().submit(order);
    expect(fill).toEqual({ ...order, mode: "paper" });
    expect(createExecutionAdapter().mode).toBe("paper");
  });

  it("refuses live orders when keys, the passphrase, or the arm flag are missing", () => {
    expect(() => new LiveAdapter({}).submit(order)).toThrow(/不会发送真实订单/);
    expect(() => new LiveAdapter({ OKX_API_KEY: "k", OKX_API_SECRET: "s" }).submit(order)).toThrow(/口令|DESK_LIVE_ARM/);
    expect(() =>
      new LiveAdapter({
        OKX_API_KEY: "k",
        OKX_API_SECRET: "s",
        OKX_API_PASSPHRASE: "p",
        DESK_LIVE_ARM: "1",
      }).submit(order),
    ).toThrow(/OKX_SIMULATED/);
  });

  it("does not call the network when the backtest gate fails", async () => {
    const calls: Array<{ path: string }> = [];
    const http: OkxHttp = async (input) => {
      calls.push(input);
      return { code: "0", data: [] };
    };
    const adapter = new LiveAdapter(armed, false, http);
    expect(() => adapter.submit(order)).toThrow(/门槛未通过/);
    await expect(
      adapter.place({
        symbol: "BTCUSDT",
        side: "buy",
        quantity: 0.02,
        reduceOnly: false,
        posSide: "long",
        clOrdId: "lhbuy1",
      }),
    ).rejects.toThrow(/门槛未通过/);
    expect(calls).toHaveLength(0);
  });

  it("sends a simulated swap order only after the gate passes", async () => {
    resetOkxSession();
    const calls: Array<{ path: string; simulated: boolean }> = [];
    const adapter = new LiveAdapter(armed, true, okHttp(calls));
    await adapter.place({
      symbol: "BTCUSDT",
      side: "buy",
      quantity: 0.02,
      reduceOnly: false,
      posSide: "long",
      clOrdId: "lhbuy1",
    });
    expect(calls.some((call) => call.path === "/api/v5/trade/order" && call.simulated)).toBe(true);
    expect(calls.some((call) => call.path.includes("withdraw"))).toBe(false);
  });

  it("live adapter source does not withdraw or call fetch itself", () => {
    const source = readFileSync(new URL("./execution.ts", import.meta.url), "utf8");
    expect(source.toLowerCase()).not.toMatch(/withdraw/);
    expect(source).not.toMatch(/fetch\s*\(/);
    const okx = readFileSync(new URL("./okx.ts", import.meta.url), "utf8");
    expect(okx.toLowerCase()).not.toMatch(/withdraw|transfer/);
  });
});
