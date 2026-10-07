import { generateText, Output } from "ai";
import { z } from "zod";
import type { AiDecision, BotRun, Holding, Snapshot } from "@/lib/bot/types";

export type DecisionInput = {
  model: string;
  snapshot: Snapshot;
  cash: number;
  equity: number;
  holdings: Array<Holding & { price: number; pnlPercent: number }>;
  recentRuns: BotRun[];
  limits: { maxOrderPct: number; maxPositionPct: number; minCashPct: number };
  buyHalt: string | null;
};

export type Decide = (input: DecisionInput) => Promise<AiDecision>;

const INSTRUCTIONS = `你是一个全自动加密货币现货交易员，独立管理这个账户，不会有人复核你的决定。
每次被调用时，你会拿到账户状态和候选币种的日线特征，然后自己决定：买什么、卖什么、各买卖多少，或者什么都不做。

规则：
- 只做现货多头，不加杠杆，不做空。
- buy 的 size 是要花掉的资金占账户总净值的比例（0~1）；sell 的 size 是要卖出的比例，占该币当前持仓（0~1，1 表示清仓）。
- 每笔交易约有 0.1% 手续费和滑点，频繁小额换仓会亏钱。没有足够把握时，返回空的 orders。
- 系统有硬性风控：单笔上限、单币持仓上限、最低现金比例，以及当日亏损或回撤超限后禁止买入。超出的部分会被自动截断。
- 参考你最近几次的决策和成交，保持思路连贯，不要来回反复。
- marketView 和每笔 reason 用简体中文写，说清楚依据。

特征说明：return1d/7d/30d 是区间涨跌幅；rsi14 是 14 日 RSI；distSma20/distSma50 是价格相对 20/50 日均线的偏离；volatility20d 是 20 日日收益标准差；distHigh30d/distLow30d 是相对 30 日最高/最低价的距离；volumeRatio 是最近一根已收盘日线的成交量除以 20 日均量。最新一根日线通常还没收盘，price 是当前成交价。`;

export function decisionSchema(symbols: string[]) {
  const symbol = symbols.length > 0 ? z.enum(symbols as [string, ...string[]]) : z.string();
  return z.object({
    marketView: z.string().describe("对当前整体行情的判断，两三句话"),
    orders: z
      .array(
        z.object({
          symbol: symbol.describe("候选币种代码"),
          side: z.enum(["buy", "sell"]),
          size: z.number().min(0).max(1).describe("buy：占总净值比例；sell：占该币持仓比例"),
          confidence: z.number().min(0).max(1),
          reason: z.string(),
        }),
      )
      .describe("本次要执行的订单，可以为空"),
  });
}

function summarizeRuns(runs: BotRun[]) {
  return runs.slice(0, 5).map((run) => ({
    time: new Date(run.time).toISOString(),
    status: run.status,
    marketView: run.marketView,
    fills: run.fills
      .filter((f) => f.status === "filled")
      .map((f) => `${f.side} ${f.symbol} ${f.quantity.toPrecision(4)} @ ${f.price.toPrecision(6)}`),
  }));
}

export const decideWithModel: Decide = async (input) => {
  const symbols = input.snapshot.markets.map((m) => m.symbol);
  const { output } = await generateText({
    model: input.model,
    system: INSTRUCTIONS,
    prompt: JSON.stringify({
      now: new Date().toISOString(),
      dataSource: input.snapshot.source,
      account: {
        cash: Math.round(input.cash * 100) / 100,
        equity: Math.round(input.equity * 100) / 100,
        holdings: input.holdings,
      },
      limits: input.limits,
      buyHalt: input.buyHalt,
      markets: input.snapshot.markets,
      recentRuns: summarizeRuns(input.recentRuns),
    }),
    output: Output.object({ schema: decisionSchema(symbols) }),
  });
  return output;
};
