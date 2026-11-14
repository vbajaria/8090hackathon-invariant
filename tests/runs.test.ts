import { before, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
process.env.INVARIANT_DATA_DIR = mkdtempSync(path.join(os.tmpdir(), "invariant-runs-test-"));
let createRun: typeof import("../lib/runs").createRun;
let requireRun: typeof import("../lib/runs").requireRun;
let startVerification: typeof import("../lib/runs").startVerification;
let recoverRun: typeof import("../lib/runs").recoverRun;
let saveRun: typeof import("../lib/db").saveRun;
before(async () => {
  ({ createRun, requireRun, startVerification, recoverRun } = await import("../lib/runs"));
  ({ saveRun } = await import("../lib/db"));
});
const input = { repository: "https://github.com/vbajaria/8090hackathon-invariant", baselineRef: "main", targetRef: "preserved", request: "Refactor the calculation layer without changing behavior", mode: "demo-preserved" };
async function finished(id: string) {
  for (let i = 0; i < 180; i++) { const run = requireRun(id); if (run.status !== "running") return run; await new Promise(r => setTimeout(r, 100)); }
  throw new Error("Timed out waiting for actual independent verification");
}

test("real Python baseline and preserving fixture execute before a verified report is available", async () => {
  const created = await createRun(input); assert.equal(created.status, "running");
  const run = await finished(created.id);
  assert.equal(run.status, "completed", run.error); assert.equal(run.evidence?.verdict, "BEHAVIORAL INTEGRITY: VERIFIED");
  assert.ok(run.evidence!.summary.total > 100); assert.equal(run.evidence!.summary.failed, 0);
  assert.ok(run.baselinePath); assert.match(run.evidence!.baseline.sha256, /^[a-f0-9]{64}$/);
  assert.equal(run.factorySteps[0].status, "awaiting_action"); // Passing demo tests are not Factory implementation.
  assert.throws(() => startVerification(run.id, { classifications: { imaginary: "UNKNOWN" } }), /existing invariant/);
  const next = startVerification(run.id, { classifications: { reference: "UNKNOWN" } });
  assert.equal(next.evidence, undefined); // Never show an old candidate verdict as a new result.
  const reviewed = await finished(run.id); assert.equal(reviewed.evidence?.verdict, "REVIEW REQUIRED");
});

test("controlled regression produces genuine shrunk counterexamples", async () => {
  const created = await createRun({ ...input, mode: "demo-regression", targetRef: "controlled-regression" });
  const run = await finished(created.id); assert.equal(run.status, "completed", run.error);
  assert.equal(run.evidence?.verdict, "BEHAVIORAL DRIFT: DETECTED");
  assert.ok(run.evidence!.findings.some(f => f.minimal && f.invariantId === "prepayment"));
  assert.ok(run.evidence!.summary.failed > 0);
});

test("repositories require explicit trust opt-in and interrupted runs never pretend complete", async () => {
  const old = process.env.ALLOW_REPOSITORY_EXECUTION; delete process.env.ALLOW_REPOSITORY_EXECUTION;
  try { await assert.rejects(createRun({ ...input, mode: "repository" }), /disabled/); }
  finally { if (old !== undefined) process.env.ALLOW_REPOSITORY_EXECUTION = old; }
  const run = requireRun((await createRun(input)).id); await finished(run.id);
  run.status = "running"; run.oracleSteps[5].status = "running"; saveRun(run);
  const recovered = recoverRun(run); assert.equal(recovered.status, "failed"); assert.match(recovered.error!, /restarted/);
});
