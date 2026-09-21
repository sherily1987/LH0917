import {
  BTC_HORIZON_LABEL,
  BTC_PLAY_LABEL,
  BTC_STANCE_LABEL,
  BTC_THRESHOLDS,
  type BtcHorizon,
  type BtcPlay,
  type BtcStance,
} from "@/lib/typesafe/questions";
import type { BtcSnapshot } from "@/lib/typesafe/snapshot";

export type ChoiceJudgment = {
  choice: string;
  confidence: number;
  probabilities?: Record<string, number>;
};

export type NoulJudgment = {
  noul: number;
};

export type ScoreJudgment = {
  score: number;
  confidence: number;
  probabilities?: Record<string, number>;
};

export type BtcJudgments = {
  stance: ChoiceJudgment & { choice: BtcStance };
  play: ChoiceJudgment & { choice: BtcPlay };
  horizon: ChoiceJudgment & { choice: BtcHorizon };
  trendQuality: ScoreJudgment;
  chop: ScoreJudgment;
  stretch: ScoreJudgment;
  trendFits: NoulJudgment;
  meanReversionFits: NoulJudgment;
  skipNewRisk: NoulJudgment;
  keepInventory: NoulJudgment;
};

export type BtcDecision = {
  action: BtcStance;
  reason: string;
  play: BtcPlay;
  horizon: BtcHorizon;
  quantity: number;
  notionalUsd: number;
  paperSide: "buy" | "sell" | null;
  gated: boolean;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function rankedProbabilities(
  probabilities: Record<string, number> | undefined,
  limit = 4,
): Array<{ id: string; value: number }> {
  if (!probabilities) return [];
  return Object.entries(probabilities)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id, value]) => ({ id, value }));
}

function roundQty(value: number): number {
  return Math.floor(value * 1e6) / 1e6;
}

function roundUsd(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Code owns the workflow. Jev supplies stance, play, scores, and noul flags.
 * Confidence and skipNewRisk are starting gates for this desk, not universal rules.
 */
export function composeBtcDecision(answers: BtcJudgments, snapshot: BtcSnapshot): BtcDecision {
  const price = snapshot.market.last;
  const cash = snapshot.paper.cashUsd;
  const equity = snapshot.paper.equityUsd;
  const held = snapshot.paper.btcQuantity;
  const play: BtcPlay =
    answers.play.choice !== "cash" && answers.play.confidence >= BTC_THRESHOLDS.playMinConfidence
      ? answers.play.choice
      : "cash";
  const horizon: BtcHorizon =
    answers.horizon.confidence >= 0.45 ? answers.horizon.choice : "uncertain";

  const skip = answers.skipNewRisk.noul >= BTC_THRESHOLDS.skipNewRisk;
  const unsure = answers.stance.confidence < BTC_THRESHOLDS.stanceMinConfidence;
  const wait: BtcDecision = {
    action: "wait",
    reason: unsure
      ? "立场置信不够，代码先观望。"
      : skip
        ? "回避新风险的概率偏高，代码先不加仓。"
        : BTC_STANCE_LABEL.wait,
    play,
    horizon,
    quantity: 0,
    notionalUsd: 0,
    paperSide: null,
    gated: unsure || skip,
  };

  if (unsure || answers.stance.choice === "wait") {
    return {
      ...wait,
      reason: unsure ? wait.reason : "Jev 倾向观望，代码不改仓。",
      gated: unsure,
    };
  }

  if (answers.stance.choice === "hold") {
    return {
      action: "hold",
      reason: "维持现有 BTC 纸上仓位，不做新成交。",
      play,
      horizon,
      quantity: 0,
      notionalUsd: 0,
      paperSide: null,
      gated: false,
    };
  }

  if (answers.stance.choice === "reduce") {
    if (held <= 0) {
      return {
        ...wait,
        reason: "没有 BTC 纸上仓位可减，代码改成观望。",
        gated: true,
      };
    }
    const stretch = clamp(answers.stretch.score / 3, 0, 1);
    const sellFrac = clamp(0.35 + 0.4 * stretch + 0.35 * answers.skipNewRisk.noul, 0.25, 1);
    const quantity = roundQty(Math.max(held * sellFrac, held > 0 ? Math.min(held, 0.0001) : 0));
    return {
      action: "reduce",
      reason: `建议减持约 ${Math.round(sellFrac * 100)}% 的纸上 BTC。`,
      play,
      horizon,
      quantity,
      notionalUsd: roundUsd(quantity * price),
      paperSide: "sell",
      gated: false,
    };
  }

  if (skip) return wait;

  const investedFrac = equity > 0 ? snapshot.paper.btcNotionalUsd / equity : 0;
  const remaining = BTC_THRESHOLDS.maxEquityPct - investedFrac;
  if (remaining < BTC_THRESHOLDS.minAddPct) {
    return {
      action: "hold",
      reason: "BTC 纸上占比已接近上限，代码不再加仓。",
      play,
      horizon,
      quantity: 0,
      notionalUsd: 0,
      paperSide: null,
      gated: true,
    };
  }

  const trend = clamp(answers.trendQuality.score / 3, 0, 1);
  const stretch = clamp(answers.stretch.score / 3, 0, 1);
  const sizeFrac = clamp(
    remaining *
      (0.35 + 0.65 * trend) *
      (1 - 0.55 * stretch) *
      (1 - 0.5 * answers.skipNewRisk.noul) *
      answers.stance.confidence,
    BTC_THRESHOLDS.minAddPct,
    remaining,
  );
  const budget = Math.min(cash, equity * sizeFrac);
  const quantity = price > 0 ? roundQty(budget / price) : 0;
  if (quantity <= 0 || budget < 1) {
    return {
      ...wait,
      reason: "可用现金不够下一笔纸上买入。",
      gated: true,
    };
  }

  return {
    action: "buy",
    reason: `建议用约 ${Math.round(sizeFrac * 100)}% 净值纸上买入 BTC。`,
    play,
    horizon,
    quantity,
      notionalUsd: roundUsd(quantity * price),
    paperSide: "buy",
    gated: false,
  };
}

export function stanceCopy(decision: BtcDecision): string {
  return `${BTC_STANCE_LABEL[decision.action]} · ${BTC_PLAY_LABEL[decision.play]} · ${BTC_HORIZON_LABEL[decision.horizon]}`;
}
