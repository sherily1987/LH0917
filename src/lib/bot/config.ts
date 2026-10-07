export type BotMode = "paper" | "live";

export type RiskLimits = {
  /** Largest single buy, as a fraction of total equity. */
  maxOrderPct: number;
  /** Largest holding in any one coin, as a fraction of total equity. */
  maxPositionPct: number;
  /** Cash that must stay uninvested, as a fraction of total equity. */
  minCashPct: number;
  /** Buys stop for the rest of the UTC day once equity falls this far below the day's open. */
  maxDailyLossPct: number;
  /** Buys stop until reset once equity falls this far below its peak. */
  maxDrawdownPct: number;
  /** Orders below this notional are skipped; exchanges reject dust. */
  minOrderUsd: number;
};

export type BotConfig = {
  enabled: boolean;
  mode: BotMode;
  model: string;
  paperStartingCash: number;
  feeRate: number;
  slippage: number;
  limits: RiskLimits;
  exchange: {
    id: string;
    quote: string;
    sandbox: boolean;
    apiKey?: string;
    secret?: string;
    password?: string;
  };
};

function num(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name];
  if (raw == null || raw.trim() === "") return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function flag(name: string, fallback: boolean): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) return fallback;
  return raw === "true" || raw === "1" || raw === "yes";
}

export function readBotConfig(): BotConfig {
  return {
    enabled: flag("BOT_ENABLED", true),
    mode: process.env.BOT_MODE?.trim().toLowerCase() === "live" ? "live" : "paper",
    model: process.env.BOT_MODEL?.trim() || "spacexai/grok-4.7",
    paperStartingCash: num("BOT_PAPER_CASH", 10_000, 100, 100_000_000),
    feeRate: num("BOT_FEE_RATE", 0.001, 0, 0.01),
    slippage: num("BOT_SLIPPAGE", 0.0005, 0, 0.02),
    limits: {
      maxOrderPct: num("BOT_MAX_ORDER_PCT", 0.1, 0.001, 1),
      maxPositionPct: num("BOT_MAX_POSITION_PCT", 0.3, 0.001, 1),
      minCashPct: num("BOT_MIN_CASH_PCT", 0.2, 0, 1),
      maxDailyLossPct: num("BOT_MAX_DAILY_LOSS_PCT", 0.05, 0.001, 1),
      maxDrawdownPct: num("BOT_MAX_DRAWDOWN_PCT", 0.2, 0.001, 1),
      minOrderUsd: num("BOT_MIN_ORDER_USD", 10, 0, 1_000_000),
    },
    exchange: {
      id: process.env.BOT_EXCHANGE?.trim().toLowerCase() || "okx",
      quote: process.env.BOT_QUOTE?.trim().toUpperCase() || "USDT",
      sandbox: flag("BOT_EXCHANGE_SANDBOX", true),
      apiKey: process.env.EXCHANGE_API_KEY?.trim() || undefined,
      secret: process.env.EXCHANGE_API_SECRET?.trim() || undefined,
      password: process.env.EXCHANGE_API_PASSWORD?.trim() || undefined,
    },
  };
}
