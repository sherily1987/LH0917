import { describe, expect, it } from "vitest";
import { decideDirection, type DirectionAnswers } from "@/lib/jev/decide";
import { buildDirectionQuestions } from "@/lib/jev/questions";
import { DIRECTION_INTERVALS, INTERVAL_SPEC, buildDirectionTape, type DirectionTape } from "@/lib/jev/tape";
import type { Candle } from "@/lib/quant/types";

function tape(change5BarPct: number | null): DirectionTape {
  return {
    symbol: "BTC-USD",
    name: "比特币",
    source: "yahoo",
    interval: { id: "1d", label: "日线" },
    horizon: { meaning: "the next daily bar" },
    lastClose: 100,
    change1BarPct: change5BarPct,
    change5BarPct,
    change20BarPct: change5BarPct,
    returnLabels: { one: "1 日", five: "5 日", twenty: "20 日" },
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
      interval: "15m",
    });
    expect(built.interval.label).toBe("15 分钟线");
    expect(built.change1BarPct).toBeCloseTo(1 / 128, 4);
    expect(built.returnLabels.one).toBe("15 分钟");
    expect(built.regime).toBe("unknown");
    expect(built.votes).toHaveLength(0);
    expect(DIRECTION_INTERVALS.map((id) => INTERVAL_SPEC[id].meaning)).toEqual([
      "the next daily bar after the last bar in `tape`",
      "the next one-hour bar after the last bar in `tape`",
      "the next 15-minute bar after the last bar in `tape`",
    ]);
  });
});
