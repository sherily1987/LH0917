import { getOHLCV, getQuotes } from "@/lib/market/data";
import { applyLiveQuote } from "@/lib/typesafe/live-policy";
import { BTC_LIVE, BTC_SYMBOL } from "@/lib/typesafe/questions";

export async function getBtcLiveMarket() {
  const fresh = { revalidate: 0 };
  const quotesPromise = getQuotes([BTC_SYMBOL], fresh);
  for (const attempt of BTC_LIVE.attempts) {
    const series = await getOHLCV(BTC_SYMBOL, attempt.range, attempt.interval, fresh);
    if (series.candles.length < 40) continue;
    const { quotes, source: quoteSource } = await quotesPromise;
    const liveQuote = quotes[0] ?? series.quote;
    return {
      series: {
        ...series,
        candles: applyLiveQuote(series.candles, liveQuote, attempt.interval),
        quote: liveQuote,
        source: quoteSource === "yahoo" || series.source === "yahoo" ? ("yahoo" as const) : series.source,
      },
      quote: liveQuote,
      interval: attempt.interval,
      range: attempt.range,
      barsLabel: attempt.label,
    };
  }

  const fallback = await getOHLCV(BTC_SYMBOL, "1y", "1d", fresh);
  const { quotes } = await quotesPromise;
  const liveQuote = quotes[0] ?? fallback.quote;
  const attempt = BTC_LIVE.attempts.at(-1)!;
  return {
    series: {
      ...fallback,
      candles: applyLiveQuote(fallback.candles, liveQuote, attempt.interval),
      quote: liveQuote,
    },
    quote: liveQuote,
    interval: attempt.interval,
    range: attempt.range,
    barsLabel: attempt.label,
  };
}
