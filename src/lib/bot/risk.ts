import type { RiskLimits } from "@/lib/bot/config";
import type { Account, AiDecision, PlannedOrder, RejectedOrder } from "@/lib/bot/types";

export function accountEquity(account: Account, prices: Record<string, number>): number {
  return account.cash + account.holdings.reduce((sum, h) => sum + h.quantity * (prices[h.symbol] ?? h.avgPrice), 0);
}

export function buyHalt(account: Account, equity: number, limits: RiskLimits): string | null {
  if (equity < account.day.openEquity * (1 - limits.maxDailyLossPct)) {
    return `当日亏损超过 ${(limits.maxDailyLossPct * 100).toFixed(1)}%，今日停止买入`;
  }
  if (equity < account.peakEquity * (1 - limits.maxDrawdownPct)) {
    return `净值回撤超过 ${(limits.maxDrawdownPct * 100).toFixed(1)}%，停止买入`;
  }
  return null;
}

/**
 * Turns the model's orders into executable ones. The model decides what to trade;
 * this only clips sizes to the configured hard limits and drops orders that cannot fill.
 */
export function planOrders(
  decision: AiDecision,
  account: Account,
  prices: Record<string, number>,
  limits: RiskLimits,
  feeRate: number,
): { planned: PlannedOrder[]; rejected: RejectedOrder[]; halt: string | null } {
  const equity = accountEquity(account, prices);
  const halt = buyHalt(account, equity, limits);
  const planned: PlannedOrder[] = [];
  const rejected: RejectedOrder[] = [];
  const units = new Map(account.holdings.map((h) => [h.symbol, h.quantity]));
  let cash = account.cash;

  const sells = decision.orders.filter((o) => o.side === "sell");
  const buys = decision.orders.filter((o) => o.side === "buy");

  for (const order of sells) {
    const price = prices[order.symbol];
    const held = units.get(order.symbol) ?? 0;
    if (!price) {
      rejected.push({ order, why: "没有报价" });
      continue;
    }
    if (held <= 0) {
      rejected.push({ order, why: "没有持仓可卖" });
      continue;
    }
    const fraction = Math.min(1, Math.max(0, order.size));
    const quantity = fraction >= 0.999 ? held : held * fraction;
    const notional = quantity * price;
    if (notional < limits.minOrderUsd) {
      rejected.push({ order, why: `金额低于最小下单额 $${limits.minOrderUsd}` });
      continue;
    }
    units.set(order.symbol, held - quantity);
    cash += notional * (1 - feeRate);
    planned.push({ symbol: order.symbol, side: "sell", quantity, price, notional, reason: order.reason, confidence: order.confidence });
  }

  for (const order of buys) {
    if (halt) {
      rejected.push({ order, why: halt });
      continue;
    }
    const price = prices[order.symbol];
    if (!price) {
      rejected.push({ order, why: "没有报价" });
      continue;
    }
    const held = (units.get(order.symbol) ?? 0) * price;
    const caps = [
      { value: Math.max(0, order.size) * equity, why: "AI 指定仓位" },
      { value: limits.maxOrderPct * equity, why: "单笔上限" },
      { value: limits.maxPositionPct * equity - held, why: "单币持仓上限" },
      { value: (cash - limits.minCashPct * equity) / (1 + feeRate), why: "保留现金下限" },
    ];
    const binding = caps.reduce((min, cap) => (cap.value < min.value ? cap : min));
    const notional = Math.max(0, binding.value);
    if (notional < limits.minOrderUsd) {
      rejected.push({ order, why: `受「${binding.why}」限制，可用金额不足 $${limits.minOrderUsd}` });
      continue;
    }
    const quantity = notional / price;
    units.set(order.symbol, (units.get(order.symbol) ?? 0) + quantity);
    cash -= notional * (1 + feeRate);
    planned.push({ symbol: order.symbol, side: "buy", quantity, price, notional, reason: order.reason, confidence: order.confidence });
  }

  return { planned, rejected, halt };
}
