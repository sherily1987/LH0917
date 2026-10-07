import { decideWithModel, type Decide } from "@/lib/bot/agent";
import { createBroker, utcDate, type Broker } from "@/lib/bot/broker";
import { readBotConfig, type BotConfig } from "@/lib/bot/config";
import { accountEquity, buyHalt, planOrders } from "@/lib/bot/risk";
import { getBotStore, type BotStore } from "@/lib/bot/store";
import type { Account, BotRun } from "@/lib/bot/types";
import { CRYPTO_SYMBOLS } from "@/lib/market/universe";

export type TickDeps = {
  config?: BotConfig;
  store?: BotStore;
  broker?: Broker;
  decide?: Decide;
  symbols?: string[];
};

function describeError(error: unknown): string {
  if (error instanceof Error && error.name === "GatewayAuthenticationError") {
    return "AI Gateway 未授权：本地请设置 AI_GATEWAY_API_KEY，部署到 Vercel 后会自动使用 OIDC。";
  }
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/\u001b\[[0-9;]*m/g, "").split("\n")[0].slice(0, 300);
}

function rollDay(account: Account, equity: number): Account {
  const today = utcDate();
  return {
    ...account,
    peakEquity: Math.max(account.peakEquity, equity),
    day: account.day.date === today ? account.day : { date: today, openEquity: equity },
  };
}

/** Runs one full cycle: scan the market, let the model decide, clip to risk limits, execute, persist. */
export async function runBotTick(deps: TickDeps = {}): Promise<BotRun> {
  const config = deps.config ?? readBotConfig();
  const store = deps.store ?? getBotStore();
  const decide = deps.decide ?? decideWithModel;
  const symbols = deps.symbols ?? CRYPTO_SYMBOLS;

  const run: BotRun = {
    id: `${Date.now().toString(36)}`,
    time: Date.now(),
    mode: config.mode,
    model: config.model,
    status: "ok",
    decided: [],
    rejected: [],
    fills: [],
  };

  if (!config.enabled) {
    return { ...run, status: "skipped", message: "BOT_ENABLED=false，机器人已暂停" };
  }
  if (!(await store.lock(300))) {
    return { ...run, status: "skipped", message: "上一轮还在运行" };
  }

  const state = await store.load();
  try {
    const broker = deps.broker ?? createBroker(config);
    const snapshot = await broker.snapshot(symbols);
    if (snapshot.markets.length === 0) throw new Error("没有可用的行情数据");
    run.dataSource = snapshot.source;
    const prices = Object.fromEntries(snapshot.markets.map((m) => [m.symbol, m.price]));

    const synced = await broker.syncAccount(state.account, prices);
    let account = rollDay(synced, accountEquity(synced, prices));
    const equity = accountEquity(account, prices);
    run.equityBefore = equity;

    const decision = await decide({
      model: config.model,
      snapshot,
      cash: account.cash,
      equity,
      holdings: account.holdings.map((h) => ({
        ...h,
        price: prices[h.symbol] ?? h.avgPrice,
        pnlPercent: h.avgPrice ? (prices[h.symbol] ?? h.avgPrice) / h.avgPrice - 1 : 0,
      })),
      recentRuns: state.runs,
      limits: config.limits,
      buyHalt: buyHalt(account, equity, config.limits),
    });
    run.marketView = decision.marketView;
    run.decided = decision.orders;

    const { planned, rejected } = planOrders(decision, account, prices, config.limits, config.feeRate);
    run.rejected = rejected;

    const result = await broker.execute(planned, account, prices);
    run.fills = result.fills;
    account = rollDay(result.account, accountEquity(result.account, prices));
    run.equityAfter = accountEquity(account, prices);
    if (result.fills.some((f) => f.status === "failed")) run.message = "部分订单未成交";

    await store.save({ account, runs: [run, ...state.runs] });
    return run;
  } catch (error) {
    const failed: BotRun = { ...run, status: "error", message: describeError(error) };
    await store.save({ ...state, runs: [failed, ...state.runs] });
    return failed;
  } finally {
    await store.unlock();
  }
}
