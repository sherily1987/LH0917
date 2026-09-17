import { NextRequest } from "next/server";
import { getOHLCV, getQuotes } from "@/lib/market/data";
import { isAllowedSymbol } from "@/lib/market/universe";

export const RANGES = ["1mo", "3mo", "6mo", "1y", "2y", "5y"] as const;
export const INTERVALS = ["1d", "1h", "1wk"] as const;

export type RangeKey = (typeof RANGES)[number];
export type IntervalKey = (typeof INTERVALS)[number];

const SYMBOL_RE = /^[A-Z0-9][A-Z0-9.^-]{0,15}$/;

export function normalizeSymbol(input: string): string | null {
  const symbol = decodeURIComponent(input).trim().toUpperCase();
  if (!SYMBOL_RE.test(symbol)) return null;
  return symbol;
}

export function parseRange(value: string | null): RangeKey {
  if (value && (RANGES as readonly string[]).includes(value)) return value as RangeKey;
  return "1y";
}

export function parseInterval(value: string | null): IntervalKey {
  if (value && (INTERVALS as readonly string[]).includes(value)) return value as IntervalKey;
  return "1d";
}

export async function seriesFromRequest(request: NextRequest) {
  const url = request.nextUrl;
  const symbol = normalizeSymbol(url.searchParams.get("symbol") ?? "");
  if (!symbol) return { error: "无效代码", status: 400 } as const;
  if (!isAllowedSymbol(symbol)) return { error: "暂不支持该标的", status: 404 } as const;
  const range = parseRange(url.searchParams.get("range"));
  const interval = parseInterval(url.searchParams.get("interval"));
  const series = await getOHLCV(symbol, range, interval);
  return { series, range, interval };
}

export async function quotesFromSymbols(raw: string) {
  const symbols = raw
    .split(",")
    .map((item) => normalizeSymbol(item))
    .filter((item): item is string => Boolean(item && isAllowedSymbol(item)));
  if (!symbols.length) return { error: "没有有效代码", status: 400 } as const;
  return getQuotes(symbols);
}
