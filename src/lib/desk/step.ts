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

export function stepDesk(input: DeskStepInput): DeskStepResult {
  const command: DeskCommand = input.command ?? "step";
  if (!COMMANDS.has(command)) throw new DeskError("不支持的指令。");
  const market = input.market;
  const risk = clampRisk(input.risk);
  const capital = normalizeCapital(input.capital ?? input.ledger?.startingCapital ?? DEFAULT_CAPITAL);
  const agentRunning = input.agentRunning !== false;
  let ledger = input.ledger ?? createLedger(capital, market.time);

  const key = command === "reset" ? `reset:${market.time}:${capital}` : `${command}:${market.time}`;
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

  const reading = readRegime(applyLivePrice(market.candles, market.price, market.time));
  ledger = rollDay(ledger, market);

  if (command === "flatten") {
    if (!ledger.position) {
      ledger = latchHalt(ledger, market.price, risk);
      return finish(ledger, market, risk, reading, key, "wait", "当前没有模拟持仓。");
    }
    ledger = closePosition(ledger, market.price, market.time, "手动平仓，按最新公开价结束模拟多单。");
    ledger = latchHalt(ledger, market.price, risk);
    return finish(ledger, market, risk, reading, key, "flatten", "手动平仓，按最新公开价结束模拟多单。");
  }

  const exitReason = exitIfNeeded(ledger, market, risk, reading.regime, agentRunning);
  if (exitReason && ledger.position) {
    ledger = closePosition(ledger, market.price, market.time, exitReason);
    ledger = latchHalt(ledger, market.price, risk);
    return finish(ledger, market, risk, reading, key, "exit", exitReason);
  }

  ledger = latchHalt(ledger, market.price, risk);

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

  const block = entryBlock(reading, agentRunning, input.veto);
  if (block) return finish(ledger, market, risk, reading, key, "wait", block);

  const equity = markEquity(ledger, market.price);
  const notional = Math.min(ledger.cash, equity * risk.positionPct);
  const quantity = roundQty(notional / market.price);
  if (!(quantity > 0) || quantity * market.price > ledger.cash + 1e-6) {
    return finish(ledger, market, risk, reading, key, "wait", "可用模拟资金不够买下一笔，等待。");
  }

  const fill = paper.submit({
    symbol: DESK_SYMBOL,
    side: "buy",
    quantity,
    price: market.price,
  });
  const reason = `趋势向上且未过度延伸，按净值的 ${pct(risk.positionPct)} 开多。这是模拟成交，不是投资建议。`;
  const buy: DeskTrade = {
    id: `buy-${market.time}`,
    time: market.time,
    side: "buy",
    quantity: fill.quantity,
    price: fill.price,
    reason,
    pnl: null,
  };
  ledger = {
    ...ledger,
    cash: roundCash(ledger.cash - fill.price * fill.quantity),
    position: {
      side: "long",
      quantity: fill.quantity,
      entryPrice: fill.price,
      openedAt: market.time,
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
  agentRunning: boolean,
): string | null {
  if (!ledger.position) return null;
  const entry = ledger.position.entryPrice;
  if (market.price <= entry * (1 - risk.stopPct)) {
    return `触发硬止损：现价较入场价下跌达到 ${pct(risk.stopPct)}，平多。`;
  }
  if (market.price >= entry * (1 + risk.takeProfitPct)) {
    return `触发止盈：现价较入场价上涨达到 ${pct(risk.takeProfitPct)}，平多。`;
  }
  if (agentRunning && regime === "down") return "趋势投票转为向下，平多。";
  return null;
}

function closePosition(ledger: DeskLedger, price: number, time: number, reason: string): DeskLedger {
  if (!ledger.position) return ledger;
  const fill = paper.submit({
    symbol: DESK_SYMBOL,
    side: "sell",
    quantity: ledger.position.quantity,
    price,
  });
  const pnl = roundCash((fill.price - ledger.position.entryPrice) * fill.quantity);
  const sell: DeskTrade = {
    id: `sell-${time}`,
    time,
    side: "sell",
    quantity: fill.quantity,
    price: fill.price,
    reason,
    pnl,
  };
  return {
    ...ledger,
    cash: roundCash(ledger.cash + fill.price * fill.quantity),
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

function entryBlock(reading: RegimeReading, agentRunning: boolean, veto: DeskStepInput["veto"]): string | null {
  if (!agentRunning) return "代理已停止，不开新仓。";
  if (veto?.blockEntry) {
    const note = veto.reason?.trim();
    return note ? `外部风控否决开仓：${note.slice(0, 120)}` : "外部风控否决开仓，等待。";
  }
  if (reading.regime !== "up") return reading.summary;
  if (reading.stretched) {
    const band = reading.bollingerPercentB;
    return `趋势向上，但布林 %B${band == null ? "" : ` 为 ${band.toFixed(2)}`}，价格过度延伸，不开新仓。`;
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
