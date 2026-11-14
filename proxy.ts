import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
export function proxy(request: NextRequest) {
  const password = process.env.INVARIANT_PASSWORD;
  if (!password) return NextResponse.next();
  const header = request.headers.get("authorization") || "";
  let provided = "";
  if (header.startsWith("Basic ")) { try { const decoded = Buffer.from(header.slice(6), "base64").toString(); provided = decoded.startsWith("invariant:") ? decoded.slice(10) : ""; } catch { /* invalid authentication */ } }
  const actual = Buffer.from(provided), expected = Buffer.from(password);
  if (actual.length === expected.length && timingSafeEqual(actual, expected)) return NextResponse.next();
  return new NextResponse("Authentication required. Use username invariant and the server-configured password.", { status: 401, headers: { "WWW-Authenticate": 'Basic realm="INVARIANT", charset="UTF-8"', "Cache-Control": "no-store" } });
}
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
