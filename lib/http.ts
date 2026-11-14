import { z } from "zod";
import { RunError } from "./runs";
import { FactoryError } from "./factory";

export function json(data: unknown, status = 200) { return Response.json(data, { status, headers: { "Cache-Control": "no-store" } }); }
export function failure(e: unknown) {
  if (e instanceof z.ZodError) return json({ error: e.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ") }, 400);
  if (e instanceof RunError || e instanceof FactoryError) return json({ error: e.message }, e.status);
  if (e instanceof SyntaxError) return json({ error: "Invalid JSON body." }, 400);
  // Do not leak arbitrary downstream exception contents/credentials.
  return json({ error: "Operation failed. Check the server configuration and retry." }, 500);
}
export async function body(request: Request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || new URL(request.url).host;
  if (origin && new URL(origin).host !== host) throw new RunError("Cross-origin mutations are not allowed.", 403);
  if (!request.headers.get("content-type")?.includes("application/json")) throw new RunError("Content-Type must be application/json.", 415);
  const text = await request.text(); if (text.length > 50000) throw new RunError("Request body exceeds the 50KB limit.", 413);
  return text.trim() ? JSON.parse(text) as unknown : {};
}
