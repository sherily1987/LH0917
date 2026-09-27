"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { MetricCard } from "@/components/market/metric-card";
import { Sparkline } from "@/components/market/sparkline";
import { DEFAULT_CAPITAL, type DeskCommand, type DeskLedger, type DeskMarket, type DeskRisk } from "@/lib/desk/types";
import { formatDateTime, formatNumber, signedClass } from "@/lib/format";

const STORAGE_KEY = "lh-quant-desk-v1";
const POLL_MS = 15_000;

type RiskForm = {
  positionPct: number;
  stopPct: number;
  takeProfitPct: number;
  dailyLossPct: number;
};

const DEFAULT_FORM: RiskForm = {
  positionPct: 20,
  stopPct: 2,
  takeProfitPct: 4,
  dailyLossPct: 5,
};

type QuoteView = {
  price: number;
  source: string;
  time: number;
};

function usdt(value: number): string {
  return `${formatNumber(value, 2)} USDT`;
}

function toRisk(form: RiskForm): DeskRisk {
  return {
    positionPct: form.positionPct / 100,
    stopPct: form.stopPct / 100,
    takeProfitPct: form.takeProfitPct / 100,
    dailyLossPct: form.dailyLossPct / 100,
    maxPositions: 1,
  };
}

function sourceLabel(source: string): string {
  if (source === "yahoo") return "Yahoo Finance 公开价";
  if (source === "synthetic") return "演示行情（上游暂不可用）";
  return "行情来源未知";
}

export function DeskConsole() {
  const [ready, setReady] = useState(false);
  const [ledger, setLedger] = useState<DeskLedger | null>(null);
  const [form, setForm] = useState<RiskForm>(DEFAULT_FORM);
  const [capital, setCapital] = useState(DEFAULT_CAPITAL);
  const [running, setRunning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quote, setQuote] = useState<QuoteView | null>(null);

  const ledgerRef = useRef(ledger);
  const formRef = useRef(form);
  const capitalRef = useRef(capital);
  const runningRef = useRef(running);
  const inflight = useRef(false);

  useEffect(() => {
    ledgerRef.current = ledger;
    formRef.current = form;
    capitalRef.current = capital;
    runningRef.current = running;
  }, [ledger, form, capital, running]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as {
          ledger?: DeskLedger;
          form?: RiskForm;
          capital?: number;
        };
        if (saved.ledger?.version === 1 && saved.ledger.symbol === "BTCUSDT") {
          // Client-only restore. Reading localStorage during render would mismatch SSR.
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setLedger(saved.ledger);
        }
        if (saved.form) setForm({ ...DEFAULT_FORM, ...saved.form });
        if (typeof saved.capital === "number" && Number.isFinite(saved.capital)) setCapital(saved.capital);
      }
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ledger, form, capital }));
  }, [ready, ledger, form, capital]);

  const run = useCallback(async (command: DeskCommand) => {
    if (inflight.current) return;
    inflight.current = true;
    setBusy(true);
    setError(null);
    try {
      const marketResponse = await fetch("/api/desk/market", { cache: "no-store" });
      const market = (await marketResponse.json()) as DeskMarket & { source?: string; error?: string };
      if (!marketResponse.ok) throw new Error(market.error || "行情获取失败");
      setQuote({ price: market.price, source: market.source ?? "", time: market.time });
      const stepResponse = await fetch("/api/desk/step", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ledger: ledgerRef.current,
          market,
          risk: toRisk(formRef.current),
          command,
          capital: capitalRef.current,
          agentRunning: runningRef.current,
        }),
      });
      const payload = (await stepResponse.json()) as { ledger?: DeskLedger; error?: string };
      if (!stepResponse.ok || !payload.ledger) throw new Error(payload.error || "这一拍没有完成");
      setLedger(payload.ledger);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "这一拍没有完成");
    } finally {
      inflight.current = false;
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (!ready || (!running && !ledger?.position)) return;
    const id = window.setInterval(() => {
      void run("step");
    }, POLL_MS);
    return () => window.clearInterval(id);
  }, [ready, running, ledger?.position, run]);

  const price = quote?.price ?? ledger?.lastDecision?.price ?? null;
  const position = ledger?.position ?? null;
  const equity = ledger ? ledger.cash + (position && price ? position.quantity * price : 0) : capital;
  const upnl = position && price ? (price - position.entryPrice) * position.quantity : 0;
  const decision = ledger?.lastDecision ?? null;

  function patchForm(key: keyof RiskForm, value: string) {
    const next = Number(value);
    setForm((current) => ({ ...current, [key]: Number.isFinite(next) ? next : current[key] }));
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs tracking-[0.2em] text-muted-foreground">PAPER DESK</p>
          <h1 className="text-2xl font-medium">AI 模拟交易台</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            只做 BTC 现货风格的多单，不做空，也不加杠杆。规则引擎看公开行情，在你这台浏览器的模拟账本里下单。
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">模拟 · 非实盘</Badge>
          <Badge variant={running ? "default" : "secondary"}>{running ? "代理运行中" : "代理已停止"}</Badge>
          {ledger?.halted ? <Badge variant="destructive">当日停机</Badge> : null}
        </div>
      </div>

      <Alert>
        <AlertTitle>研究工具，不是投资建议</AlertTitle>
        <AlertDescription>
          这里的盈亏都是模拟的。亏损很常见，过去的纸面结果不能说明以后会赚钱。默认不会向任何交易所发送订单，也没有提币。
        </AlertDescription>
      </Alert>

      {ledger?.halted ? (
        <Alert variant="destructive">
          <AlertTitle>当日不再开新仓</AlertTitle>
          <AlertDescription>{ledger.haltReason}</AlertDescription>
        </Alert>
      ) : null}

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>这一拍没有完成</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="净值" value={ledger ? usdt(equity) : "—"} hint={quote ? sourceLabel(quote.source) : "尚未取价"} />
        <MetricCard label="现金" value={ledger ? usdt(ledger.cash) : "—"} />
        <MetricCard
          label="浮动盈亏"
          value={position ? usdt(upnl) : "—"}
          tone={upnl > 0 ? "up" : upnl < 0 ? "down" : "neutral"}
        />
        <MetricCard
          label="BTC 现价"
          value={price ? usdt(price) : "—"}
          hint={quote ? `更新于 ${formatDateTime(quote.time)}` : "启动后读取行情"}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Card>
          <CardHeader>
            <CardTitle>最近判断</CardTitle>
            <CardDescription>
              {running
                ? "约每 15 秒取一次公开价，再交给规则引擎。"
                : position
                  ? "代理已停止，仍会检查止损和止盈。"
                  : "点「启动」后才会开新仓。"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm leading-6" aria-live="polite">
              {decision?.reason ?? "还没有判断。启动代理，或先重置账户。"}
            </p>
            {decision && decision.votes.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {decision.votes.map((item) => (
                  <span
                    key={item.name}
                    title={item.detail}
                    className={`rounded-full border px-2 py-0.5 text-xs ${
                      item.vote > 0 ? "text-up" : item.vote < 0 ? "text-down" : "text-muted-foreground"
                    }`}
                  >
                    {item.label} {item.vote > 0 ? "多" : item.vote < 0 ? "空" : "平"}
                  </span>
                ))}
              </div>
            ) : null}
            <div>
              <p className="mb-2 text-xs text-muted-foreground">净值曲线</p>
              <Sparkline values={(ledger?.equityCurve ?? []).map((point) => point.equity)} width={560} height={72} className="w-full" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>持仓</CardTitle>
            <CardDescription>最多一笔多单，无杠杆。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {position ? (
              <>
                <Row label="方向" value="多" />
                <Row label="数量" value={`${formatNumber(position.quantity, 6)} BTC`} />
                <Row label="入场价" value={usdt(position.entryPrice)} />
                <Row label="浮动盈亏" value={usdt(upnl)} className={signedClass(upnl)} />
              </>
            ) : (
              <p className="text-muted-foreground">没有持仓。</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>控制</CardTitle>
          <CardDescription>初始资金在重置时生效。风控比例从下一拍开始用。仓位数固定为 1。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Field label="初始资金 USDT" id="capital">
              <Input
                id="capital"
                type="number"
                min={100}
                step={100}
                value={capital}
                onChange={(event) => setCapital(Number(event.target.value))}
              />
            </Field>
            <Field label="仓位上限 %" id="positionPct">
              <Input
                id="positionPct"
                type="number"
                min={1}
                max={100}
                step={1}
                value={form.positionPct}
                onChange={(event) => patchForm("positionPct", event.target.value)}
              />
            </Field>
            <Field label="止损 %" id="stopPct">
              <Input
                id="stopPct"
                type="number"
                min={0.1}
                max={50}
                step={0.1}
                value={form.stopPct}
                onChange={(event) => patchForm("stopPct", event.target.value)}
              />
            </Field>
            <Field label="止盈 %" id="takeProfitPct">
              <Input
                id="takeProfitPct"
                type="number"
                min={0.1}
                max={100}
                step={0.1}
                value={form.takeProfitPct}
                onChange={(event) => patchForm("takeProfitPct", event.target.value)}
              />
            </Field>
            <Field label="日亏损停机 %" id="dailyLossPct">
              <Input
                id="dailyLossPct"
                type="number"
                min={0.5}
                max={50}
                step={0.5}
                value={form.dailyLossPct}
                onChange={(event) => patchForm("dailyLossPct", event.target.value)}
              />
            </Field>
          </div>
          <div className="flex flex-wrap gap-2">
            {running ? (
              <Button
                type="button"
                variant="secondary"
                disabled={!ready || busy}
                onClick={() => {
                  runningRef.current = false;
                  setRunning(false);
                }}
              >
                停止
              </Button>
            ) : (
              <Button
                type="button"
                disabled={!ready || busy}
                onClick={() => {
                  runningRef.current = true;
                  setRunning(true);
                  void run("step");
                }}
              >
                启动
              </Button>
            )}
            <Button type="button" variant="outline" disabled={!ready || busy || !position} onClick={() => void run("flatten")}>
              立即平仓
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={!ready || busy}
              onClick={() => {
                if (!window.confirm("确定清空模拟账本，并按当前初始资金重建？")) return;
                runningRef.current = false;
                setRunning(false);
                void run("reset");
              }}
            >
              重置
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>成交</CardTitle>
          <CardDescription>只记录模拟买卖。没有胜率统计。</CardDescription>
        </CardHeader>
        <CardContent>
          {ledger && ledger.trades.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>时间</TableHead>
                  <TableHead>方向</TableHead>
                  <TableHead>数量</TableHead>
                  <TableHead>价格</TableHead>
                  <TableHead>已实现盈亏</TableHead>
                  <TableHead>原因</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...ledger.trades].reverse().map((trade) => (
                  <TableRow key={trade.id}>
                    <TableCell className="whitespace-nowrap font-mono text-xs">{formatDateTime(trade.time)}</TableCell>
                    <TableCell>{trade.side === "buy" ? "买入" : "卖出"}</TableCell>
                    <TableCell className="font-mono">{formatNumber(trade.quantity, 6)}</TableCell>
                    <TableCell className="font-mono">{formatNumber(trade.price, 2)}</TableCell>
                    <TableCell className={trade.pnl == null ? "" : signedClass(trade.pnl)}>
                      {trade.pnl == null ? "—" : usdt(trade.pnl)}
                    </TableCell>
                    <TableCell className="max-w-sm text-xs text-muted-foreground">{trade.reason}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground">还没有模拟成交。</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}

function Row({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className={className ?? "font-mono"}>{value}</span>
    </div>
  );
}
