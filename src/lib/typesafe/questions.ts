import { choice, noul } from "@typesafe-ai/sdk";
import { RANGES, type RangeKey } from "@/lib/market/query";
import { UNIVERSE } from "@/lib/market/universe";
import { STRATEGIES } from "@/lib/quant/strategies";

export const RESEARCH_NONE = "none" as const;

export const RESEARCH_ACTIONS = [
  "view_market",
  "run_backtest",
  "browse_markets",
  "browse_strategies",
  "paper_trade",
  RESEARCH_NONE,
] as const;

export type ResearchAction = (typeof RESEARCH_ACTIONS)[number];

/**
 * Starting gates for this terminal, not universal TypeSafe defaults.
 * Re-evaluate against real queries before tightening or loosening them.
 */
export const RESEARCH_THRESHOLDS = {
  actionMinConfidence: 0.55,
  symbolMinConfidence: 0.5,
  strategyMinConfidence: 0.5,
  rangeMinConfidence: 0.5,
  statedYes: 0.6,
} as const;

export const RESEARCH_ACTION_LABEL: Record<ResearchAction, string> = {
  view_market: "查看标的行情",
  run_backtest: "运行回测",
  browse_markets: "浏览行情列表",
  browse_strategies: "浏览策略库",
  paper_trade: "打开模拟组合",
  none: "无法对应",
};

export const RANGE_LABEL: Record<RangeKey, string> = {
  "1mo": "1 个月",
  "3mo": "3 个月",
  "6mo": "6 个月",
  "1y": "1 年",
  "2y": "2 年",
  "5y": "5 年",
};

const ACTION_CRITERIA = {
  view_market:
    "Open a specific instrument's quote, candles, or market detail page. The user wants to look at one named ticker, company, ETF, or crypto.",
  run_backtest:
    "Simulate a strategy on historical bars. The user wants a backtest, Sharpe, drawdown, or to try SMA, EMA, RSI, MACD, Bollinger, Donchian, momentum, or buy-and-hold.",
  browse_markets:
    "Open the market list or scan the universe without committing to one ticker. The user wants available symbols, sectors, or the tape in general.",
  browse_strategies:
    "Open the strategy library to read templates without running a backtest yet.",
  paper_trade:
    "Open the simulated / paper portfolio to buy, sell, or inspect paper positions. Fake money only.",
  none: "None of the research actions fit, the request is empty of intent, or it is unrelated to this terminal.",
} as const;

const RANGE_CRITERIA: Record<RangeKey | typeof RESEARCH_NONE, string> = {
  "1mo": "about one month of history",
  "3mo": "about three months or one quarter",
  "6mo": "about six months or half a year",
  "1y": "about one year",
  "2y": "about two years",
  "5y": "about five years",
  none: "the request does not name a lookback window",
};

export function buildResearchState(request: string) {
  return {
    request,
    universe: UNIVERSE.map((item) => ({
      symbol: item.symbol,
      name: item.name,
      nameZh: item.nameZh,
      sector: item.sector,
      assetClass: item.assetClass,
    })),
    strategies: STRATEGIES.map((item) => ({
      id: item.id,
      name: item.name,
      category: item.category,
      summary: item.summary,
    })),
    ranges: RANGES.map((id) => ({ id, label: RANGE_LABEL[id] })),
  };
}

export function buildResearchQuestions() {
  const symbolCriteria: Record<string, string> = {
    none: "No specific instrument from `universe` is named or clearly implied.",
  };
  for (const item of UNIVERSE) {
    symbolCriteria[item.symbol] =
      `${item.name} / ${item.nameZh} (${item.symbol}), ${item.sector} ${item.assetClass} in \`universe\`.`;
  }

  const strategyCriteria: Record<string, string> = {
    none: "No strategy template or indicator from `strategies` is named.",
  };
  for (const item of STRATEGIES) {
    strategyCriteria[item.id] = `${item.name} (${item.id}): ${item.summary}`;
  }

  return {
    action: choice(
      "Which research action in this terminal best matches `request`? Use only the listed actions. Pick none if the request cannot be mapped.",
      ACTION_CRITERIA,
    ),
    symbol: choice(
      "Which instrument in `universe` does `request` refer to? Pick none if no specific ticker, company, ETF, or crypto from the universe is named or clearly implied.",
      symbolCriteria,
    ),
    strategy: choice(
      "Which strategy template in `strategies` does `request` ask to use? Pick none if no strategy, indicator, or template is named.",
      strategyCriteria,
    ),
    range: choice(
      "Which lookback window in `ranges` does `request` ask for? Pick none if no time window is named.",
      RANGE_CRITERIA,
    ),
    namesSymbol: noul(
      "Does `request` name or clearly imply a specific instrument, ticker, company, ETF, or crypto that should be looked up?",
      {
        true: "A specific nameable instrument is in the request.",
        false: "The request talks about markets in general or names nothing.",
      },
    ),
    namesStrategy: noul(
      "Does `request` name a trading strategy, indicator, or template such as SMA, RSI, MACD, or buy and hold?",
      {
        true: "A strategy or indicator is named.",
        false: "No strategy template is named; a default may apply later in code.",
      },
    ),
    namesRange: noul(
      "Does `request` say how far back to look, such as one month, two years, or five years?",
      {
        true: "A lookback window is named.",
        false: "No time window is named; a default may apply later in code.",
      },
    ),
  };
}

export type ResearchQuestions = ReturnType<typeof buildResearchQuestions>;
