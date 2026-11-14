// Genuine, offline smoke runs. Never submits or changes external 8090 work orders.
import assert from "node:assert/strict";
const base = `http://127.0.0.1:${process.env.PORT || 3000}`;
const headers = { "Content-Type": "application/json" };
if (process.env.INVARIANT_PASSWORD) headers.Authorization = `Basic ${Buffer.from(`invariant:${process.env.INVARIANT_PASSWORD}`).toString("base64")}`;
async function request(route, body) {
  const response = await fetch(base + route, { headers, ...(body === undefined ? {} : { method: "POST", body: JSON.stringify(body) }), signal: AbortSignal.timeout(10000) });
  assert.ok(response.ok, `${route} returned HTTP ${response.status}`);
  return response;
}
assert.equal((await (await request("/api/health")).json()).status, "ok");
for (const [mode, targetRef, verdict] of [
  ["demo-preserved", "preserved", "BEHAVIORAL INTEGRITY: VERIFIED"],
  ["demo-regression", "controlled-regression", "BEHAVIORAL DRIFT: DETECTED"],
]) {
  const created = await (await request("/api/runs", {
    name: `Docker smoke · ${mode}`, repository: "https://github.com/vbajaria/8090hackathon-invariant",
    baselineRef: "bundled-baseline", targetRef, mode,
    request: "Refactor the financial calculation layer without changing established financial behavior.",
  })).json();
  const deadline = Date.now() + 120000;
  let run;
  do {
    run = await (await request(`/api/runs/${created.id}`)).json();
    if (run.status !== "running") break;
    await new Promise(resolve => setTimeout(resolve, 500));
  } while (Date.now() < deadline);
  assert.equal(run.status, "completed", run.error || "verification did not finish");
  assert.equal(run.evidence.verdict, verdict);
  assert.ok(run.evidence.summary.total > 0);
  assert.equal(run.evidence.verificationEngine.kind, "container");
  assert.match(run.evidence.baseline.sha256, /^[a-f0-9]{64}$/);
  assert.equal(run.workOrder, undefined);
  const json = await (await request(`/api/runs/${run.id}/report?format=json`)).json();
  assert.equal(json.evidence.verdict, verdict);
  assert.ok((await (await request(`/api/runs/${run.id}/report?format=markdown`)).text()).includes(verdict));
  if (mode === "demo-regression") assert.ok(run.evidence.findings.some(f => f.minimal && f.invariantId === "prepayment"));
  console.log(`${mode}: ${verdict} (${run.evidence.summary.total} real case assessments; run ${run.id})`);
}
console.log("Docker smoke passed: real Python execution, findings, provenance and report downloads.");
