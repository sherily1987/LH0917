import { DESK_SYMBOL, type DeskCandle, type DeskDecision, type DeskLedger, type DeskMarket } from "@/lib/desk/types";
import { normalizeCapital } from "@/lib/desk/risk";

export class DeskError extends Error {}

export function utcDayKey(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toISOString().slice(0, 10);
}

export function roundCash(value: number): number {
  return Math.round(value * 1e8) / 1e8;
}

export function roundQty(value: number): number {
  return Math.floor(value * 1e8 + 1e-9) / 1e8;
}

export function markEquity(ledger: Pick<DeskLedger, "cash" | "position">, price: number): number {
  if (!ledger.position) return roundCash(ledger.cash);
  const marked = ledger.position.quantity * price;
  if (ledger.position.side === "short") return roundCash(ledger.cash - marked);
  return roundCash(ledger.cash + marked);
}

export function createLedger(capital: number, time: number): DeskLedger {
  const cash = roundCash(normalizeCapital(capital));
  return {
    version: 1,
    symbol: DESK_SYMBOL,
    cash,
    startingCapital: cash,
    dayStartEquity: cash,
    dayKey: utcDayKey(time),
    position: null,
    halted: false,
    haltReason: null,
    trades: [],
    equityCurve: [{ time, equity: cash }],
    decisions: [],
    lastDecision: null,
    appliedKey: "",
  };
}

export function applyLivePrice(candles: DeskCandle[], price: number, time: number): DeskCandle[] {
  if (!candles.length) return [{ time, high: price, low: price, close: price }];
  const copy = candles.map((item) => ({ ...item }));
  const last = copy[copy.length - 1];
  if (time - last.time < 86_400) {
    last.close = price;
    last.high = Math.max(last.high, price);
    last.low = Math.min(last.low, price);
    return copy;
  }
  copy.push({
    time,
    high: Math.max(last.close, price),
    low: Math.min(last.close, price),
    close: price,
  });
  return copy;
}

function numberField(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new DeskError(`${label}不是有效数字。`);
  }
  return value;
}

export function normalizeMarket(value: unknown): DeskMarket {
  if (!value || typeof value !== "object") throw new DeskError("缺少行情。");
  const market = value as Record<string, unknown>;
  const price = numberField(market.price, "价格");
  const time = numberField(market.time, "行情时间");
  if (price <= 0) throw new DeskError("价格必须大于 0。");
  if (time <= 0) throw new DeskError("行情时间无效。");
  if (!Array.isArray(market.candles)) throw new DeskError("缺少 K 线。");
  const candles: DeskCandle[] = market.candles.slice(-400).map((item, index) => {
    if (!item || typeof item !== "object") throw new DeskError(`第 ${index + 1} 根 K 线无效。`);
    const bar = item as Record<string, unknown>;
    const high = numberField(bar.high, "最高价");
    const low = numberField(bar.low, "最低价");
    const close = numberField(bar.close, "收盘价");
    const barTime = numberField(bar.time, "K 线时间");
    if (high < low || close <= 0) throw new DeskError("K 线价格无效。");
    return { time: barTime, high, low, close };
  });
  return { symbol: DESK_SYMBOL, price, time, candles };
}

export function normalizeLedger(value: unknown, time: number, capital: number): DeskLedger {
  if (value == null) return createLedger(capital, time);
  if (!value || typeof value !== "object") throw new DeskError("账本格式不正确。");
  const raw = value as Record<string, unknown>;
  if (raw.version !== 1 || raw.symbol !== DESK_SYMBOL) throw new DeskError("账本版本不受支持。");
  const cash = numberField(raw.cash, "现金");
  if (cash < 0) throw new DeskError("现金不能为负。");
  const startingCapital = normalizeCapital(numberField(raw.startingCapital, "初始资金"));
  const dayStartEquity = numberField(raw.dayStartEquity, "当日起始净值");
  if (dayStartEquity <= 0) throw new DeskError("当日起始净值必须大于 0。");
  if (typeof raw.dayKey !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(raw.dayKey)) {
    throw new DeskError("交易日无效。");
  }

  let position: DeskLedger["position"] = null;
  if (raw.position != null) {
    if (!raw.position || typeof raw.position !== "object") throw new DeskError("持仓格式不正确。");
    const pos = raw.position as Record<string, unknown>;
    if (pos.side !== "long") throw new DeskError("只接受多头或空仓。");
    const quantity = numberField(pos.quantity, "持仓数量");
    const entryPrice = numberField(pos.entryPrice, "入场价");
    const openedAt = numberField(pos.openedAt, "开仓时间");
    if (quantity <= 0 || entryPrice <= 0) throw new DeskError("持仓数量和入场价必须大于 0。");
    position = { side: "long", quantity, entryPrice, openedAt };
  }

  return {
    version: 1,
    symbol: DESK_SYMBOL,
    cash: roundCash(cash),
    startingCapital,
    dayStartEquity: roundCash(dayStartEquity),
    dayKey: raw.dayKey,
    position,
    halted: raw.halted === true,
    haltReason: typeof raw.haltReason === "string" ? raw.haltReason.slice(0, 200) : null,
    trades: Array.isArray(raw.trades) ? raw.trades.slice(-80) as DeskLedger["trades"] : [],
    equityCurve: Array.isArray(raw.equityCurve) ? raw.equityCurve.slice(-240) as DeskLedger["equityCurve"] : [],
    decisions: Array.isArray(raw.decisions) ? raw.decisions.slice(-40) as DeskLedger["decisions"] : [],
    lastDecision:
      raw.lastDecision && typeof raw.lastDecision === "object" ? (raw.lastDecision as DeskDecision) : null,
    appliedKey: typeof raw.appliedKey === "string" ? raw.appliedKey.slice(0, 80) : "",
  };
}

export function rememberDecision(ledger: DeskLedger, decision: DeskDecision, key: string): DeskLedger {
  const equity = markEquity(ledger, decision.price);
  const curve = ledger.equityCurve.slice(-239).map((point) => ({ ...point }));
  const last = curve[curve.length - 1];
  if (last && last.time === decision.time) last.equity = equity;
  else curve.push({ time: decision.time, equity });
  return {
    ...ledger,
    equityCurve: curve,
    lastDecision: decision,
    decisions: [...ledger.decisions, decision].slice(-40),
    appliedKey: key,
  };
}
