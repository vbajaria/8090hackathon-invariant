import { connection } from "@/lib/factory";
import { dashboardStats } from "@/lib/runs";
import { failure, json } from "@/lib/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() { try { return json({ ...dashboardStats(), connection: await connection() }); } catch (e) { return failure(e); } }
