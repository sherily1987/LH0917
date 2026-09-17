"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { UNIVERSE } from "@/lib/market/universe";
import type { Quote } from "@/lib/quant/types";

const STORAGE_KEY = "lh-quant-paper";
const STARTING_CASH = 1_000_000;

type Position = { symbol: string; quantity: number; avgPrice: number };
type Order = {
  id: string;
  time: number;
  symbol: string;
  side: "buy" | "sell";
  quantity: number;
  price: number;
};
type PaperState = { cash: number; positions: Position[]; orders: Order[] };

const EMPTY_STATE: PaperState = { cash: STARTING_CASH, positions: [], orders: [] };
const listeners = new Set<() => void>();
let memory: PaperState | null = null;

function emit() {
  for (const listener of listeners) listener();
}

function loadState(): PaperState {
  if (typeof window === "undefined") return EMPTY_STATE;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_STATE;
    const parsed = JSON.parse(raw) as PaperState;
    if (!parsed || typeof parsed.cash !== "number") return EMPTY_STATE;
    return parsed;
  } catch {
    return EMPTY_STATE;
  }
}

function saveState(state: PaperState) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function subscribePaper(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getPaperSnapshot(): PaperState {
  if (!memory) memory = loadState();
  return memory;
}

function setPaperState(next: PaperState) {
  memory = next;
  saveState(next);
  emit();
}

export function PaperDesk({ quotes }: { quotes: Quote[] }) {
  const state = useSyncExternalStore(subscribePaper, getPaperSnapshot, () => EMPTY_STATE);
  const [symbol, setSymbol] = useState(quotes[0]?.symbol ?? "AAPL");
  const [quantity, setQuantity] = useState(10);
  const [message, setMessage] = useState<string | null>(null);

  const quoteMap = useMemo(
    () => new Map(quotes.map((quote) => [quote.symbol, quote])),
    [quotes],
  );

  const marked = useMemo(() => {
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
    return { positions, equity, pnl: equity - STARTING_CASH };
  }, [quoteMap, state.cash, state.positions]);

  function commit(next: PaperState, note: string) {
    setPaperState(next);
    setMessage(note);
  }

  function trade(side: "buy" | "sell") {
    const quote = quoteMap.get(symbol);
    if (!quote) {
      setMessage("没有该标的报价");
      return;
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setMessage("数量必须大于 0");
      return;
    }
    const price = quote.price;
    const notional = quantity * price;
    const positions = [...state.positions];
    const index = positions.findIndex((item) => item.symbol === symbol);
    const current = index >= 0 ? positions[index] : null;

    if (side === "buy") {
      if (state.cash < notional) {
        setMessage("现金不足");
        return;
      }
      if (current) {
        const totalQty = current.quantity + quantity;
        current.avgPrice = (current.avgPrice * current.quantity + notional) / totalQty;
        current.quantity = totalQty;
      } else {
        positions.push({ symbol, quantity, avgPrice: price });
      }
      commit(
        {
          cash: state.cash - notional,
          positions,
          orders: [
            {
              id: crypto.randomUUID(),
              time: Date.now(),
              symbol,
              side,
              quantity,
              price,
            },
            ...state.orders,
          ].slice(0, 50),
        },
        `买入 ${quantity} ${symbol} @ ${formatPrice(price)}`,
      );
      return;
    }

    if (!current || current.quantity < quantity) {
      setMessage("可卖数量不足");
      return;
    }
    current.quantity -= quantity;
    const nextPositions = current.quantity === 0 ? positions.filter((item) => item.quantity > 0) : positions;
    commit(
      {
        cash: state.cash + notional,
        positions: nextPositions,
        orders: [
          {
            id: crypto.randomUUID(),
            time: Date.now(),
            symbol,
            side,
            quantity,
            price,
          },
          ...state.orders,
        ].slice(0, 50),
      },
      `卖出 ${quantity} ${symbol} @ ${formatPrice(price)}`,
    );
  }

  function reset() {
    const next = { cash: STARTING_CASH, positions: [], orders: [] };
    commit(next, "模拟账户已重置");
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <MetricCard label="净值" value={formatPrice(marked.equity)} />
        <MetricCard
          label="累计盈亏"
          value={formatPrice(marked.pnl)}
          tone={marked.pnl >= 0 ? "up" : "down"}
        />
        <MetricCard label="现金" value={formatPrice(state.cash)} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>下单</CardTitle>
          <CardDescription>按最新报价即时成交，数据保存在本机浏览器。</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-[1fr_140px_auto_auto] md:items-end">
          <div className="space-y-1.5">
            <Label>标的</Label>
            <Select value={symbol} onValueChange={(value) => value && setSymbol(value)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {UNIVERSE.map((item) => (
                  <SelectItem key={item.symbol} value={item.symbol}>
                    {item.symbol} · {item.nameZh}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>数量</Label>
            <Input
              type="number"
              min={1}
              value={quantity}
              onChange={(e) => setQuantity(Number(e.target.value))}
            />
          </div>
          <Button onClick={() => trade("buy")}>买入</Button>
          <Button variant="outline" onClick={() => trade("sell")}>
            卖出
          </Button>
        </CardContent>
      </Card>

      {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle>持仓</CardTitle>
            <CardDescription>用当前行情标记市值。</CardDescription>
          </div>
          <Button variant="ghost" size="sm" onClick={reset}>
            重置账户
          </Button>
        </CardHeader>
        <CardContent>
          {marked.positions.length === 0 ? (
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
                {marked.positions.map((position) => (
                  <TableRow key={position.symbol}>
                    <TableCell className="font-mono">
                      <Link href={`/markets/${encodeURIComponent(position.symbol)}`} className="hover:underline">
                        {position.symbol}
                      </Link>
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {formatNumber(position.quantity, 2)}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {formatPrice(position.avgPrice)}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {formatPrice(position.price)}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {formatPrice(position.marketValue)}
                    </TableCell>
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
