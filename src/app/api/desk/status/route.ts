import { getDeskStatus } from "@/lib/desk/status";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const status = await getDeskStatus();
  return Response.json(status, { headers: { "Cache-Control": "no-store, max-age=0" } });
}
