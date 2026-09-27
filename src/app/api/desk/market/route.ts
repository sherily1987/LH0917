import { getOHLCV, getQuotes } from "@/lib/market/data";

export const dynamic = "force-dynamic";

export async function GET() {
  const headers = { "Cache-Control": "no-store, max-age=0" };
  const [series, quoteResult] = await Promise.all([
    getOHLCV("BTC-USD", "6mo", "1d", { fresh: true }),
    getQuotes(["BTC-USD"], { fresh: true }),
  ]);
  const quote = quoteResult.quotes[0];
  const price = quote && quote.price > 0 ? quote.price : series.quote.price;
  const source = quoteResult.source === "yahoo" || series.source === "yahoo" ? "yahoo" : series.source;
  const candles = series.candles.slice(-180).map((candle) => ({
    time: candle.time,
    high: candle.high,
    low: candle.low,
    close: candle.close,
  }));
  if (!(price > 0) || candles.length === 0) {
    return Response.json({ error: "暂时没有 BTC 行情。" }, { status: 502, headers });
  }
  return Response.json(
    {
      symbol: "BTCUSDT",
      price,
      time: Math.floor(Date.now() / 1000),
      source,
      candles,
    },
    { headers },
  );
}
