import { syntheticCandles } from "@/lib/market/synthetic";
import { getInstrument } from "@/lib/market/universe";
import type { Candle, DataSource, Quote } from "@/lib/quant/types";

const YAHOO_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "application/json,text/plain,*/*",
};

type YahooChartResponse = {
  chart?: {
    result?: Array<{
      meta?: {
        currency?: string;
        symbol?: string;
        shortName?: string;
        regularMarketPrice?: number;
        previousClose?: number;
        chartPreviousClose?: number;
      };
      timestamp?: number[];
      indicators?: {
        quote?: Array<{
          open?: Array<number | null>;
          high?: Array<number | null>;
          low?: Array<number | null>;
          close?: Array<number | null>;
          volume?: Array<number | null>;
        }>;
      };
    }>;
    error?: unknown;
  };
};

type YahooQuoteResponse = {
  quoteResponse?: {
    result?: Array<{
      symbol?: string;
      shortName?: string;
      longName?: string;
      currency?: string;
      regularMarketPrice?: number;
      regularMarketChange?: number;
      regularMarketChangePercent?: number;
      regularMarketPreviousClose?: number;
      regularMarketOpen?: number;
      regularMarketDayHigh?: number;
      regularMarketDayLow?: number;
      regularMarketVolume?: number;
      marketCap?: number;
    }>;
  };
};

export type SeriesResult = {
  symbol: string;
  name: string;
  currency: string;
  candles: Candle[];
  quote: Quote;
  source: DataSource;
};

function quoteFromCandles(symbol: string, candles: Candle[], currency = "USD"): Quote {
  const instrument = getInstrument(symbol);
  const last = candles.at(-1);
  const prev = candles.at(-2);
  if (!last) {
    return {
      symbol: instrument.symbol,
      name: instrument.nameZh,
      currency,
      price: instrument.basePrice,
      change: 0,
      changePercent: 0,
      previousClose: instrument.basePrice,
      open: instrument.basePrice,
      high: instrument.basePrice,
      low: instrument.basePrice,
      volume: 0,
    };
  }
  const previousClose = prev?.close ?? last.open;
  const change = last.close - previousClose;
  return {
    symbol: instrument.symbol,
    name: instrument.nameZh,
    currency,
    price: last.close,
    change,
    changePercent: previousClose === 0 ? 0 : change / previousClose,
    previousClose,
    open: last.open,
    high: last.high,
    low: last.low,
    volume: last.volume,
  };
}

function parseChart(symbol: string, payload: YahooChartResponse): SeriesResult | null {
  const result = payload.chart?.result?.[0];
  const timestamps = result?.timestamp;
  const quote = result?.indicators?.quote?.[0];
  if (!result || !timestamps || !quote) return null;

  const candles: Candle[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    const open = quote.open?.[i];
    const high = quote.high?.[i];
    const low = quote.low?.[i];
    const close = quote.close?.[i];
    const volume = quote.volume?.[i];
    if (
      open == null ||
      high == null ||
      low == null ||
      close == null ||
      !Number.isFinite(open) ||
      !Number.isFinite(high) ||
      !Number.isFinite(low) ||
      !Number.isFinite(close)
    ) {
      continue;
    }
    candles.push({
      time: timestamps[i],
      open,
      high,
      low,
      close,
      volume: volume ?? 0,
    });
  }
  if (candles.length < 15) return null;

  const instrument = getInstrument(symbol);
  const meta = result.meta;
    const last = candles.at(-1)!;
    const previousClose = candles.at(-2)?.close ?? last.open;
    const price = last.close;
    const change = price - previousClose;
  return {
    symbol: instrument.symbol,
    name: instrument.nameZh,
    currency: meta?.currency ?? "USD",
    candles,
    source: "yahoo",
    quote: {
      symbol: instrument.symbol,
      name: instrument.nameZh,
      currency: meta?.currency ?? "USD",
      price,
      change,
      changePercent: previousClose === 0 ? 0 : change / previousClose,
      previousClose,
      open: last.open,
      high: last.high,
      low: last.low,
      volume: last.volume,
    },
  };
}

export type MarketFetchOptions = {
  revalidate?: number;
};

function fetchCache(revalidate: number): RequestInit {
  if (revalidate === 0) {
    return { cache: "no-store" };
  }
  return { next: { revalidate } } as RequestInit;
}

async function fetchYahooChart(
  symbol: string,
  range: string,
  interval: string,
  options?: MarketFetchOptions,
): Promise<SeriesResult | null> {
  const url = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`);
  url.searchParams.set("range", range);
  url.searchParams.set("interval", interval);
  url.searchParams.set("includePrePost", "false");
  url.searchParams.set("events", "div,splits");
  const revalidate = options?.revalidate ?? (interval === "1d" ? 300 : 60);

  const response = await fetch(url, {
    headers: YAHOO_HEADERS,
    ...fetchCache(revalidate),
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) return null;
  const payload = (await response.json()) as YahooChartResponse;
  return parseChart(symbol, payload);
}

async function fetchYahooQuotes(
  symbols: string[],
  options?: MarketFetchOptions,
): Promise<Quote[] | null> {
  if (symbols.length === 0) return [];
  const url = new URL("https://query1.finance.yahoo.com/v7/finance/quote");
  url.searchParams.set("symbols", symbols.join(","));
  const revalidate = options?.revalidate ?? 30;
  const response = await fetch(url, {
    headers: YAHOO_HEADERS,
    ...fetchCache(revalidate),
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) return null;
  const payload = (await response.json()) as YahooQuoteResponse;
  const rows = payload.quoteResponse?.result;
  if (!rows?.length) return null;

  return rows.map((row) => {
    const instrument = getInstrument(row.symbol ?? "");
    const price = row.regularMarketPrice ?? 0;
    const previousClose = row.regularMarketPreviousClose ?? price;
    const change = row.regularMarketChange ?? price - previousClose;
    return {
      symbol: instrument.symbol,
      name: instrument.nameZh,
      currency: row.currency ?? "USD",
      price,
      change,
      changePercent:
        (row.regularMarketChangePercent ?? (previousClose === 0 ? 0 : (change / previousClose) * 100)) / 100,
      previousClose,
      open: row.regularMarketOpen ?? price,
      high: row.regularMarketDayHigh ?? price,
      low: row.regularMarketDayLow ?? price,
      volume: row.regularMarketVolume ?? 0,
      marketCap: row.marketCap,
    };
  });
}

export async function getOHLCV(
  symbol: string,
  range = "1y",
  interval = "1d",
  options?: MarketFetchOptions,
): Promise<SeriesResult> {
  const instrument = getInstrument(symbol);
  try {
    const live = await fetchYahooChart(instrument.symbol, range, interval, options);
    if (live) return live;
  } catch {
    // fall through to synthetic
  }
  const candles = syntheticCandles(instrument.symbol, range);
  return {
    symbol: instrument.symbol,
    name: instrument.nameZh,
    currency: "USD",
    candles,
    quote: quoteFromCandles(instrument.symbol, candles),
    source: "synthetic",
  };
}

export async function getQuotes(
  symbols: string[],
  options?: MarketFetchOptions,
): Promise<{ quotes: Quote[]; source: DataSource }> {
  const unique = [...new Set(symbols.map((s) => getInstrument(s).symbol))];
  try {
    const live = await fetchYahooQuotes(unique, options);
    if (live && live.length) {
      const bySymbol = new Map(live.map((q) => [q.symbol, q]));
      return {
        source: "yahoo",
        quotes: unique.map((symbol) => bySymbol.get(symbol) ?? quoteFromCandles(symbol, [])),
      };
    }
  } catch {
    // fall through
  }

  const series = await Promise.all(unique.map((symbol) => getOHLCV(symbol, "3mo", "1d")));
  return {
    source: series.some((item) => item.source === "yahoo") ? "yahoo" : "synthetic",
    quotes: series.map((item) => item.quote),
  };
}
