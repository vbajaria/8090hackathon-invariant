import { randomUUID, createHash } from "node:crypto";
import { mkdir, copyFile, readFile, writeFile, realpath, stat, readdir } from "node:fs/promises";
import path from "node:path";
import { existsSync } from "node:fs";
import { z } from "zod";
import { audit, getRun, listRuns, runtimeDir, saveRun } from "./db";
import { agentHandoff, connection, createFactoryWorkOrder, factoryRequest, items, modernizationDescription, normalizeWorkOrder, projectId, remediationDescription, replaceDescription, unwrap } from "./factory";
import { checked, execute } from "./process";
import type { Classification, Evidence, Run, Status, Step } from "./types";

const ref = z.string().min(1).max(200).regex(/^[a-zA-Z0-9][a-zA-Z0-9_./-]*$/, "Use a branch or commit reference, not a command or expression.").refine(s => !s.includes("..") && !s.endsWith(".lock") && !s.includes("//"), "Invalid Git reference.");
export const createRunSchema = z.object({ name: z.string().min(1).max(100).optional(), repository: z.string().regex(/^https:\/\/github\.com\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_.-]+\/?$/, "Use an HTTPS GitHub repository URL."), baselineRef: ref, targetRef: ref, projectId: z.uuid().optional(), request: z.string().min(10).max(10000), mode: z.enum(["demo-regression", "demo-preserved", "repository"]) });
export const verifySchema = z.object({ targetRef: ref.optional(), classifications: z.record(z.string(), z.enum(["MUST_PRESERVE", "INTENTIONAL_CHANGE", "UNKNOWN"])).optional() });
const oracleLabels = ["Original baseline captured", "Semantic invariants extracted", "Invariants classified", "Independent tests generated", "New implementation retrieved", "Differential verification executed", "Findings generated"];
const factoryLabels = ["Modernization request submitted", "Requirements generated", "Blueprint generated", "Work orders generated", "Coding agent assigned", "Implementation completed", "Pull request available"];
const steps = (labels: string[], prefix: string): Step[] => labels.map((label, i) => ({ id: `${prefix}-${i}`, label, status: "pending" }));
const globals = globalThis as typeof globalThis & { invariantJobs?: Map<string, Promise<void>>; invariantMutations?: Map<string, Promise<unknown>> };
const jobs = globals.invariantJobs ||= new Map<string, Promise<void>>();
const mutations = globals.invariantMutations ||= new Map<string, Promise<unknown>>();
export class RunError extends Error { constructor(message: string, public status = 400) { super(message); } }
export function requireRun(id: string) { const run = getRun(id); if (!run) throw new RunError("Verification run not found.", 404); return run; }
function update(id: string, fn: (run: Run) => void) { const run = requireRun(id); fn(run); return saveRun(run); }
function step(id: string, track: "oracleSteps" | "factorySteps", index: number, status: Status, detail?: string) { return update(id, run => { run[track][index] = { ...run[track][index], status, detail, updatedAt: new Date().toISOString() }; }); }
function runDirectory(id: string) { return path.join(runtimeDir, "runs", id); }
export async function serialize<T>(id: string, action: () => Promise<T>): Promise<T> {
  if (jobs.has(id) || mutations.has(id)) throw new RunError("This run is busy. Wait for the active operation to complete.", 409);
  const pending = action(); mutations.set(id, pending);
  try { return await pending; } finally { mutations.delete(id); }
}
export function launch(id: string, action: () => Promise<void>) {
  if (jobs.has(id)) throw new RunError("Verification already running.", 409);
  const promise = action().catch(e => {
    const error = e instanceof Error ? e.message : "Verification failed.";
    update(id, run => { run.status = "failed"; run.error = error; run.oracleSteps = run.oracleSteps.map(s => s.status === "running" ? { ...s, status: "failed", detail: error } : s); });
    audit(id, "execution_failed", error);
  }).finally(() => { jobs.delete(id); });
  jobs.set(id, promise);
}
export function recoverRun(run: Run): Run {
  if (run.status === "running" && !jobs.has(run.id)) return update(run.id, r => { r.status = "failed"; r.evidence = undefined; r.error = "The server restarted during execution. Re-run verification; incomplete evidence is not accepted."; r.oracleSteps = r.oracleSteps.map(s => s.status === "running" ? { ...s, status: "failed", detail: r.error } : s); });
  return run;
}
export async function createRun(raw: unknown) {
  const input = createRunSchema.parse(raw);
  if (input.mode === "repository" && process.env.ALLOW_REPOSITORY_EXECUTION !== "true") throw new RunError("Repository execution is disabled. Only on a trusted local deployment set ALLOW_REPOSITORY_EXECUTION=true after reviewing the repository. Python adapters execute code and are not sandboxed.", 403);
  if (input.projectId && input.projectId !== projectId()) throw new RunError("The External API key is bound to the configured project. Set FACTORY_PROJECT_ID on the server for another project.");
  const now = new Date().toISOString();
  const run: Run = { ...input, name: input.name || (input.mode === "demo-regression" ? "Amortization · controlled regression" : input.mode === "demo-preserved" ? "Amortization · preserving refactor" : "Repository modernization"), projectId: input.projectId || projectId(), id: randomUUID(), status: "running", createdAt: now, updatedAt: now, factorySteps: steps(factoryLabels, "factory"), oracleSteps: steps(oracleLabels, "oracle") };
  run.factorySteps[0] = { ...run.factorySteps[0], status: "awaiting_action", detail: "Baseline capture runs first. Submit the request using your real 8090 connection." };
  run.handoff = agentHandoff(run);
  saveRun(run); audit(run.id, "run_created", input.mode);
  launch(run.id, async () => { await capture(run.id); if (run.mode !== "repository") await verify(run.id); else update(run.id, r => { r.status = "awaiting_action"; }); });
  return run;
}
async function resolveCheckout(run: Run, reference: string, label: string) {
  const dir = path.join(runDirectory(run.id), `${label}-${randomUUID().slice(0, 8)}`);
  await checked("git", ["clone", "--no-checkout", "--filter=blob:none", "--", run.repository, dir]);
  await checked("git", ["fetch", "--depth=1", "origin", reference], dir);
  const commit = await checked("git", ["rev-parse", "--verify", "FETCH_HEAD^{commit}"], dir);
  await checked("git", ["-c", "core.hooksPath=/dev/null", "checkout", "--detach", commit], dir);
  const adapter = path.join(dir, "invariant_adapter.py");
  if (!existsSync(adapter)) throw new RunError("Repository must contain invariant_adapter.py exporting calculate(principal, annual_rate, months, prepayment=0). See docs/ORACLE.md. No adapter was fabricated.");
  const resolved = await realpath(adapter);
  if (!resolved.startsWith(`${dir}${path.sep}`) || !(await stat(resolved)).isFile()) throw new RunError("The adapter must be a regular file inside the checkout, not an external symlink.");
  return { adapter: resolved, commit, dir };
}
async function runOracle(run: Run, baseline: string, candidate: string, classifications?: Record<string, Classification>): Promise<Evidence> {
  const python = process.env.INVARIANT_PYTHON || path.resolve(".venv/bin/python");
  if (!existsSync(python) && !process.env.INVARIANT_PYTHON) throw new RunError("Python oracle dependencies are missing. Run python -m venv .venv && .venv/bin/pip install -r requirements.txt.");
  const args = ["-m", "oracle.runner", "--baseline", baseline, "--candidate", candidate, "--baseline-ref", run.baselineCommit || run.baselineRef, "--candidate-ref", run.candidateCommit || run.targetRef];
  if (classifications) args.push("--classifications", JSON.stringify(classifications));
  const result = await execute(python, args, { timeout: 90000 });
  if (result.code !== 0) throw new Error(`Independent oracle exited ${result.code}: ${result.stderr.slice(-1500)}`);
  const evidence = JSON.parse(result.stdout) as Evidence;
  if (!evidence.verdict || !Array.isArray(evidence.cases) || !Array.isArray(evidence.invariants) || !Number.isFinite(evidence.summary?.total)) throw new Error("Oracle returned invalid evidence.");
  const sourceHashes: Record<string, string> = {};
  for (const file of (await readdir(path.resolve("oracle"))).filter(file => file.endsWith(".py")).sort()) {
    sourceHashes[`oracle/${file}`] = createHash("sha256").update(await readFile(path.resolve("oracle", file))).digest("hex");
  }
  evidence.verificationEngine = { gitCommit: await checked("git", ["rev-parse", "HEAD"]), sourceHashes, repositoryStatus: await checked("git", ["status", "--porcelain"]) };
  return evidence;
}
async function capture(id: string) {
  step(id, "oracleSteps", 0, "running", "Capturing and executing the original financial behavior before modernization.");
  const run = requireRun(id), dir = runDirectory(id); await mkdir(dir, { recursive: true, mode: 0o700 });
  let baselinePath: string, baselineCommit: string | undefined;
  if (run.mode === "repository") { const checkout = await resolveCheckout(run, run.baselineRef, "baseline"); baselinePath = checkout.adapter; baselineCommit = checkout.commit; }
  else {
    const source = path.resolve("demo/baseline/calculator.py"); baselinePath = path.join(dir, "baseline.py"); await copyFile(source, baselinePath);
    baselineCommit = await checked("git", ["rev-parse", "HEAD"]);
  }
  update(id, r => { r.baselinePath = baselinePath; r.baselineCommit = baselineCommit; });
  const baselineRun = requireRun(id);
  const captured = await runOracle({ ...baselineRun, candidateCommit: baselineCommit, targetRef: baselineRun.baselineRef }, baselinePath, baselinePath);
  await writeFile(path.join(dir, "baseline-capture.json"), JSON.stringify(captured, null, 2), { mode: 0o600 });
  const source = await readFile(baselinePath); const sha = createHash("sha256").update(source).digest("hex");
  audit(id, "baseline_captured", `sha256:${sha}; commit:${baselineCommit}; ${captured.summary.total} case assessments; ${captured.verdict}`);
  step(id, "oracleSteps", 0, "completed", `Immutable baseline source ${sha.slice(0, 12)} · ${captured.summary.total} assessed cases. ${run.mode !== "repository" ? "Bundled fixture at captured app commit, not the entered remote branch." : "Resolved remote commit captured."}`);
  step(id, "oracleSteps", 1, "completed", `${captured.invariants.length} curated financial policies supported by AST/source analysis.`);
  step(id, "oracleSteps", 2, "completed", "Explicit financial contract policies; candidate changes are not automatically authorized.");
  step(id, "oracleSteps", 3, "completed", "Golden, boundary, invalid-input, Hypothesis, metamorphic and Decimal reference checks executed independently.");
}
async function verify(id: string, classifications?: Record<string, Classification>) {
  let run = requireRun(id); if (!run.baselinePath) throw new RunError("Capture the baseline before verifying.");
  step(id, "oracleSteps", 4, "running", "Retrieving the candidate without changing the captured baseline.");
  let candidatePath: string, candidateCommit: string;
  if (run.mode === "repository") { const checkout = await resolveCheckout(run, run.targetRef, "candidate"); candidatePath = checkout.adapter; candidateCommit = checkout.commit; }
  else {
    const source = path.resolve(`demo/${run.mode === "demo-regression" ? "regression" : "preserved"}/calculator.py`);
    candidatePath = path.join(runDirectory(id), "candidate.py"); await copyFile(source, candidatePath); candidateCommit = await checked("git", ["rev-parse", "HEAD"]);
  }
  update(id, r => { r.candidatePath = candidatePath; r.candidateCommit = candidateCommit; });
  step(id, "oracleSteps", 4, "completed", run.mode === "repository" ? `Candidate commit ${candidateCommit.slice(0, 12)} retrieved.` : `Actual bundled ${run.mode === "demo-regression" ? "controlled regression" : "preserving modernization"} fixture. Not an agent-generated implementation.`);
  step(id, "oracleSteps", 5, "running", "Executing both versions against the independent Python oracle.");
  run = requireRun(id);
  const evidence = await runOracle(run, run.baselinePath!, candidatePath, classifications);
  evidence.limitations.push(run.mode === "repository" ? "Trusted local Python adapter execution; not a security sandbox. No candidate dependencies were auto-installed." : "Bundled fixtures are a controlled executable demonstration, not proof that an external coding agent completed a modernization.");
  if (run.mode !== "repository") { evidence.baseline.ref = `bundled-baseline@${run.baselineCommit}`; evidence.candidate.ref = `bundled-${run.mode === "demo-regression" ? "controlled-regression" : "preserved"}@${candidateCommit}`; }
  await writeFile(path.join(runDirectory(id), `evidence-${Date.now()}.json`), JSON.stringify(evidence, null, 2), { mode: 0o600 });
  update(id, r => {
    for (const remediation of r.remediations || []) {
      for (const finding of evidence.findings) if (remediation.findingIds.includes(finding.id)) finding.remediationWorkOrder = remediation.workOrder;
      const remaining = evidence.findings.some(f => remediation.findingIds.includes(f.id));
      if (!remaining && evidence.verdict === "BEHAVIORAL INTEGRITY: VERIFIED") {
        remediation.resolvedAt = evidence.generatedAt;
        remediation.lastVerifiedCandidate = candidateCommit;
      } else { remediation.resolvedAt = undefined; remediation.lastVerifiedCandidate = undefined; }
    }
    r.evidence = evidence; r.status = "completed"; r.error = undefined;
  });
  step(id, "oracleSteps", 5, "completed", `${evidence.summary.total} case assessments · ${evidence.summary.failed} failed · ${evidence.summary.durationMs}ms.`);
  step(id, "oracleSteps", 6, "completed", evidence.verdict);
  audit(id, "verification_completed", evidence.verdict);
}
export function startVerification(id: string, raw: unknown) {
  const input = verifySchema.parse(raw); const run = requireRun(id);
  if (!run.baselinePath || run.oracleSteps[0].status !== "completed") throw new RunError("Successful baseline capture has not completed. Create a new run if original capture failed.", 409);
  if (jobs.has(id) || mutations.has(id)) throw new RunError("This run is busy.", 409);
  const known = new Set(run.evidence?.invariants.map(i => i.id) || []);
  if (input.classifications && Object.keys(input.classifications).some(k => !known.has(k))) throw new RunError("Classification must reference an existing invariant ID.");
  if (run.mode !== "repository" && input.targetRef && input.targetRef !== run.targetRef) throw new RunError("A built-in demo uses a fixed, labeled candidate fixture. Create a repository run to verify a real Git ref.");
  if (run.mode === "repository" && process.env.ALLOW_REPOSITORY_EXECUTION !== "true") throw new RunError("Trusted repository execution is disabled.", 403);
  const classifications = { ...Object.fromEntries((run.evidence?.invariants || []).map(i => [i.id, i.classification])), ...input.classifications };
  update(id, r => { r.status = "running"; r.error = undefined; r.evidence = undefined; if (input.targetRef) r.targetRef = input.targetRef; r.oracleSteps.slice(4).forEach(s => { s.status = "pending"; s.detail = undefined; }); });
  audit(id, "verification_started", JSON.stringify({ targetRef: input.targetRef || run.targetRef, classifications }));
  launch(id, () => verify(id, classifications)); return requireRun(id);
}
export async function submitRun(id: string) { return serialize(id, async () => {
  const run = requireRun(id); if (run.workOrder) return run;
  if (!run.baselinePath || run.oracleSteps[0].status !== "completed") throw new RunError("A successfully executed baseline is required before submission.", 409);
  const connected = await connection(true); if (!connected.connected) throw new RunError(connected.message, 503);
  step(id, "factorySteps", 0, "running", "Submitting through the documented 8090 work-order batch API.");
  try {
    const order = await createFactoryWorkOrder(`Modernize financial amortization calculator · ${run.id.slice(0, 8)}`, modernizationDescription(run), run.projectId, `invariant-modernize-${run.id}`, order => update(id, r => { r.workOrder = order; r.handoff = agentHandoff(r); }));
    update(id, r => { r.workOrder = order; r.handoff = agentHandoff(r); });
    step(id, "factorySteps", 0, "completed", `Real WO-${order.number} created in 8090.`);
    step(id, "factorySteps", 3, "completed", `WO-${order.number} · ${order.status}`);
    step(id, "factorySteps", 1, "awaiting_action", "Use the native 8090 agent to generate/link requirements. Work-order creation does not generate them automatically.");
    step(id, "factorySteps", 2, "awaiting_action", "Native 8090 blueprint generation requires agent action.");
    step(id, "factorySteps", 4, "awaiting_action", "Launch an MCP-connected coding agent and complete OAuth authentication. No automatic dispatch endpoint is documented.");
    audit(id, "modernization_submitted", `WO-${order.number}`); return requireRun(id);
  } catch (e) { step(id, "factorySteps", 0, "failed", e instanceof Error ? e.message : "Submission failed."); throw e; }
}); }
async function synchronize(id: string) {
  const run = requireRun(id); if (!run.workOrder) throw new RunError("Submit a work order first.");
  const [orderResponse, prsResponse] = await Promise.all([factoryRequest(`/work_orders/${run.workOrder.id}`), factoryRequest(`/work_orders/${run.workOrder.id}/pull_requests`)]);
  let data = unwrap(orderResponse);
  if (!data.markdown_content || run.workOrder.descriptionPending) {
    await replaceDescription(run.workOrder.id, modernizationDescription(run));
    data = unwrap(await factoryRequest(`/work_orders/${run.workOrder.id}`));
    step(id, "factorySteps", 0, "completed", `Real WO-${run.workOrder.number} with complete modernization context.`);
    step(id, "factorySteps", 3, "completed", `WO-${run.workOrder.number} created.`);
  }
  const order = normalizeWorkOrder(data, run.projectId);
  const context = (data.connected_context || data.connectedContext || []) as { resourceType: string; resourceId: string }[];
  // Only linked artifacts are evidence of THIS run's generation; unrelated project documents do not complete the track.
  const requirementLinks = context.filter(c => c.resourceType === "requirement" || c.resourceType === "requirements" || c.resourceType === "requirements_document");
  const blueprintLinks = context.filter(c => c.resourceType === "blueprint");
  const requirements = await Promise.all(requirementLinks.map(async c => ({ ...unwrap(await factoryRequest(`/requirements/${c.resourceId}`)), url: `https://factory.8090.ai/project/${run.projectId}/requirements/${c.resourceId}` })));
  const blueprints = await Promise.all(blueprintLinks.map(async c => ({ ...unwrap(await factoryRequest(`/blueprints/${c.resourceId}`)), url: `https://factory.8090.ai/project/${run.projectId}/blueprints/${c.resourceId}` })));
  const pullRequests = items(prsResponse);
  update(id, r => { r.workOrder = order; r.artifacts = { requirements, blueprints, workOrders: [data], pullRequests }; });
  if (requirements.length) step(id, "factorySteps", 1, "completed", `${requirements.length} actual linked requirement document(s).`);
  if (blueprints.length) step(id, "factorySteps", 2, "completed", `${blueprints.length} actual linked blueprint(s).`);
  if (data.assignee || order.status === "in_progress" || order.status === "in_review" || order.status === "completed") step(id, "factorySteps", 4, "completed", `8090 recorded ${data.assignee ? "an assignee" : order.status}. This does not independently prove agent execution.`);
  if (order.status === "in_review" || order.status === "completed" || order.status === "done") step(id, "factorySteps", 5, "completed", `8090 status: ${order.status}; verify the actual candidate independently.`);
  if (pullRequests.length) step(id, "factorySteps", 6, "completed", `${pullRequests.length} actual linked PR(s). No auto-merge or approval.`);
  // Fetch remediation status too; re-verification is still explicit and uses the full suite.
  const evidence = requireRun(id).evidence;
  if (evidence) for (const finding of evidence.findings) if (finding.remediationWorkOrder) {
    let response = unwrap(await factoryRequest(`/work_orders/${finding.remediationWorkOrder.id}`));
    if (!response.markdown_content || finding.remediationWorkOrder.descriptionPending) {
      const selected = evidence.findings.filter(f => f.remediationWorkOrder?.id === finding.remediationWorkOrder!.id).map(f => f.id);
      await replaceDescription(finding.remediationWorkOrder.id, remediationDescription(requireRun(id), selected));
      response = unwrap(await factoryRequest(`/work_orders/${finding.remediationWorkOrder.id}`));
    }
    const current = normalizeWorkOrder(response, run.projectId);
    update(id, r => { const f = r.evidence?.findings.find(f => f.id === finding.id); if (f) f.remediationWorkOrder = current; });
  }
  for (const remediation of requireRun(id).remediations || []) {
    const current = normalizeWorkOrder(unwrap(await factoryRequest(`/work_orders/${remediation.workOrder.id}`)), run.projectId);
    update(id, r => { const rem = r.remediations?.find(m => m.workOrder.id === current.id); if (rem) rem.workOrder = current; });
  }
  audit(id, "factory_synced", `WO-${order.number}: ${order.status}`); return requireRun(id);
}
export async function syncRun(id: string) { return serialize(id, () => synchronize(id)); }
export async function attachRun(id: string, raw: unknown) { return serialize(id, async () => {
  const { workOrderId } = z.object({ workOrderId: z.uuid() }).parse(raw);
  const run = requireRun(id);
  if (run.workOrder && run.workOrder.id !== workOrderId) throw new RunError("A work order is already associated with this run.", 409);
  const data = unwrap(await factoryRequest(`/work_orders/${workOrderId}`));
  if (!data.markdown_content) throw new RunError("The existing work order must include its actual modernization context before association.");
  const order = normalizeWorkOrder(data, run.projectId);
  update(id, r => { r.workOrder = order; r.handoff = agentHandoff(r); });
  step(id, "factorySteps", 0, "completed", `Existing real WO-${order.number} associated; no duplicate request was submitted.`);
  step(id, "factorySteps", 3, "completed", `WO-${order.number} retrieved from the configured project.`);
  audit(id, "existing_work_order_attached", `WO-${order.number}`);
  return synchronize(id);
}); }
export async function remediateRun(id: string, raw: unknown) { return serialize(id, async () => {
  const input = z.object({ findingIds: z.array(z.string()).min(1).max(100), workOrderId: z.uuid().optional() }).parse(raw);
  const run = requireRun(id); if (!run.evidence) throw new RunError("Execute independent verification first.");
  const selected = run.evidence.findings.filter(f => input.findingIds.includes(f.id));
  if (selected.length !== new Set(input.findingIds).size) throw new RunError("Unknown finding selected.");
  if (selected.some(f => f.remediationWorkOrder)) throw new RunError("A remediation work order already exists for one of these findings.", 409);
  if (selected.some(f => f.classification !== "MUST_PRESERVE")) throw new RunError("Review unknown/intentional-change findings before requesting corrective remediation.");
  let order;
  if (input.workOrderId) {
    const data = unwrap(await factoryRequest(`/work_orders/${input.workOrderId}`));
    if (!data.markdown_content) throw new RunError("Existing remediation must have its actual correction context.");
    order = normalizeWorkOrder(data, run.projectId);
    update(id, r => { r.remediations ||= []; r.remediations.push({ workOrder: order!, findingIds: input.findingIds, createdAt: new Date().toISOString() }); });
  } else order = await createFactoryWorkOrder(`Fix amortization behavioral drift · ${run.id.slice(0, 8)}`, remediationDescription(run, input.findingIds), run.projectId, `invariant-remediate-${run.id}-${createHash("sha256").update(input.findingIds.slice().sort().join(",")).digest("hex").slice(0, 16)}`, order => update(id, r => {
    for (const f of r.evidence!.findings) if (input.findingIds.includes(f.id)) f.remediationWorkOrder = order;
    r.remediations ||= []; r.remediations.push({ workOrder: order, findingIds: input.findingIds, createdAt: new Date().toISOString() });
  }));
  update(id, r => {
    for (const f of r.evidence!.findings) if (input.findingIds.includes(f.id)) f.remediationWorkOrder = order;
    const rem = r.remediations?.find(m => m.workOrder.id === order.id); if (rem) rem.workOrder = order;
  });
  audit(id, input.workOrderId ? "remediation_associated" : "remediation_created", `WO-${order.number}: ${input.findingIds.join(",")}`); return requireRun(id);
}); }
export function dashboardStats() { const runs = listRuns().map(recoverRun); return { runs, stats: { runs: runs.length, regressions: runs.reduce((n,r) => n + (r.evidence?.findings.filter(f => f.classification === "MUST_PRESERVE").length || 0), 0), invariants: runs.reduce((n,r) => n + (r.evidence?.invariants.filter(i => i.status === "passed" || i.status === "verified").length || 0), 0), reports: runs.filter(r => r.evidence).length } }; }
