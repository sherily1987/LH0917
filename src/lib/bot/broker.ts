import type { Exchange } from "ccxt";
import type { BotConfig } from "@/lib/bot/config";
import { baseAsset, connectExchange, fetchExchangeBalances, fetchExchangeCandles, toPair } from "@/lib/bot/exchange";
import { featuresFromCandles } from "@/lib/bot/features";
import type { Account, Fill, Holding, MarketFeatures, PlannedOrder, Snapshot } from "@/lib/bot/types";
import { getOHLCV } from "@/lib/market/data";

export type Broker = {
  snapshot(symbols: string[]): Promise<Snapshot>;
  syncAccount(previous: Account | null, prices: Record<string, number>): Promise<Account>;
  execute(orders: PlannedOrder[], account: Account, prices: Record<string, number>): Promise<{ fills: Fill[]; account: Account }>;
};

export function utcDate(time = Date.now()): string {
  return new Date(time).toISOString().slice(0, 10);
}

function orderId(order: PlannedOrder, index: number): string {
  return `lhq${Date.now().toString(36)}${index}${order.side[0]}`;
}

export function applyFill(account: Account, fill: Fill): Account {
  const holdings: Holding[] = account.holdings.map((h) => ({ ...h }));
  const current = holdings.find((h) => h.symbol === fill.symbol);
  const notional = fill.quantity * fill.price;
  let cash = account.cash;
  if (fill.side === "buy") {
    cash -= notional + fill.fee;
    if (current) {
      const quantity = current.quantity + fill.quantity;
      current.avgPrice = (current.avgPrice * current.quantity + notional) / quantity;
      current.quantity = quantity;
    } else {
      holdings.push({ symbol: fill.symbol, quantity: fill.quantity, avgPrice: fill.price });
    }
  } else if (current) {
    cash += notional - fill.fee;
    current.quantity = Math.max(0, current.quantity - fill.quantity);
  }
  return { ...account, cash, holdings: holdings.filter((h) => h.quantity > 1e-12) };
}

export function paperBroker(config: BotConfig): Broker {
  return {
    async snapshot(symbols) {
      const series = await Promise.all(symbols.map((symbol) => getOHLCV(symbol, "6mo", "1d")));
      const markets = series
        .map((s) => featuresFromCandles(s.symbol, s.candles))
        .filter((m): m is MarketFeatures => m !== null);
      return { source: series.every((s) => s.source === "yahoo") ? "yahoo" : "synthetic", markets };
    },
    async syncAccount(previous) {
      if (previous?.mode === "paper") return previous;
      const cash = config.paperStartingCash;
      return { mode: "paper", cash, holdings: [], peakEquity: cash, day: { date: utcDate(), openEquity: cash } };
    },
    async execute(orders, account) {
      const fills: Fill[] = [];
      let next = account;
      orders.forEach((order, index) => {
        const price = order.price * (order.side === "buy" ? 1 + config.slippage : 1 - config.slippage);
        const fill: Fill = {
          id: orderId(order, index),
          symbol: order.symbol,
          side: order.side,
          quantity: order.quantity,
          price,
          fee: order.quantity * price * config.feeRate,
          status: "filled",
        };
        next = applyFill(next, fill);
        fills.push(fill);
      });
      return { fills, account: next };
    },
  };
}

export function liveBroker(config: BotConfig): Broker {
  let exchange: Exchange | null = null;
  const quote = config.exchange.quote;
  const connect = async () => (exchange ??= await connectExchange(config.exchange));

  async function readAccount(previous: Account | null, prices: Record<string, number>, symbols: string[]): Promise<Account> {
    const ex = await connect();
    const { cash, units } = await fetchExchangeBalances(ex, quote, symbols.map(baseAsset));
    const holdings = symbols
      .filter((symbol) => units[baseAsset(symbol)] * (prices[symbol] ?? 0) >= 1)
      .map((symbol) => ({
        symbol,
        quantity: units[baseAsset(symbol)],
        avgPrice: previous?.holdings.find((h) => h.symbol === symbol)?.avgPrice ?? prices[symbol],
      }));
    const equity = cash + holdings.reduce((sum, h) => sum + h.quantity * prices[h.symbol], 0);
    return {
      mode: "live",
      cash,
      holdings,
      peakEquity: previous?.mode === "live" ? previous.peakEquity : equity,
      day: previous?.mode === "live" ? previous.day : { date: utcDate(), openEquity: equity },
    };
  }

  let tracked: string[] = [];

  return {
    async snapshot(symbols) {
      const ex = await connect();
      tracked = symbols.filter((symbol) => ex.markets?.[toPair(symbol, quote)]);
      const markets = await Promise.all(
        tracked.map(async (symbol) => featuresFromCandles(symbol, await fetchExchangeCandles(ex, toPair(symbol, quote)))),
      );
      return { source: "exchange", markets: markets.filter((m): m is MarketFeatures => m !== null) };
    },
    syncAccount: (previous, prices) => readAccount(previous, prices, tracked),
    async execute(orders, account, prices) {
      const ex = await connect();
      const fills: Fill[] = [];
      for (const [index, order] of orders.entries()) {
        const pair = toPair(order.symbol, quote);
        const id = orderId(order, index);
        const base = { id, symbol: order.symbol, side: order.side, price: order.price, fee: 0 } as const;
        try {
          const minCost = ex.markets?.[pair]?.limits?.cost?.min;
          if (minCost && order.notional < minCost) throw new Error(`低于交易所最小下单额 ${minCost} ${quote}`);
          const amount = Number(ex.amountToPrecision(pair, order.quantity));
          if (!(amount > 0)) throw new Error("数量低于交易所精度");
          const placed = await ex.createOrder(pair, "market", order.side, amount, undefined, { clientOrderId: id });
          fills.push({
            ...base,
            quantity: placed.filled ?? amount,
            price: placed.average ?? placed.price ?? order.price,
            fee: placed.fee?.currency === quote ? (placed.fee.cost ?? 0) : 0,
            status: "filled",
          });
        } catch (error) {
          fills.push({ ...base, quantity: order.quantity, status: "failed", error: error instanceof Error ? error.message : String(error) });
        }
      }
      const local = fills.filter((f) => f.status === "filled").reduce(applyFill, account);
      const synced = await readAccount(local, prices, tracked);
      return { fills, account: { ...synced, peakEquity: account.peakEquity, day: account.day } };
    },
  };
}

export function createBroker(config: BotConfig): Broker {
  return config.mode === "live" ? liveBroker(config) : paperBroker(config);
}
