import type { Exchange } from "ccxt";
import type { BotConfig } from "@/lib/bot/config";
import type { Candle } from "@/lib/quant/types";

/** Maps a terminal symbol such as `BTC-USD` to an exchange pair such as `BTC/USDT`. */
export function toPair(symbol: string, quote: string): string {
  return `${symbol.split("-")[0]}/${quote}`;
}

export function baseAsset(symbol: string): string {
  return symbol.split("-")[0];
}

export async function connectExchange(config: BotConfig["exchange"]): Promise<Exchange> {
  if (!config.apiKey || !config.secret) {
    throw new Error("实盘模式需要 EXCHANGE_API_KEY 和 EXCHANGE_API_SECRET");
  }
  const ccxt = (await import("ccxt")).default as unknown as Record<string, new (options: object) => Exchange>;
  const ExchangeClass = ccxt[config.id];
  if (typeof ExchangeClass !== "function") {
    throw new Error(`ccxt 不支持交易所 ${config.id}`);
  }
  const exchange = new ExchangeClass({
    apiKey: config.apiKey,
    secret: config.secret,
    password: config.password,
    enableRateLimit: true,
  });
  if (config.sandbox) exchange.setSandboxMode(true);
  await exchange.loadMarkets();
  return exchange;
}

export async function fetchExchangeCandles(exchange: Exchange, pair: string, limit = 90): Promise<Candle[]> {
  const rows = await exchange.fetchOHLCV(pair, "1d", undefined, limit);
  return rows
    .filter((row) => row.every((value) => typeof value === "number" && Number.isFinite(value)))
    .map(([time, open, high, low, close, volume]) => ({
      time: Math.floor(Number(time) / 1000),
      open: Number(open),
      high: Number(high),
      low: Number(low),
      close: Number(close),
      volume: Number(volume),
    }));
}

/** Total units held per base asset plus free quote currency. */
export async function fetchExchangeBalances(exchange: Exchange, quote: string, bases: string[]) {
  const balance = await exchange.fetchBalance();
  const total = (balance.total ?? {}) as unknown as Record<string, number | undefined>;
  const free = (balance.free ?? {}) as unknown as Record<string, number | undefined>;
  return {
    cash: Number(free[quote] ?? 0),
    units: Object.fromEntries(bases.map((base) => [base, Number(total[base] ?? 0)])) as Record<string, number>,
  };
}
