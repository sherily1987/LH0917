import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { PriceChange } from "@/components/market/price-change";
import { Sparkline } from "@/components/market/sparkline";
import { formatCompact, formatPrice } from "@/lib/format";
import { ASSET_CLASS_LABEL, getInstrument } from "@/lib/market/universe";
import type { Quote } from "@/lib/quant/types";

export function QuoteTable({
  quotes,
  sparklines,
}: {
  quotes: Quote[];
  sparklines?: Record<string, number[]>;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>代码</TableHead>
          <TableHead>名称</TableHead>
          <TableHead className="text-right">最新</TableHead>
          <TableHead className="text-right">涨跌</TableHead>
          <TableHead className="hidden text-right md:table-cell">成交量</TableHead>
          <TableHead className="hidden text-right lg:table-cell">走势</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {quotes.map((quote) => {
          const instrument = getInstrument(quote.symbol);
          return (
            <TableRow key={quote.symbol}>
              <TableCell className="font-mono">
                <Link href={`/markets/${encodeURIComponent(quote.symbol)}`} className="hover:underline">
                  {quote.symbol}
                </Link>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <span>{instrument.nameZh}</span>
                  <Badge variant="outline">{ASSET_CLASS_LABEL[instrument.assetClass]}</Badge>
                </div>
              </TableCell>
              <TableCell className="text-right font-mono tabular-nums">
                {formatPrice(quote.price, quote.currency)}
              </TableCell>
              <TableCell className="text-right">
                <PriceChange value={quote.changePercent} />
              </TableCell>
              <TableCell className="hidden text-right font-mono tabular-nums md:table-cell">
                {formatCompact(quote.volume)}
              </TableCell>
              <TableCell className="hidden lg:table-cell">
                <div className="flex justify-end">
                  <Sparkline values={sparklines?.[quote.symbol] ?? []} />
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
