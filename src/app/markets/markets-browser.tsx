"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { QuoteTable } from "@/components/market/quote-table";
import { ASSET_CLASS_LABEL, getInstrument } from "@/lib/market/universe";
import type { Quote } from "@/lib/quant/types";

export function MarketsBrowser({ quotes }: { quotes: Quote[] }) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return quotes;
    return quotes.filter((quote) => {
      const instrument = getInstrument(quote.symbol);
      return (
        quote.symbol.toLowerCase().includes(q) ||
        instrument.name.toLowerCase().includes(q) ||
        instrument.nameZh.toLowerCase().includes(q) ||
        instrument.sector.toLowerCase().includes(q) ||
        ASSET_CLASS_LABEL[instrument.assetClass].includes(query.trim())
      );
    });
  }, [query, quotes]);

  return (
    <Card>
      <CardHeader className="gap-3">
        <CardTitle>全部标的</CardTitle>
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜索代码、名称或板块"
        />
      </CardHeader>
      <CardContent>
        {filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground">没有匹配的标的。</p>
        ) : (
          <QuoteTable quotes={filtered} />
        )}
      </CardContent>
    </Card>
  );
}
