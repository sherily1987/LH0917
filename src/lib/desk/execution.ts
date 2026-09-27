import { DESK_SYMBOL } from "@/lib/desk/types";

export type OrderRequest = {
  symbol: typeof DESK_SYMBOL;
  side: "buy" | "sell";
  quantity: number;
  price: number;
};

export type Fill = OrderRequest & { mode: "paper" };

export type ExecutionEnv = {
  EXCHANGE_API_KEY?: string;
  EXCHANGE_API_SECRET?: string;
  DESK_LIVE_ARM?: string;
};

export interface ExecutionAdapter {
  readonly mode: "paper" | "live";
  submit(order: OrderRequest): Fill;
}

export class PaperAdapter implements ExecutionAdapter {
  readonly mode = "paper" as const;

  submit(order: OrderRequest): Fill {
    if (order.symbol !== DESK_SYMBOL) {
      throw new Error("模拟适配器只接受 BTCUSDT。");
    }
    if (!(order.quantity > 0) || !(order.price > 0)) {
      throw new Error("模拟成交需要正的数量和价格。");
    }
    return { ...order, mode: "paper" };
  }
}

export function liveTradingRefusal(env: ExecutionEnv): string | null {
  const key = env.EXCHANGE_API_KEY?.trim();
  const secret = env.EXCHANGE_API_SECRET?.trim();
  const armed = env.DESK_LIVE_ARM === "1";
  if (!key || !secret) {
    return "实盘未启用：未配置交易所密钥。当前只做模拟交易，不会发送真实订单，也没有提币。";
  }
  if (!armed) {
    return "实盘未启用：DESK_LIVE_ARM 未打开。当前只做模拟交易，不会发送真实订单，也没有提币。";
  }
  return null;
}

/**
 * Live orders stay off. Missing keys or ARM refuse immediately.
 * Even when both are present this build does not call an exchange.
 */
export class LiveAdapter implements ExecutionAdapter {
  readonly mode = "live" as const;
  private readonly env: ExecutionEnv;

  constructor(env?: ExecutionEnv) {
    this.env = env ?? {
      EXCHANGE_API_KEY: process.env.EXCHANGE_API_KEY,
      EXCHANGE_API_SECRET: process.env.EXCHANGE_API_SECRET,
      DESK_LIVE_ARM: process.env.DESK_LIVE_ARM,
    };
  }

  submit(order: OrderRequest): Fill {
    if (order.symbol !== DESK_SYMBOL) {
      throw new Error("实盘适配器只接受 BTCUSDT，且本版本不会发送订单。");
    }
    const refused = liveTradingRefusal(this.env);
    if (refused) throw new Error(refused);
    throw new Error("已检测到密钥和 ARM，但本版本仍禁止向交易所发送订单。没有提币功能。");
  }
}

export function createExecutionAdapter(mode: "paper" | "live" = "paper", env?: ExecutionEnv): ExecutionAdapter {
  if (mode === "live") return new LiveAdapter(env);
  return new PaperAdapter();
}
