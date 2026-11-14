import { createRun, dashboardStats } from "@/lib/runs";
import { body, failure, json } from "@/lib/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() { try { return json(dashboardStats().runs); } catch(e) { return failure(e); } }
export async function POST(request: Request) { try { return json(await createRun(await body(request)), 201); } catch(e) { return failure(e); } }
