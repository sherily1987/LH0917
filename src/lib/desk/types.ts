export const DESK_SYMBOL = "BTCUSDT" as const;

export const DEFAULT_CAPITAL = 10_000;

/** Fractions of equity or price. Defaults: 20% size, 2% stop, 4% take-profit, 5% daily halt. */
export type DeskRisk = {
  positionPct: number;
  stopPct: number;
  takeProfitPct: number;
  dailyLossPct: number;
  maxPositions: number;
};

export const DEFAULT_RISK: DeskRisk = {
  positionPct: 0.2,
  stopPct: 0.02,
  takeProfitPct: 0.04,
  dailyLossPct: 0.05,
  maxPositions: 1,
};

export type DeskCandle = {
  time: number;
  high: number;
  low: number;
  close: number;
};

export type DeskMarket = {
  symbol: typeof DESK_SYMBOL;
  price: number;
  time: number;
  candles: DeskCandle[];
};

export type DeskPosition = {
  side: "long" | "short";
  quantity: number;
  entryPrice: number;
  openedAt: number;
};

export type DeskTrade = {
  id: string;
  time: number;
  side: "buy" | "sell";
  /** Which book the fill opens or closes. Long-only steps only write "long". */
  positionSide: "long" | "short";
  quantity: number;
  price: number;
  reason: string;
  pnl: number | null;
};

export type EquityPoint = {
  time: number;
  equity: number;
};

export type DeskVoteName = "sma" | "ema" | "macd" | "donchian" | "roc" | "rsi" | "adx";

export type DeskVote = {
  name: DeskVoteName;
  label: string;
  vote: -1 | 0 | 1;
  detail: string;
};

export type DeskRegime = "up" | "down" | "range" | "unknown";

export type DeskAction = "enter" | "exit" | "wait" | "halt" | "flatten";

export type DeskDecision = {
  time: number;
  action: DeskAction;
  reason: string;
  regime: DeskRegime;
  price: number;
  stretched: boolean;
  votes: DeskVote[];
};

export type DeskLedger = {
  version: 1;
  symbol: typeof DESK_SYMBOL;
  cash: number;
  startingCapital: number;
  dayStartEquity: number;
  dayKey: string;
  position: DeskPosition | null;
  halted: boolean;
  haltReason: string | null;
  trades: DeskTrade[];
  equityCurve: EquityPoint[];
  decisions: DeskDecision[];
  lastDecision: DeskDecision | null;
  appliedKey: string;
};

export type DeskCommand = "step" | "flatten" | "reset";

export type DeskVeto = {
  blockEntry: boolean;
  reason?: string;
};

/**
 * "long" is the desk default: open longs only.
 * "both" is the paper replay: longs and shorts, still one position, no leverage.
 * The HTTP step parser never sets this, so /desk stays long-only.
 */
export type DeskSides = "long" | "both";

export type DeskStepInput = {
  ledger: DeskLedger | null;
  market: DeskMarket;
  risk?: Partial<DeskRisk>;
  command?: DeskCommand;
  capital?: number;
  agentRunning?: boolean;
  veto?: DeskVeto | null;
  sides?: DeskSides;
};

export type DeskStepResult = {
  ledger: DeskLedger;
  decision: DeskDecision;
  execution: "paper";
  risk: DeskRisk;
};
