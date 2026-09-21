import { describe, expect, it } from "vitest";
import { UNIVERSE } from "@/lib/market/universe";
import { STRATEGIES } from "@/lib/quant/strategies";
import { buildResearchQuestions } from "@/lib/typesafe/questions";
import {
  decideResearchRoute,
  isStated,
  rankedProbabilities,
  type ResearchJudgments,
} from "@/lib/typesafe/route";

function judgments(partial: {
  action?: Partial<ResearchJudgments["action"]>;
  symbol?: Partial<ResearchJudgments["symbol"]>;
  strategy?: Partial<ResearchJudgments["strategy"]>;
  range?: Partial<ResearchJudgments["range"]>;
  namesSymbol?: number;
  namesStrategy?: number;
  namesRange?: number;
}): ResearchJudgments {
  return {
    action: { choice: "none", confidence: 1, ...partial.action },
    symbol: { choice: "none", confidence: 1, ...partial.symbol },
    strategy: { choice: "none", confidence: 1, ...partial.strategy },
    range: { choice: "none", confidence: 1, ...partial.range },
    namesSymbol: { noul: partial.namesSymbol ?? 0.1 },
    namesStrategy: { noul: partial.namesStrategy ?? 0.1 },
    namesRange: { noul: partial.namesRange ?? 0.1 },
  };
}

describe("buildResearchQuestions", () => {
  it("asks the action, closed-set arguments, and stated flags together", () => {
    const questions = buildResearchQuestions();
    expect(Object.keys(questions).sort()).toEqual([
      "action",
      "namesRange",
      "namesStrategy",
      "namesSymbol",
      "range",
      "strategy",
      "symbol",
    ]);
    expect(questions.action.type).toBe("choice");
    expect(questions.symbol.type).toBe("choice");
    expect(questions.strategy.type).toBe("choice");
    expect(questions.range.type).toBe("choice");
    expect(questions.namesSymbol.type).toBe("noul");
    expect(questions.namesStrategy.type).toBe("noul");
    expect(questions.namesRange.type).toBe("noul");
    expect(questions.symbol.criteria.AAPL).toBeTruthy();
    expect(questions.symbol.criteria["BTC-USD"]).toBeTruthy();
    expect(questions.symbol.criteria.none).toBeTruthy();
    expect(questions.strategy.criteria["sma-cross"]).toBeTruthy();
    expect(questions.strategy.criteria.none).toBeTruthy();
    expect(questions.range.criteria["2y"]).toBeTruthy();
    expect(UNIVERSE.every((item) => item.symbol in questions.symbol.criteria)).toBe(true);
    expect(STRATEGIES.every((item) => item.id in questions.strategy.criteria)).toBe(true);
  });
});

describe("isStated", () => {
  it("requires the noul, a real choice, and enough confidence", () => {
    expect(isStated(0.7, { choice: "AAPL", confidence: 0.8 }, 0.5)).toBe(true);
    expect(isStated(0.4, { choice: "AAPL", confidence: 0.9 }, 0.5)).toBe(false);
    expect(isStated(0.9, { choice: "none", confidence: 0.9 }, 0.5)).toBe(false);
    expect(isStated(0.9, { choice: "AAPL", confidence: 0.4 }, 0.5)).toBe(false);
  });
});

describe("decideResearchRoute", () => {
  it("runs a backtest when symbol and strategy are both stated", () => {
    const decision = decideResearchRoute(
      judgments({
        action: { choice: "run_backtest", confidence: 0.9 },
        symbol: { choice: "AAPL", confidence: 0.88 },
        strategy: { choice: "sma-cross", confidence: 0.8 },
        range: { choice: "2y", confidence: 0.77 },
        namesSymbol: 0.92,
        namesStrategy: 0.85,
        namesRange: 0.8,
      }),
    );
    expect(decision).toEqual({
      kind: "redirect",
      href: "/backtest?symbol=AAPL&strategy=sma-cross&range=2y&run=1",
      reason: "运行回测",
    });
  });

  it("opens the backtest form without running when the strategy is unstated", () => {
    const decision = decideResearchRoute(
      judgments({
        action: { choice: "run_backtest", confidence: 0.84 },
        symbol: { choice: "AAPL", confidence: 0.9 },
        strategy: { choice: "sma-cross", confidence: 0.4 },
        namesSymbol: 0.9,
        namesStrategy: 0.2,
      }),
    );
    expect(decision).toEqual({
      kind: "redirect",
      href: "/backtest?symbol=AAPL",
      reason: "运行回测",
    });
  });

  it("asks for clarification when action confidence is below the starting gate", () => {
    const decision = decideResearchRoute(
      judgments({
        action: { choice: "run_backtest", confidence: 0.4 },
        symbol: { choice: "AAPL", confidence: 0.9 },
        namesSymbol: 0.9,
      }),
    );
    expect(decision.kind).toBe("clarify");
  });

  it("asks for clarification when the action is none", () => {
    const decision = decideResearchRoute(judgments({ action: { choice: "none", confidence: 0.99 } }));
    expect(decision.kind).toBe("clarify");
  });

  it("opens a named market page", () => {
    const decision = decideResearchRoute(
      judgments({
        action: { choice: "view_market", confidence: 0.8 },
        symbol: { choice: "NVDA", confidence: 0.86 },
        namesSymbol: 0.91,
      }),
    );
    expect(decision).toEqual({
      kind: "redirect",
      href: "/markets/NVDA",
      reason: "查看标的行情",
    });
  });

  it("encodes crypto symbols in the market path", () => {
    const decision = decideResearchRoute(
      judgments({
        action: { choice: "view_market", confidence: 0.7 },
        symbol: { choice: "BTC-USD", confidence: 0.8 },
        namesSymbol: 0.88,
      }),
    );
    expect(decision.kind === "redirect" && decision.href).toBe("/markets/BTC-USD");
  });

  it("clarifies when a ticker was named but not matched", () => {
    const decision = decideResearchRoute(
      judgments({
        action: { choice: "view_market", confidence: 0.7 },
        symbol: { choice: "none", confidence: 0.6 },
        namesSymbol: 0.8,
      }),
    );
    expect(decision.kind).toBe("clarify");
  });

  it("falls back to the market list when no ticker is named", () => {
    const decision = decideResearchRoute(
      judgments({
        action: { choice: "view_market", confidence: 0.7 },
        namesSymbol: 0.2,
      }),
    );
    expect(decision).toEqual({
      kind: "redirect",
      href: "/markets",
      reason: "浏览行情列表",
    });
  });

  it("routes browse and paper actions without argument gates", () => {
    expect(
      decideResearchRoute(judgments({ action: { choice: "browse_markets", confidence: 0.8 } })),
    ).toMatchObject({ href: "/markets" });
    expect(
      decideResearchRoute(judgments({ action: { choice: "browse_strategies", confidence: 0.8 } })),
    ).toMatchObject({ href: "/strategies" });
    expect(
      decideResearchRoute(judgments({ action: { choice: "paper_trade", confidence: 0.8 } })),
    ).toMatchObject({ href: "/portfolio" });
  });
});

describe("rankedProbabilities", () => {
  it("sorts descending and keeps the top rows", () => {
    expect(
      rankedProbabilities({ none: 0.05, AAPL: 0.7, NVDA: 0.2, MSFT: 0.05 }, 3),
    ).toEqual([
      { id: "AAPL", value: 0.7 },
      { id: "NVDA", value: 0.2 },
      { id: "none", value: 0.05 },
    ]);
  });

  it("returns an empty list when probabilities are missing", () => {
    expect(rankedProbabilities(undefined)).toEqual([]);
  });
});
