/** OKX USDT-margined perpetual, regular user, taker. */
export const OKX_TAKER_FEE = 0.0005;

/** Adverse fill added on top of the bar price. */
export const OKX_SLIPPAGE = 0.0002;

export const OKX_COSTS: FillCosts = {
  feePct: OKX_TAKER_FEE,
  slippagePct: OKX_SLIPPAGE,
};

export const HOLDOUT_DAYS = 14;
export const SELECTION_DAYS = 46;
export const LIVE_DRAWDOWN_CAP = 0.05;

export type FillCosts = {
  feePct: number;
  slippagePct: number;
};

export function adversePrice(price: number, side: "buy" | "sell", slippagePct: number): number {
  if (!(slippagePct > 0)) return price;
  return side === "buy" ? price * (1 + slippagePct) : price * (1 - slippagePct);
}

export function feeOnNotional(price: number, quantity: number, feePct: number): number {
  if (!(feePct > 0)) return 0;
  return price * quantity * feePct;
}

/**
 * Buy-and-hold return after one entry and one exit.
 * `fraction` is the share of equity spent, including the entry fee.
 * The rest stays in cash. Slippage worsens both prices.
 */
export function holdReturn(
  startPrice: number,
  endPrice: number,
  fraction: number,
  costs: FillCosts,
): number {
  if (!(startPrice > 0) || !(endPrice > 0) || !(fraction > 0)) return 0;
  const entry = adversePrice(startPrice, "buy", costs.slippagePct);
  const exit = adversePrice(endPrice, "sell", costs.slippagePct);
  const coinCash = fraction / (1 + Math.max(0, costs.feePct));
  const units = coinCash / entry;
  const endEquity = 1 - fraction + units * exit * (1 - Math.max(0, costs.feePct));
  return endEquity - 1;
}

export function liveGateDecision(input: {
  returnPct: number;
  hold20Pct: number;
  maxDrawdownPct: number;
}): { liveEligible: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (!(input.returnPct > 0)) reasons.push("最后 14 天扣成本后收益不大于 0。");
  if (input.returnPct < input.hold20Pct) reasons.push("最后 14 天扣成本后没有跑赢两成仓位的买入持有。");
  if (input.maxDrawdownPct > LIVE_DRAWDOWN_CAP) reasons.push("最后 14 天最大回撤超过净值的 5%。");
  return { liveEligible: reasons.length === 0, reasons };
}
