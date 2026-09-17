import { quotesFromSymbols } from "@/lib/market/query";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const result = await quotesFromSymbols(searchParams.get("symbols") ?? "");
  if ("error" in result) {
    return Response.json({ error: result.error }, { status: result.status });
  }
  return Response.json(result);
}
