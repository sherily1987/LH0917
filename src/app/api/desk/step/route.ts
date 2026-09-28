import { OKX_COSTS } from "@/lib/desk/costs";
import { LiveAdapter } from "@/lib/desk/execution";
import { readOkxEnv } from "@/lib/desk/okx";
import { DeskError } from "@/lib/desk/ledger";
import { getDeskStatus } from "@/lib/desk/status";
import { parseStepBody, stepDesk } from "@/lib/desk/step";
import type { DeskStepResult } from "@/lib/desk/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const headers = { "Cache-Control": "no-store, max-age=0" };

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "请求体不是 JSON。" }, { status: 400, headers });
  }
  try {
    const status = await getDeskStatus();
    const input = parseStepBody(body);
    const prior = input.ledger?.appliedKey ?? "";
    const live = status.mode !== "paper";
    const result = stepDesk({
      ...input,
      confirmBars: status.confirmBars,
      sides: live ? "both" : "long",
      costs: live ? OKX_COSTS : null,
    });
    const changed = result.ledger.appliedKey !== prior;
    const action = result.decision.action;
    if (live && changed && (action === "enter" || action === "exit" || action === "flatten")) {
      if (!status.liveEligible) {
        return Response.json({ error: status.summary }, { status: 409, headers });
      }
      const trade = result.ledger.trades[result.ledger.trades.length - 1];
      if (!trade) {
        return Response.json({ error: "没有成交可以发送。" }, { status: 500, headers });
      }
      try {
        await new LiveAdapter(readOkxEnv(process.env), true).place({
          symbol: "BTCUSDT",
          side: trade.side,
          quantity: trade.quantity,
          reduceOnly: action !== "enter",
          posSide: trade.positionSide,
          clOrdId: `lh${trade.id}`,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "OKX 下单失败，账本没有更新。";
        return Response.json({ error: message }, { status: 502, headers });
      }
      const sent: DeskStepResult = { ...result, execution: status.mode };
      return Response.json(sent, { headers });
    }
    return Response.json(result, { headers });
  } catch (error) {
    if (error instanceof DeskError) {
      return Response.json({ error: error.message }, { status: 400, headers });
    }
    return Response.json({ error: "这一拍无法计算，请稍后再试。" }, { status: 500, headers });
  }
}
