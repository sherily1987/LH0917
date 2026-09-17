import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { MetricCard } from "@/components/market/metric-card";
import { PriceChange } from "@/components/market/price-change";
import { formatNumber, formatPrice } from "@/lib/format";
import { getQuotes } from "@/lib/market/data";
import { UNIVERSE } from "@/lib/market/universe";
import { readPaperState, resetPaperAction, tradeAction } from "@/app/portfolio/actions";

export const metadata: Metadata = { title: "组合" };

const STARTING_CASH = 1_000_000;

export default async function PortfolioPage() {
  const [state, { quotes }] = await Promise.all([
    readPaperState(),
    getQuotes(UNIVERSE.map((item) => item.symbol)),
  ]);
  const quoteMap = new Map(quotes.map((quote) => [quote.symbol, quote]));
  const positions = state.positions.map((position) => {
    const price = quoteMap.get(position.symbol)?.price ?? position.avgPrice;
    const marketValue = position.quantity * price;
    const cost = position.quantity * position.avgPrice;
    return {
      ...position,
      price,
      marketValue,
      pnl: marketValue - cost,
      pnlPercent: cost === 0 ? 0 : marketValue / cost - 1,
    };
  });
  const equity = state.cash + positions.reduce((sum, item) => sum + item.marketValue, 0);
  const pnl = equity - STARTING_CASH;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-medium">模拟组合</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          100 万初始资金的纸上交易账户，按最新报价成交，持仓保存在浏览器 Cookie 中。
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <MetricCard label="净值" value={formatPrice(equity)} />
        <MetricCard label="累计盈亏" value={formatPrice(pnl)} tone={pnl >= 0 ? "up" : "down"} />
        <MetricCard label="现金" value={formatPrice(state.cash)} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>下单</CardTitle>
          <CardDescription>按最新报价即时成交。</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={tradeAction} className="grid gap-3 md:grid-cols-[1fr_140px_auto_auto] md:items-end">
            <div className="space-y-1.5">
              <Label htmlFor="symbol">标的</Label>
              <NativeSelect id="symbol" name="symbol" defaultValue="AAPL">
                {UNIVERSE.map((item) => (
                  <option key={item.symbol} value={item.symbol}>
                    {item.symbol} · {item.nameZh}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="quantity">数量</Label>
              <Input id="quantity" name="quantity" type="number" min={1} defaultValue={10} />
            </div>
            <Button type="submit" name="side" value="buy">
              买入
            </Button>
            <Button type="submit" name="side" value="sell" variant="outline">
              卖出
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>持仓</CardTitle>
          <CardDescription>用当前行情标记市值。</CardDescription>
          <CardAction>
            <form action={resetPaperAction}>
              <Button type="submit" variant="ghost" size="sm">
                重置账户
              </Button>
            </form>
          </CardAction>
        </CardHeader>
        <CardContent>
          {positions.length === 0 ? (
            <p className="text-sm text-muted-foreground">暂无持仓。</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>代码</TableHead>
                  <TableHead className="text-right">数量</TableHead>
                  <TableHead className="text-right">成本</TableHead>
                  <TableHead className="text-right">现价</TableHead>
                  <TableHead className="text-right">市值</TableHead>
                  <TableHead className="text-right">盈亏</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {positions.map((position) => (
                  <TableRow key={position.symbol}>
                    <TableCell className="font-mono">
                      <Link href={`/markets/${encodeURIComponent(position.symbol)}`} className="hover:underline">
                        {position.symbol}
                      </Link>
                    </TableCell>
                    <TableCell className="text-right font-mono">{formatNumber(position.quantity, 2)}</TableCell>
                    <TableCell className="text-right font-mono">{formatPrice(position.avgPrice)}</TableCell>
                    <TableCell className="text-right font-mono">{formatPrice(position.price)}</TableCell>
                    <TableCell className="text-right font-mono">{formatPrice(position.marketValue)}</TableCell>
                    <TableCell className="text-right">
                      <div className="font-mono">{formatPrice(position.pnl)}</div>
                      <PriceChange value={position.pnlPercent} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>成交记录</CardTitle>
        </CardHeader>
        <CardContent>
          {state.orders.length === 0 ? (
            <p className="text-sm text-muted-foreground">还没有下过单。</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>时间</TableHead>
                  <TableHead>方向</TableHead>
                  <TableHead>代码</TableHead>
                  <TableHead className="text-right">数量</TableHead>
                  <TableHead className="text-right">价格</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {state.orders.map((order) => (
                  <TableRow key={order.id}>
                    <TableCell className="font-mono">
                      {new Date(order.time).toLocaleString("zh-CN")}
                    </TableCell>
                    <TableCell>{order.side === "buy" ? "买" : "卖"}</TableCell>
                    <TableCell className="font-mono">{order.symbol}</TableCell>
                    <TableCell className="text-right font-mono">{order.quantity}</TableCell>
                    <TableCell className="text-right font-mono">{formatPrice(order.price)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
