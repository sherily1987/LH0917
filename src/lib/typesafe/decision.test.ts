import { describe, expect, it } from "vitest";
import { EMPTY_PAPER } from "@/app/portfolio/paper";
import { syntheticCandles } from "@/lib/market/synthetic";
import { BTC_PLAYS, BTC_SYMBOL, buildBtcPlayCriteria, buildBtcQuestions } from "@/lib/typesafe/questions";
import { composeBtcDecision, rankedProbabilities, type BtcJudgments } from "@/lib/typesafe/decision";
import { buildBtcSnapshot } from "@/lib/typesafe/snapshot";

function judgments(partial: {
  stance?: Partial<BtcJudgments["stance"]>;
  play?: Partial<BtcJudgments["play"]>;
  horizon?: Partial<BtcJudgments["horizon"]>;
  trendQuality?: Partial<BtcJudgments["trendQuality"]>;
  chop?: Partial<BtcJudgments["chop"]>;
  stretch?: Partial<BtcJudgments["stretch"]>;
  trendFits?: number;
  meanReversionFits?: number;
  skipNewRisk?: number;
  keepInventory?: number;
}): BtcJudgments {
  return {
    stance: { choice: "wait", confidence: 1, ...partial.stance },
    play: { choice: "cash", confidence: 1, ...partial.play },
    horizon: { choice: "uncertain", confidence: 1, ...partial.horizon },
    trendQuality: { score: 1.5, confidence: 0.7, ...partial.trendQuality },
    chop: { score: 1.5, confidence: 0.7, ...partial.chop },
    stretch: { score: 1, confidence: 0.7, ...partial.stretch },
    trendFits: { noul: partial.trendFits ?? 0.4 },
    meanReversionFits: { noul: partial.meanReversionFits ?? 0.4 },
    skipNewRisk: { noul: partial.skipNewRisk ?? 0.3 },
    keepInventory: { noul: partial.keepInventory ?? 0.5 },
  };
}

function snapshot(paper = EMPTY_PAPER) {
  return buildBtcSnapshot({
    candles: syntheticCandles(BTC_SYMBOL, "1y"),
    source: "synthetic",
    paper,
  });
}

describe("buildBtcQuestions", () => {
  it("asks stance, play, scores, and risk flags together", () => {
    const questions = buildBtcQuestions();
    expect(Object.keys(questions).sort()).toEqual([
      "chop",
      "horizon",
      "keepInventory",
      "meanReversionFits",
      "play",
      "skipNewRisk",
      "stance",
      "stretch",
      "trendFits",
      "trendQuality",
    ]);
    expect(questions.stance.type).toBe("choice");
    expect(questions.play.type).toBe("choice");
    expect(questions.horizon.type).toBe("choice");
    expect(questions.trendQuality.type).toBe("score");
    expect(questions.chop.type).toBe("score");
    expect(questions.stretch.type).toBe("score");
    expect(questions.trendFits.type).toBe("noul");
    expect(questions.skipNewRisk.type).toBe("noul");
    expect(questions.stance.criteria.buy).toBeTruthy();
    expect(questions.stance.criteria.wait).toBeTruthy();
    expect(questions.play.criteria.cash).toBeTruthy();
    expect(questions.play.criteria["sma-cross"]).toBeTruthy();
    expect(questions.play.criteria["buy-hold"]).toBeUndefined();
    expect(BTC_PLAYS.every((id) => id in buildBtcPlayCriteria() || id === "cash")).toBe(true);
  });
});

describe("buildBtcSnapshot", () => {
  it("computes BTC indicators and strategy signals in code", () => {
    const snap = snapshot();
    expect(snap.desk.instrument.symbol).toBe(BTC_SYMBOL);
    expect(snap.market.last).toBeGreaterThan(0);
    expect(snap.indicators.rsi14).not.toBeNull();
    expect(["above", "below", "equal", "unknown"]).toContain(snap.indicators.sma10VsSma30);
    expect(snap.strategySignals.length).toBeGreaterThan(0);
    expect(snap.strategySignals.every((item) => item.id !== "buy-hold")).toBe(true);
    expect(snap.paper.side).toBe("flat");
    expect(snap.traderNote).toBeNull();
  });

  it("records an existing paper BTC long", () => {
    const snap = snapshot({
      cash: 800_000,
      positions: [{ symbol: BTC_SYMBOL, quantity: 1, avgPrice: 60_000 }],
      orders: [],
    });
    expect(snap.paper.side).toBe("long");
    expect(snap.paper.btcQuantity).toBe(1);
    expect(snap.paper.btcNotionalUsd).toBeGreaterThan(0);
  });
});

describe("composeBtcDecision", () => {
  it("waits when stance confidence is below the starting gate", () => {
    const decision = composeBtcDecision(
      judgments({ stance: { choice: "buy", confidence: 0.4 } }),
      snapshot(),
    );
    expect(decision.action).toBe("wait");
    expect(decision.paperSide).toBeNull();
    expect(decision.gated).toBe(true);
  });

  it("waits when skipNewRisk is high even if stance is buy", () => {
    const decision = composeBtcDecision(
      judgments({
        stance: { choice: "buy", confidence: 0.9 },
        skipNewRisk: 0.8,
        play: { choice: "sma-cross", confidence: 0.8 },
      }),
      snapshot(),
    );
    expect(decision.action).toBe("wait");
    expect(decision.play).toBe("sma-cross");
    expect(decision.gated).toBe(true);
  });

  it("sizes a paper buy when the snapshot supports adding risk", () => {
    const snap = snapshot();
    const decision = composeBtcDecision(
      judgments({
        stance: { choice: "buy", confidence: 0.88 },
        play: { choice: "sma-cross", confidence: 0.8 },
        horizon: { choice: "weeks", confidence: 0.7 },
        trendQuality: { score: 2.4, confidence: 0.8 },
        stretch: { score: 0.6, confidence: 0.7 },
        skipNewRisk: 0.2,
      }),
      snap,
    );
    expect(decision.action).toBe("buy");
    expect(decision.paperSide).toBe("buy");
    expect(decision.quantity).toBeGreaterThan(0);
    expect(decision.notionalUsd).toBeGreaterThan(0);
    expect(decision.notionalUsd).toBeLessThanOrEqual(snap.paper.cashUsd);
    expect(decision.play).toBe("sma-cross");
    expect(decision.horizon).toBe("weeks");
  });

  it("does not reduce when there is no BTC inventory", () => {
    const decision = composeBtcDecision(
      judgments({ stance: { choice: "reduce", confidence: 0.9 } }),
      snapshot(),
    );
    expect(decision.action).toBe("wait");
    expect(decision.gated).toBe(true);
  });

  it("sells part of an existing paper long when reducing", () => {
    const snap = snapshot({
      cash: 800_000,
      positions: [{ symbol: BTC_SYMBOL, quantity: 2, avgPrice: 50_000 }],
      orders: [],
    });
    const decision = composeBtcDecision(
      judgments({
        stance: { choice: "reduce", confidence: 0.86 },
        stretch: { score: 2.2, confidence: 0.7 },
        skipNewRisk: 0.4,
      }),
      snap,
    );
    expect(decision.action).toBe("reduce");
    expect(decision.paperSide).toBe("sell");
    expect(decision.quantity).toBeGreaterThan(0);
    expect(decision.quantity).toBeLessThanOrEqual(2);
  });

  it("holds when already at the desk's BTC allocation cap", () => {
    const snap = snapshot({
      cash: 50_000,
      positions: [{ symbol: BTC_SYMBOL, quantity: 20, avgPrice: 50_000 }],
      orders: [],
    });
    const decision = composeBtcDecision(
      judgments({
        stance: { choice: "buy", confidence: 0.9 },
        skipNewRisk: 0.1,
        play: { choice: "momentum", confidence: 0.7 },
      }),
      snap,
    );
    expect(decision.action).toBe("hold");
    expect(decision.paperSide).toBeNull();
    expect(decision.gated).toBe(true);
  });

  it("falls back to cash when play confidence is low", () => {
    const decision = composeBtcDecision(
      judgments({
        stance: { choice: "hold", confidence: 0.8 },
        play: { choice: "donchian", confidence: 0.2 },
      }),
      snapshot(),
    );
    expect(decision.play).toBe("cash");
  });
});

describe("rankedProbabilities", () => {
  it("sorts descending and keeps the top rows", () => {
    expect(rankedProbabilities({ wait: 0.05, buy: 0.7, hold: 0.2, reduce: 0.05 }, 3)).toEqual([
      { id: "buy", value: 0.7 },
      { id: "hold", value: 0.2 },
      { id: "wait", value: 0.05 },
    ]);
  });

  it("returns an empty list when probabilities are missing", () => {
    expect(rankedProbabilities(undefined)).toEqual([]);
  });
});
