import { submitRun } from "@/lib/runs";
import { body, failure, json } from "@/lib/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) { try { const input = await body(request); const { id } = await context.params; return json(await submitRun(id)); } catch(e) { return failure(e); } }
