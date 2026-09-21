import {
  RESEARCH_ACTION_LABEL,
  RESEARCH_NONE,
  RESEARCH_THRESHOLDS,
  type ResearchAction,
} from "@/lib/typesafe/questions";

export type ChoiceJudgment = {
  choice: string;
  confidence: number;
};

export type NoulJudgment = {
  noul: number;
};

export type ResearchJudgments = {
  action: { choice: ResearchAction; confidence: number };
  symbol: ChoiceJudgment;
  strategy: ChoiceJudgment;
  range: ChoiceJudgment;
  namesSymbol: NoulJudgment;
  namesStrategy: NoulJudgment;
  namesRange: NoulJudgment;
};

export type ResearchDecision =
  | { kind: "redirect"; href: string; reason: string }
  | { kind: "clarify"; message: string; hint: string; answers: ResearchJudgments };

export function isStated(
  noul: number,
  answer: ChoiceJudgment,
  minConfidence: number,
): boolean {
  return (
    noul >= RESEARCH_THRESHOLDS.statedYes &&
    answer.choice !== RESEARCH_NONE &&
    answer.confidence >= minConfidence
  );
}

function backtestHref(parts: {
  symbol?: string;
  strategy?: string;
  range?: string;
  run?: boolean;
}): string {
  const params = new URLSearchParams();
  if (parts.symbol) params.set("symbol", parts.symbol);
  if (parts.strategy) params.set("strategy", parts.strategy);
  if (parts.range) params.set("range", parts.range);
  if (parts.run) params.set("run", "1");
  const qs = params.toString();
  return qs ? `/backtest?${qs}` : "/backtest";
}

export function decideResearchRoute(answers: ResearchJudgments): ResearchDecision {
  const { action } = answers;
  if (action.choice === RESEARCH_NONE || action.confidence < RESEARCH_THRESHOLDS.actionMinConfidence) {
    return {
      kind: "clarify",
      message: "还不能确定你要做哪一步研究。",
      hint: "试着说清动作和标的，例如：回测苹果两年双均线。",
      answers,
    };
  }

  const symbol = isStated(
    answers.namesSymbol.noul,
    answers.symbol,
    RESEARCH_THRESHOLDS.symbolMinConfidence,
  )
    ? answers.symbol.choice
    : undefined;
  const strategy = isStated(
    answers.namesStrategy.noul,
    answers.strategy,
    RESEARCH_THRESHOLDS.strategyMinConfidence,
  )
    ? answers.strategy.choice
    : undefined;
  const range = isStated(
    answers.namesRange.noul,
    answers.range,
    RESEARCH_THRESHOLDS.rangeMinConfidence,
  )
    ? answers.range.choice
    : undefined;

  switch (action.choice) {
    case "view_market": {
      if (symbol) {
        return {
          kind: "redirect",
          href: `/markets/${encodeURIComponent(symbol)}`,
          reason: RESEARCH_ACTION_LABEL.view_market,
        };
      }
      if (answers.namesSymbol.noul >= RESEARCH_THRESHOLDS.statedYes) {
        return {
          kind: "clarify",
          message: "听得出你想看某个标的，但对不上研究宇宙里的代码。",
          hint: "用代码或中文名再说一次，例如 AAPL、英伟达、比特币。",
          answers,
        };
      }
      return {
        kind: "redirect",
        href: "/markets",
        reason: RESEARCH_ACTION_LABEL.browse_markets,
      };
    }
    case "run_backtest": {
      const href = backtestHref({
        symbol,
        strategy,
        range,
        run: Boolean(symbol && strategy),
      });
      return {
        kind: "redirect",
        href,
        reason: RESEARCH_ACTION_LABEL.run_backtest,
      };
    }
    case "browse_markets":
      return {
        kind: "redirect",
        href: "/markets",
        reason: RESEARCH_ACTION_LABEL.browse_markets,
      };
    case "browse_strategies":
      return {
        kind: "redirect",
        href: "/strategies",
        reason: RESEARCH_ACTION_LABEL.browse_strategies,
      };
    case "paper_trade":
      return {
        kind: "redirect",
        href: "/portfolio",
        reason: RESEARCH_ACTION_LABEL.paper_trade,
      };
    default:
      return {
        kind: "clarify",
        message: "还不能确定你要做哪一步研究。",
        hint: "试着说清动作和标的，例如：回测苹果两年双均线。",
        answers,
      };
  }
}
