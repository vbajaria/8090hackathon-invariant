import { recoverRun, requireRun } from "@/lib/runs";
import { failure, json } from "@/lib/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) { try { return json(recoverRun(requireRun((await context.params).id))); } catch(e) { return failure(e); } }
