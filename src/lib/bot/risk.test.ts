import { describe, expect, it } from "vitest";
import type { RiskLimits } from "@/lib/bot/config";
import { planOrders } from "@/lib/bot/risk";
import type { Account, AiOrder } from "@/lib/bot/types";

const LIMITS: RiskLimits = {
  maxOrderPct: 0.1,
  maxPositionPct: 0.3,
  minCashPct: 0.2,
  maxDailyLossPct: 0.05,
  maxDrawdownPct: 0.2,
  minOrderUsd: 10,
};

function account(overrides: Partial<Account> = {}): Account {
  return {
    mode: "paper",
    cash: 10_000,
    holdings: [],
    peakEquity: 10_000,
    day: { date: "2026-10-07", openEquity: 10_000 },
    ...overrides,
  };
}

function order(partial: Partial<AiOrder>): AiOrder {
  return { symbol: "BTC-USD", side: "buy", size: 0.05, confidence: 0.8, reason: "test", ...partial };
}

const prices = { "BTC-USD": 50_000, "ETH-USD": 2_000 };

describe("planOrders", () => {
  it("executes the model's size when it is inside every limit", () => {
    const { planned, rejected } = planOrders({ marketView: "", orders: [order({ size: 0.05 })] }, account(), prices, LIMITS, 0);
    expect(rejected).toHaveLength(0);
    expect(planned[0].notional).toBeCloseTo(500);
    expect(planned[0].quantity).toBeCloseTo(0.01);
  });

  it("clips an oversized buy to the single-order cap", () => {
    const { planned } = planOrders({ marketView: "", orders: [order({ size: 0.9 })] }, account(), prices, LIMITS, 0);
    expect(planned[0].notional).toBeCloseTo(1_000);
  });

  it("respects the per-coin position cap", () => {
    const held = account({ cash: 7_500, holdings: [{ symbol: "BTC-USD", quantity: 0.05, avgPrice: 50_000 }] });
    const { planned } = planOrders({ marketView: "", orders: [order({ size: 0.1 })] }, held, prices, LIMITS, 0);
    expect(planned[0].notional).toBeCloseTo(500);
  });

  it("keeps the minimum cash buffer across several buys", () => {
    const orders = [
      order({ symbol: "BTC-USD", size: 0.1 }),
      order({ symbol: "ETH-USD", size: 0.1 }),
    ];
    const { planned, rejected } = planOrders({ marketView: "", orders }, account({ cash: 3_000, holdings: [{ symbol: "ETH-USD", quantity: 3.5, avgPrice: 2_000 }] }), prices, LIMITS, 0);
    const spent = planned.reduce((sum, o) => sum + o.notional, 0);
    expect(3_000 - spent).toBeGreaterThanOrEqual(0.2 * 10_000 - 1e-6);
    expect(planned.length + rejected.length).toBe(2);
  });

  it("blocks buys but still allows sells after the daily loss limit", () => {
    const losing = account({
      cash: 4_000,
      holdings: [{ symbol: "ETH-USD", quantity: 2.5, avgPrice: 2_400 }],
      day: { date: "2026-10-07", openEquity: 10_000 },
    });
    const { planned, rejected, halt } = planOrders(
      { marketView: "", orders: [order({}), order({ symbol: "ETH-USD", side: "sell", size: 1 })] },
      losing,
      prices,
      LIMITS,
      0,
    );
    expect(halt).toMatch(/当日亏损/);
    expect(rejected.map((r) => r.order.side)).toEqual(["buy"]);
    expect(planned).toEqual([expect.objectContaining({ side: "sell", quantity: 2.5 })]);
  });

  it("rejects sells of coins it does not hold", () => {
    const { planned, rejected } = planOrders({ marketView: "", orders: [order({ side: "sell", size: 1 })] }, account(), prices, LIMITS, 0);
    expect(planned).toHaveLength(0);
    expect(rejected[0].why).toBe("没有持仓可卖");
  });
});
