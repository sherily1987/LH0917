import { describe, expect, it } from "vitest";
import { holdReturn, liveGateDecision, OKX_COSTS } from "@/lib/desk/costs";
import { evaluateLiveGate } from "@/lib/desk/gate";
import { regimeHeld } from "@/lib/desk/step";

describe("live gate", () => {
  it("requires a gain, a win over 20% buy-and-hold, and a drawdown inside 5%", () => {
    expect(liveGateDecision({ returnPct: 0.01, hold20Pct: 0.005, maxDrawdownPct: 0.02 }).liveEligible).toBe(true);
    expect(liveGateDecision({ returnPct: 0, hold20Pct: -0.01, maxDrawdownPct: 0.01 }).liveEligible).toBe(false);
    expect(liveGateDecision({ returnPct: 0.01, hold20Pct: 0.02, maxDrawdownPct: 0.01 }).reasons.join("")).toContain("买入持有");
    expect(liveGateDecision({ returnPct: 0.01, hold20Pct: 0, maxDrawdownPct: 0.06 }).reasons.join("")).toContain("5%");
  });

  it("charges the hold for slippage and the taker fee", () => {
    const flat = holdReturn(100, 100, 0.2, OKX_COSTS);
    expect(flat).toBeLessThan(0);
    const up = holdReturn(100, 110, 1, OKX_COSTS);
    expect(up).toBeGreaterThan(0.05);
    expect(up).toBeLessThan(0.1);
  });

  it("refuses a sample that cannot fill 14 holdout days", () => {
    const bars = Array.from({ length: 50 }, (_, i) => ({
      time: 1_700_000_000 + i * 900,
      high: 100,
      low: 99,
      close: 100,
    }));
    const gate = evaluateLiveGate(bars);
    expect(gate.liveEligible).toBe(false);
    expect(gate.confirmBars).toBe(1);
  });

  it("keeps a two-bar regime only when the previous bar agrees", () => {
    expect(regimeHeld("up", "down", 1)).toBe(true);
    expect(regimeHeld("up", "down", 2)).toBe(false);
    expect(regimeHeld("up", "up", 2)).toBe(true);
    expect(regimeHeld("down", null, 2)).toBe(false);
  });
});
