import type { Metadata } from "next";
import { connection } from "next/server";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MetricCard } from "@/components/market/metric-card";
import { PriceChange } from "@/components/market/price-change";
import { formatNumber, formatPercent, formatPrice } from "@/lib/format";
import { readBotConfig } from "@/lib/bot/config";
import { accountEquity } from "@/lib/bot/risk";
import { getBotStore } from "@/lib/bot/store";
import type { BotRun } from "@/lib/bot/types";
import { getQuotes } from "@/lib/market/data";
import { resetPaperBotAction, runPaperTickAction } from "@/app/bot/actions";

export const metadata: Metadata = { title: "自动交易" };
export const maxDuration = 300;

const STATUS_LABEL: Record<BotRun["status"], string> = { ok: "完成", skipped: "跳过", error: "出错" };

function time(ts: number) {
  return new Date(ts).toLocaleString("zh-CN", { hour12: false, timeZone: "Asia/Shanghai" });
}

function LatestRun({ run }: { run: BotRun }) {
  const filled = run.fills.filter((f) => f.status === "filled");
  const failed = run.fills.filter((f) => f.status === "failed");
  return (
    <Card>
      <CardHeader>
        <CardTitle>最近一轮决策</CardTitle>
        <CardDescription>
          {time(run.time)} · {run.model} · 数据源 {run.dataSource ?? "—"}
        </CardDescription>
        <CardAction>
          <Badge variant={run.status === "error" ? "destructive" : "outline"}>{STATUS_LABEL[run.status]}</Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-4">
        {run.message ? <p className="text-sm text-muted-foreground">{run.message}</p> : null}
        {run.marketView ? <p className="text-sm leading-relaxed">{run.marketView}</p> : null}
        {run.status === "ok" && run.decided.length === 0 ? (
          <p className="text-sm text-muted-foreground">AI 判断这一轮不交易。</p>
        ) : null}
        {run.decided.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>AI 指令</TableHead>
                <TableHead className="text-right">比例</TableHead>
                <TableHead className="text-right">信心</TableHead>
                <TableHead>理由</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {run.decided.map((order, index) => (
                <TableRow key={index}>
                  <TableCell className="font-mono">
                    {order.side === "buy" ? "买" : "卖"} {order.symbol}
                  </TableCell>
                  <TableCell className="text-right font-mono">{formatPercent(order.size, 1, false)}</TableCell>
                  <TableCell className="text-right font-mono">{formatPercent(order.confidence, 0, false)}</TableCell>
                  <TableCell className="max-w-md whitespace-normal text-muted-foreground">{order.reason}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : null}
        {filled.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>成交</TableHead>
                <TableHead className="text-right">数量</TableHead>
                <TableHead className="text-right">价格</TableHead>
                <TableHead className="text-right">金额</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filled.map((fill) => (
                <TableRow key={fill.id}>
                  <TableCell className="font-mono">
                    {fill.side === "buy" ? "买" : "卖"} {fill.symbol}
                  </TableCell>
                  <TableCell className="text-right font-mono">{formatNumber(fill.quantity, 6)}</TableCell>
                  <TableCell className="text-right font-mono">{formatPrice(fill.price)}</TableCell>
                  <TableCell className="text-right font-mono">{formatPrice(fill.quantity * fill.price)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : null}
        {run.rejected.length > 0 || failed.length > 0 ? (
          <ul className="space-y-1 text-sm text-muted-foreground">
            {run.rejected.map((item, index) => (
              <li key={`r${index}`}>
                风控拦截 {item.order.side === "buy" ? "买" : "卖"} {item.order.symbol}：{item.why}
              </li>
            ))}
            {failed.map((fill) => (
              <li key={fill.id}>
                下单失败 {fill.side === "buy" ? "买" : "卖"} {fill.symbol}：{fill.error}
              </li>
            ))}
          </ul>
        ) : null}
      </CardContent>
    </Card>
  );
}

export default async function BotPage() {
  await connection();
  const config = readBotConfig();
  const store = getBotStore();
  const state = await store.load();
  const account = state.account;
  const symbols = account?.holdings.map((h) => h.symbol) ?? [];
  const { quotes } = symbols.length ? await getQuotes(symbols) : { quotes: [] };
  const prices = Object.fromEntries(quotes.map((q) => [q.symbol, q.price]));
  const equity = account ? accountEquity(account, prices) : null;
  const latest = state.runs[0];
  const ephemeral = store.kind === "file" && Boolean(process.env.VERCEL);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-medium">自动交易</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            AI 每轮扫描加密货币，自己决定买卖什么、买卖多少，系统直接执行。代码只做硬性风控：单笔上限、单币上限、最低现金、日亏损和回撤熔断。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant={config.mode === "live" ? "destructive" : "secondary"}>
            {config.mode === "live" ? `实盘 · ${config.exchange.id}${config.exchange.sandbox ? " 测试网" : ""}` : "模拟盘"}
          </Badge>
          <Badge variant="outline">{config.model}</Badge>
          {!config.enabled ? <Badge variant="destructive">已暂停</Badge> : null}
        </div>
      </div>

      {ephemeral ? (
        <Alert variant="destructive">
          <AlertTitle>状态没有持久化</AlertTitle>
          <AlertDescription>
            线上环境没有配置 Redis，账户和日志写在临时目录，函数重启后会丢失。请在 Vercel Marketplace 接入 Upstash Redis。
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-4">
        <MetricCard label="净值" value={equity == null ? "—" : formatPrice(equity)} />
        <MetricCard label="现金" value={account ? formatPrice(account.cash) : "—"} />
        <MetricCard
          label="今日盈亏"
          value={account && equity != null ? formatPercent(equity / account.day.openEquity - 1) : "—"}
          tone={account && equity != null ? (equity >= account.day.openEquity ? "up" : "down") : undefined}
        />
        <MetricCard
          label="距峰值回撤"
          value={account && equity != null ? formatPercent(equity / account.peakEquity - 1) : "—"}
          hint={`熔断线 -${(config.limits.maxDrawdownPct * 100).toFixed(0)}%`}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>持仓</CardTitle>
          <CardDescription>定时任务每天 00:05 UTC 运行一轮，也可以调用 /api/bot/tick 触发。</CardDescription>
          {config.mode === "paper" ? (
            <CardAction className="flex gap-2">
              <form action={runPaperTickAction}>
                <Button type="submit" size="sm">
                  立即运行一轮
                </Button>
              </form>
              <form action={resetPaperBotAction}>
                <Button type="submit" size="sm" variant="ghost">
                  重置模拟盘
                </Button>
              </form>
            </CardAction>
          ) : null}
        </CardHeader>
        <CardContent>
          {!account || account.holdings.length === 0 ? (
            <p className="text-sm text-muted-foreground">{account ? "空仓。" : "还没有运行过。"}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>代码</TableHead>
                  <TableHead className="text-right">数量</TableHead>
                  <TableHead className="text-right">成本</TableHead>
                  <TableHead className="text-right">现价</TableHead>
                  <TableHead className="text-right">盈亏</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {account.holdings.map((h) => {
                  const price = prices[h.symbol] ?? h.avgPrice;
                  return (
                    <TableRow key={h.symbol}>
                      <TableCell className="font-mono">{h.symbol}</TableCell>
                      <TableCell className="text-right font-mono">{formatNumber(h.quantity, 6)}</TableCell>
                      <TableCell className="text-right font-mono">{formatPrice(h.avgPrice)}</TableCell>
                      <TableCell className="text-right font-mono">{formatPrice(price)}</TableCell>
                      <TableCell className="text-right">
                        <PriceChange value={h.avgPrice ? price / h.avgPrice - 1 : 0} />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {latest ? <LatestRun run={latest} /> : null}

      {state.runs.length > 1 ? (
        <Card>
          <CardHeader>
            <CardTitle>运行记录</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>时间</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead className="text-right">运行前净值</TableHead>
                  <TableHead className="text-right">运行后净值</TableHead>
                  <TableHead className="text-right">成交</TableHead>
                  <TableHead>备注</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {state.runs.map((run) => (
                  <TableRow key={run.id}>
                    <TableCell className="font-mono">{time(run.time)}</TableCell>
                    <TableCell>{STATUS_LABEL[run.status]}</TableCell>
                    <TableCell className="text-right font-mono">
                      {run.equityBefore == null ? "—" : formatPrice(run.equityBefore)}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {run.equityAfter == null ? "—" : formatPrice(run.equityAfter)}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {run.fills.filter((f) => f.status === "filled").length}
                    </TableCell>
                    <TableCell className="max-w-xs truncate text-muted-foreground">{run.message ?? ""}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
