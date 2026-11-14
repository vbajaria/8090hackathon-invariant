import { db } from "@/lib/db";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Local readiness only: unavailable 8090 credentials must not disable offline verification. */
export async function GET() {
  try {
    db().prepare("SELECT 1").get();
    return Response.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ status: "unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
