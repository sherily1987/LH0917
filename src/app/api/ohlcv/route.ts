import { type NextRequest } from "next/server";
import { seriesFromRequest } from "@/lib/market/query";

export async function GET(request: NextRequest) {
  const result = await seriesFromRequest(request);
  if ("error" in result) {
    return Response.json({ error: result.error }, { status: result.status });
  }
  return Response.json(result.series);
}
