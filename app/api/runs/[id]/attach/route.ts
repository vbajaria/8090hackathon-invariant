import { attachRun } from "@/lib/runs";
import { body, failure, json } from "@/lib/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) { try { const input = await body(request); return json(await attachRun((await context.params).id, input)); } catch(e) { return failure(e); } }
