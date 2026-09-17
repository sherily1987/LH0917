"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { getQuotes } from "@/lib/market/data";
import { isAllowedSymbol } from "@/lib/market/universe";
import { EMPTY_PAPER, type PaperState } from "@/app/portfolio/paper";

const COOKIE = "lh-quant-paper";

export async function readPaperState(): Promise<PaperState> {
  const store = await cookies();
  const raw = store.get(COOKIE)?.value;
  if (!raw) return EMPTY_PAPER;
  try {
    const parsed = JSON.parse(raw) as PaperState;
    if (!parsed || typeof parsed.cash !== "number") return EMPTY_PAPER;
    return {
      cash: parsed.cash,
      positions: Array.isArray(parsed.positions) ? parsed.positions : [],
      orders: Array.isArray(parsed.orders) ? parsed.orders.slice(0, 20) : [],
    };
  } catch {
    return EMPTY_PAPER;
  }
}

async function writePaperState(state: PaperState) {
  const store = await cookies();
  store.set(COOKIE, JSON.stringify(state), { path: "/", httpOnly: false, sameSite: "lax" });
  revalidatePath("/portfolio");
}

function applyTrade(state: PaperState, side: "buy" | "sell", symbol: string, quantity: number, price: number) {
  const notional = quantity * price;
  const positions = state.positions.map((item) => ({ ...item }));
  const index = positions.findIndex((item) => item.symbol === symbol);
  const current = index >= 0 ? positions[index] : null;
  let cash = state.cash;

  if (side === "buy") {
    if (cash < notional) return { ok: false as const, message: "现金不足", state };
    if (current) {
      const totalQty = current.quantity + quantity;
      current.avgPrice = (current.avgPrice * current.quantity + notional) / totalQty;
      current.quantity = totalQty;
    } else {
      positions.push({ symbol, quantity, avgPrice: price });
    }
    cash -= notional;
  } else {
    if (!current || current.quantity < quantity) {
      return { ok: false as const, message: "可卖数量不足", state };
    }
    current.quantity -= quantity;
    cash += notional;
  }

  const nextPositions = positions.filter((item) => item.quantity > 0);
  const next: PaperState = {
    cash,
    positions: nextPositions,
    orders: [
      {
        id: `${Date.now()}`,
        time: Date.now(),
        symbol,
        side,
        quantity,
        price,
      },
      ...state.orders,
    ].slice(0, 20),
  };
  return { ok: true as const, message: `${side === "buy" ? "买入" : "卖出"} ${quantity} ${symbol}`, state: next };
}

export async function tradeAction(formData: FormData) {
  const symbol = String(formData.get("symbol") ?? "").toUpperCase();
  const side = formData.get("side") === "sell" ? "sell" : "buy";
  const quantity = Number(formData.get("quantity"));
  if (!isAllowedSymbol(symbol) || !Number.isFinite(quantity) || quantity <= 0) {
    return;
  }
  const { quotes } = await getQuotes([symbol]);
  const quote = quotes[0];
  if (!quote?.price) return;
  const current = await readPaperState();
  const result = applyTrade(current, side, symbol, quantity, quote.price);
  if (result.ok) await writePaperState(result.state);
}

export async function resetPaperAction() {
  await writePaperState(EMPTY_PAPER);
}
