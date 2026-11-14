import { requireRun, RunError } from "@/lib/runs";
import { markdownReport, reportData } from "@/lib/report";
import { failure } from "@/lib/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const run = requireRun((await context.params).id); if (!run.evidence) throw new RunError("No completed evidence report is available.", 409);
    const format = new URL(request.url).searchParams.get("format") || "json"; if (format !== "json" && format !== "markdown") throw new RunError("Choose json or markdown report format.");
    const markdown = format === "markdown";
    return new Response(markdown ? markdownReport(run) : JSON.stringify(reportData(run), null, 2), { headers: { "Content-Type": markdown ? "text/markdown; charset=utf-8" : "application/json", "Content-Disposition": `attachment; filename="invariant-${run.id}.${markdown ? "md" : "json"}"`, "Cache-Control": "no-store" } });
  } catch(e) { return failure(e); }
}
