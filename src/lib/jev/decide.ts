import { DIRECTION_THRESHOLDS } from "@/lib/jev/questions";
import type { DirectionTape } from "@/lib/jev/tape";

export type DirectionLean = "up" | "down" | "unclear";

export type DirectionAnswers = {
  lean: {
    choice: DirectionLean;
    confidence: number;
    probabilities?: Record<string, number>;
  };
  factsAgree: { noul: number };
  conflict: { noul: number };
  stretched: { noul: number };
};

export type DirectionStance = "up" | "down" | "wait";

export type DirectionDecision = {
  stance: DirectionStance;
  reason: string;
};

const LEANS = new Set<DirectionLean>(["up", "down", "unclear"]);

export function asDirectionLean(value: string): DirectionLean {
  if (LEANS.has(value as DirectionLean)) return value as DirectionLean;
  return "unclear";
}

/**
 * Jev reads the tape. This function decides whether that reading is clear
 * enough to show as up or down. A stretched continuation stays on wait.
 */
export function decideDirection(tape: DirectionTape, answers: DirectionAnswers): DirectionDecision {
  const { lean } = answers;
  if (lean.choice === "unclear" || lean.confidence < DIRECTION_THRESHOLDS.leanMinConfidence) {
    return {
      stance: "wait",
      reason: "Jev 没有把概率集中在涨或跌上，先观望。",
    };
  }
  if (answers.conflict.noul >= DIRECTION_THRESHOLDS.conflictYes) {
    return {
      stance: "wait",
      reason: "事实同时指向两边，先观望。",
    };
  }
  if (answers.factsAgree.noul < DIRECTION_THRESHOLDS.factsAgreeYes) {
    return {
      stance: "wait",
      reason: "事实没有站到同一边，先观望。",
    };
  }
  const recentUp = (tape.change5dPct ?? 0) > 0;
  const continuation =
    (recentUp && lean.choice === "up") || (!recentUp && lean.choice === "down" && (tape.change5dPct ?? 0) < 0);
  if (answers.stretched.noul >= DIRECTION_THRESHOLDS.stretchedYes && continuation) {
    return {
      stance: "wait",
      reason: "价格已经顺着最近走势延伸，不把延续当成方向。",
    };
  }
  if (lean.choice === "up") {
    return { stance: "up", reason: "事实偏向涨，而且 Jev 的选择足够集中。" };
  }
  return { stance: "down", reason: "事实偏向跌，而且 Jev 的选择足够集中。" };
}
