import { DESK_SYMBOL } from "@/lib/desk/types";
import { deskExecutionMode, okxRefusal, placeOkxOrder, readOkxEnv, type OkxEnv, type OkxHttp, type OkxOrder } from "@/lib/desk/okx";

export type OrderRequest = {
  symbol: typeof DESK_SYMBOL;
  side: "buy" | "sell";
  quantity: number;
  price: number;
};

export type Fill = OrderRequest & { mode: "paper" };

export type ExecutionEnv = OkxEnv;

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

export function liveTradingRefusal(env: ExecutionEnv, liveEligible = false): string | null {
  return okxRefusal(env, liveEligible);
}

/**
 * Refuses unless OKX keys, the arm flag, the simulated flag, and the backtest gate all pass.
 * `submit` never performs network I/O. `place` sends the swap order.
 */
export class LiveAdapter implements ExecutionAdapter {
  readonly mode = "live" as const;
  private readonly env: ExecutionEnv;
  private readonly liveEligible: boolean;
  private readonly http: OkxHttp | undefined;

  constructor(env?: ExecutionEnv, liveEligible = false, http?: OkxHttp) {
    this.env = env ?? readOkxEnv(process.env);
    this.liveEligible = liveEligible;
    this.http = http;
  }

  submit(order: OrderRequest): Fill {
    if (order.symbol !== DESK_SYMBOL) {
      throw new Error("实盘适配器只接受 BTCUSDT，且本版本不会在同步路径发送订单。");
    }
    const refused = okxRefusal(this.env, this.liveEligible);
    if (refused) throw new Error(refused);
    throw new Error("同步路径不发送订单。请使用 place。没有提币功能。");
  }

  async place(order: OkxOrder): Promise<void> {
    await placeOkxOrder(order, this.env, this.liveEligible, this.http);
  }

  executionLabel(): "paper" | "okx-demo" | "okx-live" {
    return deskExecutionMode(this.env);
  }
}

export function createExecutionAdapter(mode: "paper" | "live" = "paper", env?: ExecutionEnv): ExecutionAdapter {
  if (mode === "live") return new LiveAdapter(env, false);
  return new PaperAdapter();
}
