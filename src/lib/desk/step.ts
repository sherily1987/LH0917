import { adversePrice, feeOnNotional } from "@/lib/desk/costs";
import { PaperAdapter } from "@/lib/desk/execution";
import {
  applyLivePrice,
  createLedger,
  DeskError,
  markEquity,
  normalizeLedger,
  normalizeMarket,
  rememberDecision,
  roundCash,
  roundQty,
  utcDayKey,
} from "@/lib/desk/ledger";
import { readRegime, type RegimeReading } from "@/lib/desk/regime";
import { clampRisk, normalizeCapital } from "@/lib/desk/risk";
import {
  DEFAULT_CAPITAL,
  DESK_SYMBOL,
  type DeskCommand,
  type DeskDecision,
  type DeskLedger,
  type DeskMarket,
  type DeskRegime,
  type DeskRisk,
  type DeskSides,
  type DeskStepInput,
  type DeskStepResult,
  type DeskTrade,
} from "@/lib/desk/types";

const paper = new PaperAdapter();
const COMMANDS = new Set<DeskCommand>(["step", "flatten", "reset"]);

function pct(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

function makeDecision(input: DeskDecision): DeskDecision {
  return input;
}

/**
 * Shorts are allowed only when the regime is down (at least 5 of 7 votes)
 * and Bollinger %B is strictly above 0. %B <= 0 is stretched downward.
 */
export function canEnterShort(reading: Pick<RegimeReading, "regime" | "bollingerPercentB">): boolean {
  return reading.regime === "down" && reading.bollingerPercentB != null && reading.bollingerPercentB > 0;
}

/** Two-bar mode requires the previous closed bar to show the same regime. Stops do not use this. */
export function regimeHeld(regime: DeskRegime, previous: DeskRegime | null, confirmBars: number): boolean {
  if (confirmBars <= 1) return true;
  return previous === regime;
}

export function stepDesk(input: DeskStepInput): DeskStepResult {
  const command: DeskCommand = input.command ?? "step";
  if (!COMMANDS.has(command)) throw new DeskError("不支持的指令。");
  const market = input.market;
  const risk = clampRisk(input.risk);
  const capital = normalizeCapital(input.capital ?? input.ledger?.startingCapital ?? DEFAULT_CAPITAL);
  const agentRunning = input.agentRunning !== false;
  const sides: DeskSides = input.sides === "both" ? "both" : "long";
  const confirmBars: 1 | 2 = input.confirmBars === 2 ? 2 : 1;
  const costs = input.costs ?? null;
  let ledger = input.ledger ?? createLedger(capital, market.time);

  const sideKey = sides === "both" ? ":both" : "";
  const confirmKey = confirmBars === 2 ? ":c2" : "";
  const costKey = costs ? ":cost" : "";
  const key =
    command === "reset" ? `reset:${market.time}:${capital}` : `${command}:${market.time}${sideKey}${confirmKey}${costKey}`;
  if (ledger.appliedKey === key && ledger.lastDecision) {
    return { ledger, decision: ledger.lastDecision, execution: "paper", risk };
  }

  if (command === "reset") {
    const next = createLedger(capital, market.time);
    const resetDecision = makeDecision({
      time: market.time,
      action: "wait",
      reason: "账户已按初始模拟资金重置。这是研究用的纸面账本，亏损很常见。",
      regime: "unknown",
      price: market.price,
      stretched: false,
      votes: [],
    });
    next.lastDecision = resetDecision;
    next.decisions = [resetDecision];
    next.appliedKey = key;
    return { ledger: next, decision: resetDecision, execution: "paper", risk };
  }

  const adjusted = applyLivePrice(market.candles, market.price, market.time);
  const reading = readRegime(adjusted);
  const previous = confirmBars === 2 && adjusted.length > 1 ? readRegime(adjusted.slice(0, -1)).regime : null;
  ledger = rollDay(ledger, market);

  if (command === "flatten") {
    if (!ledger.position) {
      ledger = latchHalt(ledger, market.price, risk);
      return finish(ledger, market, risk, reading, key, "wait", "当前没有模拟持仓。");
    }
    const flatReason =
      ledger.position.side === "short"
        ? "手动平仓，按最新公开价结束模拟空单。"
        : "手动平仓，按最新公开价结束模拟多单。";
    ledger = closePosition(ledger, market.price, market.time, flatReason, costs);
    ledger = latchHalt(ledger, market.price, risk);
    return finish(ledger, market, risk, reading, key, "flatten", flatReason);
  }

  const exitReason = exitIfNeeded(ledger, market, risk, reading.regime, previous, confirmBars, agentRunning);
  if (exitReason && ledger.position) {
    // Close on this bar and stop. A flip cannot open the other side until a later bar,
    // so one print is never both an exit and an entry.
    ledger = closePosition(ledger, market.price, market.time, exitReason, costs);
    ledger = latchHalt(ledger, market.price, risk);
    return finish(ledger, market, risk, reading, key, "exit", exitReason);
  }

  ledger = latchHalt(ledger, market.price, risk);

  if (ledger.position?.side === "short") {
    const hold = ledger.halted
      ? `继续持有空单。${ledger.haltReason}`
      : agentRunning
        ? `继续持有空单。未触发止损（${pct(risk.stopPct)}）、止盈（${pct(risk.takeProfitPct)}）或趋势转多。${reading.summary}`
        : "代理已停止，持仓保留。仍在检查止损和止盈；要立刻结束请平仓。";
    return finish(ledger, market, risk, reading, key, "wait", hold);
  }

  if (ledger.position) {
    const hold = ledger.halted
      ? `继续持有多单。${ledger.haltReason}`
      : agentRunning
        ? `继续持有多单。未触发止损（${pct(risk.stopPct)}）、止盈（${pct(risk.takeProfitPct)}）或趋势转空。${reading.summary}`
        : "代理已停止，持仓保留。仍在检查止损和止盈；要立刻结束请平仓。";
    return finish(ledger, market, risk, reading, key, "wait", hold);
  }

  if (ledger.halted) {
    return finish(
      ledger,
      market,
      risk,
      reading,
      key,
      "halt",
      ledger.haltReason ??
        `当日亏损已达到当日起始净值的 ${pct(risk.dailyLossPct)}，停止开新仓，直到下一 UTC 日或手动重置。`,
    );
  }

  const block = entryBlock(reading, previous, confirmBars, agentRunning, input.veto, sides);
  if (block) return finish(ledger, market, risk, reading, key, "wait", block);

  const openingShort = sides === "both" && canEnterShort(reading);
  const equity = markEquity(ledger, market.price);
  const openSide = openingShort ? "sell" : "buy";
  const fillPrice = adversePrice(market.price, openSide, costs?.slippagePct ?? 0);
  const feePct = costs?.feePct ?? 0;
  const budget = Math.min(ledger.cash, equity * risk.positionPct);
  const quantity = roundQty(openingShort ? (equity * risk.positionPct) / fillPrice : budget / (fillPrice * (1 + feePct)));
  const openFee = feeOnNotional(fillPrice, quantity, feePct);
  if (!(quantity > 0) || (!openingShort && fillPrice * quantity + openFee > ledger.cash + 1e-6)) {
    return finish(
      ledger,
      market,
      risk,
      reading,
      key,
      "wait",
      openingShort ? "可用模拟资金不够开下一笔空单，等待。" : "可用模拟资金不够买下一笔，等待。",
    );
  }

  if (openingShort) {
    const fill = paper.submit({
      symbol: DESK_SYMBOL,
      side: "sell",
      quantity,
      price: fillPrice,
    });
    const reason = `趋势向下且未过度下跌，按净值的 ${pct(risk.positionPct)} 开空。这是模拟成交，不是投资建议。`;
    const sale: DeskTrade = {
      id: `sell-${market.time}`,
      time: market.time,
      side: "sell",
      positionSide: "short",
      quantity: fill.quantity,
      price: fill.price,
      reason,
      pnl: null,
    };
    ledger = {
      ...ledger,
      cash: roundCash(ledger.cash + fill.price * fill.quantity - openFee),
      position: {
        side: "short",
        quantity: fill.quantity,
        entryPrice: fill.price,
        openedAt: market.time,
        entryFee: roundCash(openFee),
      },
      trades: [...ledger.trades, sale].slice(-80),
    };
    return finish(ledger, market, risk, reading, key, "enter", reason);
  }

  const fill = paper.submit({
    symbol: DESK_SYMBOL,
    side: "buy",
      quantity,
      price: fillPrice,
    });
  const reason = `趋势向上且未过度延伸，按净值的 ${pct(risk.positionPct)} 开多。这是模拟成交，不是投资建议。`;
  const buy: DeskTrade = {
    id: `buy-${market.time}`,
    time: market.time,
    side: "buy",
    positionSide: "long",
    quantity: fill.quantity,
    price: fill.price,
    reason,
    pnl: null,
  };
  ledger = {
    ...ledger,
    cash: roundCash(ledger.cash - fill.price * fill.quantity - openFee),
    position: {
      side: "long",
      quantity: fill.quantity,
      entryPrice: fill.price,
      openedAt: market.time,
      entryFee: roundCash(openFee),
    },
    trades: [...ledger.trades, buy].slice(-80),
  };
  return finish(ledger, market, risk, reading, key, "enter", reason);
}

function finish(
  ledger: DeskLedger,
  market: DeskMarket,
  risk: DeskRisk,
  reading: RegimeReading,
  key: string,
  action: DeskDecision["action"],
  reason: string,
): DeskStepResult {
  const nextDecision = makeDecision({
    time: market.time,
    action,
    reason,
    regime: reading.regime,
    price: market.price,
    stretched: reading.stretched,
    votes: reading.votes,
  });
  const next = rememberDecision(ledger, nextDecision, key);
  return { ledger: next, decision: nextDecision, execution: "paper", risk };
}

function rollDay(ledger: DeskLedger, market: DeskMarket): DeskLedger {
  const day = utcDayKey(market.time);
  if (ledger.dayKey === day) return ledger;
  return {
    ...ledger,
    dayKey: day,
    dayStartEquity: markEquity(ledger, market.price),
    halted: false,
    haltReason: null,
  };
}

function exitIfNeeded(
  ledger: DeskLedger,
  market: DeskMarket,
  risk: DeskRisk,
  regime: DeskRegime,
  previous: DeskRegime | null,
  confirmBars: number,
  agentRunning: boolean,
): string | null {
  if (!ledger.position) return null;
  const entry = ledger.position.entryPrice;
  if (ledger.position.side === "short") {
    if (market.price >= entry * (1 + risk.stopPct)) {
      return `触发硬止损：现价较入场价上涨达到 ${pct(risk.stopPct)}，平空。`;
    }
    if (market.price <= entry * (1 - risk.takeProfitPct)) {
      return `触发止盈：现价较入场价下跌达到 ${pct(risk.takeProfitPct)}，平空。`;
    }
    if (agentRunning && regime === "up" && regimeHeld(regime, previous, confirmBars)) {
      return confirmBars > 1 ? "趋势连续两根向上，平空。" : "趋势投票转为向上，平空。";
    }
    return null;
  }
  if (market.price <= entry * (1 - risk.stopPct)) {
    return `触发硬止损：现价较入场价下跌达到 ${pct(risk.stopPct)}，平多。`;
  }
  if (market.price >= entry * (1 + risk.takeProfitPct)) {
    return `触发止盈：现价较入场价上涨达到 ${pct(risk.takeProfitPct)}，平多。`;
  }
  if (agentRunning && regime === "down" && regimeHeld(regime, previous, confirmBars)) {
    return confirmBars > 1 ? "趋势连续两根向下，平多。" : "趋势投票转为向下，平多。";
  }
  return null;
}

function closePosition(
  ledger: DeskLedger,
  price: number,
  time: number,
  reason: string,
  costs: DeskStepInput["costs"],
): DeskLedger {
  if (!ledger.position) return ledger;
  const position = ledger.position;
  const feePct = costs?.feePct ?? 0;
  const slippagePct = costs?.slippagePct ?? 0;
  if (position.side === "short") {
    const coverPrice = adversePrice(price, "buy", slippagePct);
    const fill = paper.submit({
      symbol: DESK_SYMBOL,
      side: "buy",
      quantity: position.quantity,
      price: coverPrice,
    });
    const exitFee = feeOnNotional(fill.price, fill.quantity, feePct);
    const pnl = roundCash((position.entryPrice - fill.price) * fill.quantity - (position.entryFee ?? 0) - exitFee);
    const cover: DeskTrade = {
      id: `buy-${time}`,
      time,
      side: "buy",
      positionSide: "short",
      quantity: fill.quantity,
      price: fill.price,
      reason,
      pnl,
    };
    return {
      ...ledger,
      cash: roundCash(ledger.cash - fill.price * fill.quantity - exitFee),
      position: null,
      trades: [...ledger.trades, cover].slice(-80),
    };
  }
  const sellPrice = adversePrice(price, "sell", slippagePct);
  const fill = paper.submit({
    symbol: DESK_SYMBOL,
    side: "sell",
    quantity: position.quantity,
    price: sellPrice,
  });
  const exitFee = feeOnNotional(fill.price, fill.quantity, feePct);
  const pnl = roundCash((fill.price - position.entryPrice) * fill.quantity - (position.entryFee ?? 0) - exitFee);
  const sell: DeskTrade = {
    id: `sell-${time}`,
    time,
    side: "sell",
    positionSide: "long",
    quantity: fill.quantity,
    price: fill.price,
    reason,
    pnl,
  };
  return {
    ...ledger,
    cash: roundCash(ledger.cash + fill.price * fill.quantity - exitFee),
    position: null,
    trades: [...ledger.trades, sell].slice(-80),
  };
}

function latchHalt(ledger: DeskLedger, price: number, risk: DeskRisk): DeskLedger {
  if (ledger.halted) return ledger;
  const equity = markEquity(ledger, price);
  const loss = (ledger.dayStartEquity - equity) / ledger.dayStartEquity;
  if (loss < risk.dailyLossPct) return ledger;
  return {
    ...ledger,
    halted: true,
    haltReason: `当日亏损已达到当日起始净值的 ${pct(risk.dailyLossPct)}，停止开新仓，直到下一 UTC 日或手动重置。`,
  };
}

function entryBlock(
  reading: RegimeReading,
  previous: DeskRegime | null,
  confirmBars: number,
  agentRunning: boolean,
  veto: DeskStepInput["veto"],
  sides: DeskSides,
): string | null {
  if (!agentRunning) return "代理已停止，不开新仓。";
  if (veto?.blockEntry) {
    const note = veto.reason?.trim();
    return note ? `外部风控否决开仓：${note.slice(0, 120)}` : "外部风控否决开仓，等待。";
  }
  if (sides === "both" && reading.regime === "down") {
    if (!canEnterShort(reading)) {
      const band = reading.bollingerPercentB;
      return `趋势向下，但布林 %B${band == null ? " 不足" : ` 为 ${band.toFixed(2)}`}，价格过度下跌，不开空。`;
    }
    if (!regimeHeld(reading.regime, previous, confirmBars)) {
      return "趋势刚转向下，还差一根 15 分钟确认，不开空。";
    }
    return null;
  }
  if (reading.regime !== "up") return reading.summary;
  if (reading.stretched) {
    const band = reading.bollingerPercentB;
    return `趋势向上，但布林 %B${band == null ? "" : ` 为 ${band.toFixed(2)}`}，价格过度延伸，不开新仓。`;
  }
  if (!regimeHeld(reading.regime, previous, confirmBars)) {
    return "趋势刚转向上，还差一根 15 分钟确认，不开多。";
  }
  return null;
}

export function parseStepBody(body: unknown): DeskStepInput {
  if (!body || typeof body !== "object") throw new DeskError("请求格式不正确。");
  const record = body as Record<string, unknown>;
  const command = (record.command ?? "step") as DeskCommand;
  if (!COMMANDS.has(command)) throw new DeskError("不支持的指令。");
  const market = normalizeMarket(record.market);
  const capital = record.capital == null ? undefined : numberOrThrow(record.capital, "初始资金");
  const ledger = normalizeLedger(record.ledger ?? null, market.time, capital ?? DEFAULT_CAPITAL);
  return {
    ledger,
    market,
    risk: parseRisk(record.risk),
    command,
    capital,
    agentRunning: record.agentRunning === undefined ? true : record.agentRunning === true,
    veto: parseVeto(record.veto),
  };
}

function numberOrThrow(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new DeskError(`${label}不是有效数字。`);
  return value;
}

function parseRisk(value: unknown): Partial<DeskRisk> | undefined {
  if (value == null) return undefined;
  if (!value || typeof value !== "object") throw new DeskError("风控参数格式不正确。");
  const raw = value as Record<string, unknown>;
  const risk: Partial<DeskRisk> = {};
  for (const key of ["positionPct", "stopPct", "takeProfitPct", "dailyLossPct"] as const) {
    if (raw[key] != null) risk[key] = numberOrThrow(raw[key], key);
  }
  return risk;
}

function parseVeto(value: unknown): DeskStepInput["veto"] {
  if (value == null) return null;
  if (!value || typeof value !== "object") throw new DeskError("风控否决格式不正确。");
  const raw = value as Record<string, unknown>;
  if (raw.blockEntry !== true) return { blockEntry: false };
  return { blockEntry: true, reason: typeof raw.reason === "string" ? raw.reason : undefined };
}
