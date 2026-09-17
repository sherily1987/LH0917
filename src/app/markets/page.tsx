import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { MarketsBrowser } from "@/app/markets/markets-browser";
import { getQuotes } from "@/lib/market/data";
import { UNIVERSE } from "@/lib/market/universe";

export const metadata: Metadata = { title: "行情" };
export const revalidate = 60;

export default async function MarketsPage() {
  const { quotes, source } = await getQuotes(UNIVERSE.map((item) => item.symbol));
  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-medium">行情</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            覆盖美股、宽基 ETF、中概股和主流加密资产。
          </p>
        </div>
        <Badge variant="outline">{source === "yahoo" ? "Yahoo 实时" : "演示数据"}</Badge>
      </div>
      <MarketsBrowser quotes={quotes} />
    </div>
  );
}
