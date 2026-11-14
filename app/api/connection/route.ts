import { connection } from "@/lib/factory";
import { body, failure, json } from "@/lib/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() { try { return json(await connection()); } catch(e) { return failure(e); } }
export async function POST(request: Request) { try { await body(request); return json(await connection(true)); } catch(e) { return failure(e); } }
