import type { Metadata } from "next";
import { PaperDesk } from "@/components/portfolio/paper-desk";
import { getQuotes } from "@/lib/market/data";
import { UNIVERSE } from "@/lib/market/universe";

export const metadata: Metadata = { title: "组合" };
export const revalidate = 30;

export default async function PortfolioPage() {
  const { quotes } = await getQuotes(UNIVERSE.map((item) => item.symbol));
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-medium">模拟组合</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          100 万初始资金的纸上交易账户，用最新报价成交，持仓只保存在你的浏览器里。
        </p>
      </div>
      <PaperDesk quotes={quotes} />
    </div>
  );
}
