import { choice, noul } from "@typesafe-ai/sdk";

/**
 * Starting gates for this direction desk, not universal TypeSafe defaults.
 * Re-evaluate against real tapes before tightening or loosening them.
 */
export const DIRECTION_THRESHOLDS = {
  leanMinConfidence: 0.55,
  factsAgreeYes: 0.6,
  conflictYes: 0.6,
  stretchedYes: 0.6,
} as const;

export function buildDirectionQuestions() {
  return {
    lean: choice(
      "Using only the computed market facts in `tape`, which way do those facts lean over `tape.horizon`? Do not invent prices, news, or levels that are not in `tape`. Pick unclear when the facts are missing, mixed, or do not lean either way.",
      {
        up: "Most of the directional facts in `tape` — recent returns, regime votes, and the moving-average relationship — point toward a higher price over `tape.horizon`.",
        down: "Most of the directional facts in `tape` — recent returns, regime votes, and the moving-average relationship — point toward a lower price over `tape.horizon`.",
        unclear:
          "The facts conflict, are missing, or do not lean either way. Use this instead of forcing up or down.",
      },
    ),
    factsAgree: noul(
      "Do the directional facts in `tape` mostly agree with one another about the same direction?",
      {
        true: "Recent returns, regime votes, and moving averages mostly point the same way.",
        false: "Those facts disagree, or there are not enough of them to say they agree.",
      },
    ),
    conflict: noul(
      "Do the directional facts in `tape` point both up and down at the same time, so neither side is a clean reading?",
      {
        true: "Some listed facts point up while others point down.",
        false: "The facts do not split both ways.",
      },
    ),
    stretched: noul(
      "Is the latest price already extended in the direction of the recent move, based on `tape.bollingerPercentB`, `tape.stretched`, `tape.compressed`, and the short-window returns?",
      {
        true: "Price is at or outside the recent band in the direction of the recent move, or a short-window return is already large.",
        false: "Price is still inside the recent band, and the short-window returns are modest.",
      },
    ),
  };
}

export type DirectionQuestions = ReturnType<typeof buildDirectionQuestions>;
