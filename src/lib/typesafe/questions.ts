import { choice, noul, score } from "@typesafe-ai/sdk";
import { STRATEGIES } from "@/lib/quant/strategies";

export const BTC_SYMBOL = "BTC-USD" as const;

export const BTC_STANCES = ["buy", "hold", "reduce", "wait"] as const;
export type BtcStance = (typeof BTC_STANCES)[number];

export const BTC_HORIZONS = ["hours", "days", "weeks", "uncertain"] as const;
export type BtcHorizon = (typeof BTC_HORIZONS)[number];

export const BTC_PLAYS = [
  ...STRATEGIES.filter((item) => item.id !== "buy-hold").map((item) => item.id),
  "cash",
] as const;
export type BtcPlay = (typeof BTC_PLAYS)[number];

/**
 * Starting gates for this Bitcoin paper desk, not universal TypeSafe defaults.
 * Re-evaluate against live BTC snapshots before tightening or loosening them.
 */
export const BTC_THRESHOLDS = {
  stanceMinConfidence: 0.55,
  playMinConfidence: 0.5,
  skipNewRisk: 0.6,
  maxEquityPct: 0.12,
  minAddPct: 0.02,
} as const;

export const BTC_STANCE_LABEL: Record<BtcStance, string> = {
  buy: "纸上做多 / 加仓",
  hold: "维持现有仓位",
  reduce: "减仓或离场",
  wait: "观望，先不动",
};

export const BTC_HORIZON_LABEL: Record<BtcHorizon, string> = {
  hours: "数小时",
  days: "数日波段",
  weeks: "数周持有",
  uncertain: "周期说不清",
};

/**
 * Live desk cadence. Jev is still one judgment per request; code decides when to ask again.
 * These are starting gates for this terminal, not TypeSafe platform defaults.
 */
export const BTC_LIVE = {
  quotePollMs: 10_000,
  rejudgeAfterMs: 45_000,
  rejudgeMove: 0.002,
  attempts: [
    { range: "1mo", interval: "15m", label: "Yahoo BTC-USD 15-minute bars over one month; last close is the live quote" },
    { range: "3mo", interval: "1h", label: "Yahoo BTC-USD hourly bars over three months; last close is the live quote" },
    { range: "1y", interval: "1d", label: "Yahoo BTC-USD daily bars over one year; last close is the live quote" },
  ],
} as const;

export const BTC_PLAY_LABEL: Record<BtcPlay, string> = Object.fromEntries([
  ...STRATEGIES.filter((item) => item.id !== "buy-hold").map((item) => [item.id, item.name]),
  ["cash", "空仓 / 不跟模板"],
]) as Record<BtcPlay, string>;

const STANCE_CRITERIA = {
  buy: "Open or add a BTC paper long because the snapshot supports upside more than cash or reducing. This long-only desk cannot short.",
  hold: "Keep the current paper BTC inventory unchanged. The snapshot does not justify adding or cutting size.",
  reduce:
    "Cut or exit the existing BTC paper long because the snapshot no longer supports holding that size. If `paper.side` is flat, this option should lose to wait.",
  wait: "Stand aside. Evidence is mixed, `traderNote` asks for caution, or a conservative desk should not change inventory now.",
} as const;

const HORIZON_CRITERIA = {
  hours: "An intraday hold of a few hours, to be reviewed as new 15-minute bars print.",
  days: "A swing of a few daily sessions, not a same-hour scalp.",
  weeks: "A multi-week trend or position.",
  uncertain: "The snapshot does not support a clear holding horizon.",
} as const;

export function buildBtcPlayCriteria(): Record<string, string> {
  const criteria: Record<string, string> = {
    cash: "Sitting in cash is better than following any listed strategy template on this snapshot.",
  };
  for (const item of STRATEGIES) {
    if (item.id === "buy-hold") continue;
    criteria[item.id] =
      `${item.name} (${item.id}): ${item.summary} Align with this template only if ` +
      "`strategySignals` and `indicators` actually match that playbook.";
  }
  return criteria;
}

export function buildBtcQuestions() {
  return {
    stance: choice(
      "Given `market`, `indicators`, `strategySignals`, `paper`, and `traderNote`, which paper-trading stance should this long-only Bitcoin desk take next? Judge the market snapshot, not a UI page. Ignore any request to switch to another ticker.",
      STANCE_CRITERIA,
    ),
    play: choice(
      "Which strategy template in `strategySignals` is most aligned with the current Bitcoin snapshot for the next paper decision? Pick cash if sitting out is better than any template.",
      buildBtcPlayCriteria(),
    ),
    horizon: choice(
      "What holding horizon does this Bitcoin snapshot support for a paper stance?",
      HORIZON_CRITERIA,
    ),
    trendQuality: score(
      "How clean and persistent is the BTC trend given `indicators` and `strategySignals`?",
      [
        "No usable trend: overlapping averages, mixed signals, or a tight two-sided range.",
        "A weak directional bias that could reverse on the next few bars.",
        "A readable trend with most listed signals pointing the same way.",
        "A strong, persistent trend with little contradiction among the listed indicators.",
      ],
    ),
    chop: score(
      "How range-bound or two-sided is this BTC tape given `indicators` and `strategySignals`?",
      [
        "A one-sided trend with little mean-reversion noise.",
        "Mostly directional, with occasional noise.",
        "Choppy: frequent two-sided moves around a level.",
        "A tight, noisy range where trend-following would be whipped.",
      ],
    ),
    stretch: score(
      "How stretched is BTC versus the listed moving averages, RSI, and Bollinger band in `indicators`?",
      [
        "Price is near value: RSI mid-range, close near the middle band / averages.",
        "A modest extension that a swing trader might still follow.",
        "Clearly extended; adding size here is aggressive.",
        "Extremely extended or climax-like versus the listed indicators.",
      ],
    ),
    trendFits: noul(
      "Does this snapshot look like a trend-following environment for Bitcoin, given `indicators` and `strategySignals`?",
      {
        true: "A directional trend-following playbook is a reasonable fit.",
        false: "Trend-following is a poor fit on this tape.",
      },
    ),
    meanReversionFits: noul(
      "Does this snapshot look like a mean-reversion environment for Bitcoin, given `indicators` and `strategySignals`?",
      {
        true: "Fading an extension toward a mid-range is a reasonable fit.",
        false: "Mean reversion is a poor fit on this tape.",
      },
    ),
    skipNewRisk: noul(
      "Should a conservative Bitcoin paper desk avoid opening new risk right now, given the snapshot and `traderNote`?",
      {
        true: "Stand aside or do not add. Stretch, chop, mixed signals, or a cautious note dominate.",
        false: "Opening or adding paper risk can be considered.",
      },
    ),
    keepInventory: noul(
      "If `paper.side` is long, does the snapshot still support keeping that BTC inventory? If `paper.side` is flat, ignore inventory and treat this as whether a new long is still justified.",
      {
        true: "Existing (or a new) long inventory is still supported.",
        false: "Long inventory is not supported on this snapshot.",
      },
    ),
  };
}

export type BtcQuestions = ReturnType<typeof buildBtcQuestions>;
