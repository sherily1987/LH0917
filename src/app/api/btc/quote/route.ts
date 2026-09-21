import { BTC_SYMBOL } from "@/lib/typesafe/questions";
import { getQuotes } from "@/lib/market/data";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const { quotes, source } = await getQuotes([BTC_SYMBOL], { revalidate: 0 });
  const quote = quotes[0];
  const headers = { "Cache-Control": "no-store, max-age=0" };
  if (!quote) {
    return Response.json({ error: "没有 BTC 报价" }, { status: 502, headers });
  }
  return Response.json(
    {
      symbol: BTC_SYMBOL,
      price: quote.price,
      changePercent: quote.changePercent,
      source,
      at: Date.now(),
    },
    { headers },
  );
}
