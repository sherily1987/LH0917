import { describe, expect, it } from "vitest";
import { decideDirection, type DirectionAnswers } from "@/lib/jev/decide";
import { buildDirectionQuestions } from "@/lib/jev/questions";
import { buildDirectionTape, type DirectionTape } from "@/lib/jev/tape";
import type { Candle } from "@/lib/quant/types";

function tape(change5dPct: number | null): DirectionTape {
  return {
    symbol: "BTC-USD",
    name: "比特币",
    source: "yahoo",
    horizon: { id: "session", label: "下一根日线", meaning: "next session" },
    lastClose: 100,
    change1dPct: change5dPct,
    change5dPct,
    change20dPct: change5dPct,
    regime: "up",
    upVotes: 5,
    downVotes: 1,
    bollingerPercentB: 0.8,
    stretched: false,
    compressed: false,
    votes: [],
    summary: "",
  };
}

function answers(partial: Partial<DirectionAnswers> = {}): DirectionAnswers {
  return {
    lean: { choice: "up", confidence: 0.8, probabilities: { up: 0.7, down: 0.2, unclear: 0.1 } },
    factsAgree: { noul: 0.8 },
    conflict: { noul: 0.2 },
    stretched: { noul: 0.2 },
    ...partial,
  };
}

describe("direction questions", () => {
  it("asks the lean and the three checks together", () => {
    const questions = buildDirectionQuestions();
    expect(Object.keys(questions).sort()).toEqual(["conflict", "factsAgree", "lean", "stretched"]);
    expect(questions.lean.type).toBe("choice");
    expect(questions.lean.criteria.unclear).toBeTruthy();
    expect(questions.factsAgree.type).toBe("noul");
  });
});

describe("decideDirection", () => {
  it("shows up when the lean is confident and the facts agree", () => {
    const decision = decideDirection(tape(0.02), answers());
    expect(decision.stance).toBe("up");
  });

  it("shows down on the same gates", () => {
    const decision = decideDirection(
      tape(-0.03),
      answers({ lean: { choice: "down", confidence: 0.7 } }),
    );
    expect(decision.stance).toBe("down");
  });

  it("waits when confidence is low or the choice is unclear", () => {
    expect(decideDirection(tape(0.01), answers({ lean: { choice: "up", confidence: 0.4 } })).stance).toBe("wait");
    expect(decideDirection(tape(0.01), answers({ lean: { choice: "unclear", confidence: 0.9 } })).stance).toBe("wait");
  });

  it("waits when the facts conflict or do not agree", () => {
    expect(decideDirection(tape(0.01), answers({ conflict: { noul: 0.7 } })).stance).toBe("wait");
    expect(decideDirection(tape(0.01), answers({ factsAgree: { noul: 0.4 } })).stance).toBe("wait");
  });

  it("waits on a stretched continuation and still allows a reversal", () => {
    const stretched = answers({ stretched: { noul: 0.8 } });
    expect(decideDirection(tape(0.04), stretched).stance).toBe("wait");
    expect(
      decideDirection(tape(0.04), answers({ lean: { choice: "down", confidence: 0.8 }, stretched: { noul: 0.8 } })).stance,
    ).toBe("down");
  });
});

describe("buildDirectionTape", () => {
  it("computes returns from closes and leaves a short series without a regime", () => {
    const candles: Candle[] = Array.from({ length: 30 }, (_, index) => {
      const close = 100 + index;
      return {
        time: 1_700_000_000 + index * 86_400,
        open: close,
        high: close + 1,
        low: close - 1,
        close,
        volume: 1,
      };
    });
    const built = buildDirectionTape({
      symbol: "BTC-USD",
      name: "比特币",
      candles,
      source: "yahoo",
      horizon: "week",
    });
    expect(built.horizon.id).toBe("week");
    expect(built.change1dPct).toBeCloseTo(1 / 128, 4);
    expect(built.regime).toBe("unknown");
    expect(built.votes).toHaveLength(0);
  });
});
