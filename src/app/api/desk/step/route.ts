import { DeskError } from "@/lib/desk/ledger";
import { parseStepBody, stepDesk } from "@/lib/desk/step";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const headers = { "Cache-Control": "no-store, max-age=0" };
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "请求体不是 JSON。" }, { status: 400, headers });
  }
  try {
    const result = stepDesk(parseStepBody(body));
    return Response.json(result, { headers });
  } catch (error) {
    if (error instanceof DeskError) {
      return Response.json({ error: error.message }, { status: 400, headers });
    }
    return Response.json({ error: "这一拍无法计算，请稍后再试。" }, { status: 500, headers });
  }
}
