import { createHmac } from "node:crypto";

import { DESK_SYMBOL } from "@/lib/desk/types";

export const OKX_INST_ID = "BTC-USDT-SWAP";
const OKX_ORIGIN = "https://www.okx.com";

export type OkxEnv = {
  OKX_API_KEY?: string;
  OKX_API_SECRET?: string;
  OKX_API_PASSPHRASE?: string;
  DESK_LIVE_ARM?: string;
  OKX_SIMULATED?: string;
};

export function readOkxEnv(env: NodeJS.ProcessEnv): OkxEnv {
  return {
    OKX_API_KEY: env.OKX_API_KEY,
    OKX_API_SECRET: env.OKX_API_SECRET,
    OKX_API_PASSPHRASE: env.OKX_API_PASSPHRASE,
    DESK_LIVE_ARM: env.DESK_LIVE_ARM,
    OKX_SIMULATED: env.OKX_SIMULATED,
  };
}

export type OkxOrder = {
  symbol: typeof DESK_SYMBOL;
  side: "buy" | "sell";
  quantity: number;
  reduceOnly: boolean;
  posSide: "long" | "short" | "net";
  clOrdId: string;
};

type OkxResponse = { code?: string; msg?: string; data?: Array<Record<string, string>> };

export type OkxHttp = (input: {
  method: "GET" | "POST";
  path: string;
  body?: string;
  simulated: boolean;
}) => Promise<OkxResponse>;

export function deskExecutionMode(env: OkxEnv): "paper" | "okx-demo" | "okx-live" {
  if (env.DESK_LIVE_ARM !== "1") return "paper";
  if (env.OKX_SIMULATED === "0") return "okx-live";
  if (env.OKX_SIMULATED === "1") return "okx-demo";
  return "paper";
}

export function okxRefusal(env: OkxEnv, liveEligible: boolean): string | null {
  const key = env.OKX_API_KEY?.trim();
  const secret = env.OKX_API_SECRET?.trim();
  const passphrase = env.OKX_API_PASSPHRASE?.trim();
  const mode = deskExecutionMode(env);
  if (!key || !secret || !passphrase) {
    return "实盘未启用：未配置 OKX 密钥或口令。当前只做模拟交易，不会发送真实订单，也没有提币。";
  }
  if (mode === "paper") {
    return "实盘未启用：DESK_LIVE_ARM 未打开，或没有把 OKX_SIMULATED 设为 1 或 0。不会发送订单，也没有提币。";
  }
  if (!liveEligible) {
    return "实盘门槛未通过：最后 14 天扣成本后的回测没有同时满足正收益、跑赢两成仓买入持有、回撤不超过 5%。不会向 OKX 发送订单。";
  }
  return null;
}

export function signOkx(secret: string, timestamp: string, method: string, path: string, body: string): string {
  return createHmac("sha256", secret).update(`${timestamp}${method}${path}${body}`).digest("base64");
}

export function okxHeaders(env: OkxEnv, method: string, path: string, body: string, simulated: boolean, now = new Date()): Record<string, string> {
  const timestamp = now.toISOString();
  const headers: Record<string, string> = {
    "OK-ACCESS-KEY": env.OKX_API_KEY?.trim() ?? "",
    "OK-ACCESS-SIGN": signOkx(env.OKX_API_SECRET?.trim() ?? "", timestamp, method, path, body),
    "OK-ACCESS-TIMESTAMP": timestamp,
    "OK-ACCESS-PASSPHRASE": env.OKX_API_PASSPHRASE?.trim() ?? "",
    "Content-Type": "application/json",
  };
  if (simulated) headers["x-simulated-trading"] = "1";
  return headers;
}

type Session = { posMode: "net_mode" | "long_short_mode"; ctVal: number; lotSz: number };

const sessions = new Map<string, Session>();

export async function placeOkxOrder(order: OkxOrder, env: OkxEnv, liveEligible: boolean, http: OkxHttp = defaultHttp): Promise<void> {
  const refused = okxRefusal(env, liveEligible);
  if (refused) throw new Error(refused);
  if (order.symbol !== DESK_SYMBOL) throw new Error("只接受 BTCUSDT，对应 OKX 的 BTC-USDT-SWAP。");
  const simulated = env.OKX_SIMULATED === "1";
  const session = await loadSession(env, simulated, http);
  const contracts = Math.floor(order.quantity / session.ctVal / session.lotSz) * session.lotSz;
  if (!(contracts > 0)) throw new Error("数量不足一张 OKX 合约，没有发送订单。");
  const posSide = session.posMode === "long_short_mode" && order.posSide !== "net" ? order.posSide : undefined;
  const body = JSON.stringify({
    instId: OKX_INST_ID,
    tdMode: "cross",
    side: order.side,
    ordType: "market",
    sz: String(contracts),
    clOrdId: order.clOrdId.replace(/[^A-Za-z0-9]/g, "").slice(0, 32),
    ...(posSide ? { posSide } : {}),
    ...(order.reduceOnly ? { reduceOnly: true } : {}),
  });
  const payload = await signed(env, simulated, "POST", "/api/v5/trade/order", body, http);
  if (payload.code !== "0") throw new Error(`OKX 拒绝了订单：${payload.msg || payload.code || "未知错误"}`);
}

async function loadSession(env: OkxEnv, simulated: boolean, http: OkxHttp): Promise<Session> {
  const cacheKey = `${env.OKX_API_KEY}:${simulated ? "demo" : "live"}`;
  const cached = sessions.get(cacheKey);
  if (cached) return cached;
  const config = await signed(env, simulated, "GET", "/api/v5/account/config", "", http);
  if (config.code !== "0") throw new Error(`读不到 OKX 持仓模式：${config.msg || "未知错误"}。没有发送订单。`);
  const posMode: Session["posMode"] = config.data?.[0]?.posMode === "long_short_mode" ? "long_short_mode" : "net_mode";
  const spec = await http({
    method: "GET",
    path: `/api/v5/public/instruments?instType=SWAP&instId=${OKX_INST_ID}`,
    simulated,
  });
  const ctVal = Number(spec.data?.[0]?.ctVal);
  const lotSz = Number(spec.data?.[0]?.lotSz ?? "1");
  if (!(ctVal > 0) || !(lotSz > 0)) throw new Error("读不到 BTC-USDT-SWAP 合约面值，没有发送订单。");
  if (posMode === "long_short_mode") {
    await setLeverage(env, simulated, "long", http);
    await setLeverage(env, simulated, "short", http);
  } else {
    await setLeverage(env, simulated, null, http);
  }
  const session = { posMode, ctVal, lotSz };
  sessions.set(cacheKey, session);
  return session;
}

async function setLeverage(env: OkxEnv, simulated: boolean, posSide: "long" | "short" | null, http: OkxHttp): Promise<void> {
  const body = JSON.stringify({
    instId: OKX_INST_ID,
    lever: "1",
    mgnMode: "cross",
    ...(posSide ? { posSide } : {}),
  });
  const payload = await signed(env, simulated, "POST", "/api/v5/account/set-leverage", body, http);
  if (payload.code !== "0") throw new Error(`OKX 拒绝把杠杆设为 1：${payload.msg || "未知错误"}`);
}

async function signed(
  env: OkxEnv,
  simulated: boolean,
  method: "GET" | "POST",
  path: string,
  body: string,
  http: OkxHttp,
): Promise<OkxResponse> {
  return http({ method, path, body, simulated });
}

async function defaultHttp(input: { method: "GET" | "POST"; path: string; body?: string; simulated: boolean }): Promise<OkxResponse> {
  const env = readOkxEnv(process.env);
  const body = input.body ?? "";
  const headers = okxHeaders(env, input.method, input.path, body, input.simulated);
  const response = await fetch(`${OKX_ORIGIN}${input.path}`, {
    method: input.method,
    headers,
    body: input.method === "POST" ? body : undefined,
  });
  return (await response.json()) as OkxResponse;
}

export function resetOkxSession(): void {
  sessions.clear();
}
