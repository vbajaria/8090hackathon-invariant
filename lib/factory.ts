import { randomUUID } from "node:crypto";
import type { Connection, Run, WorkOrder } from "./types";

export const FACTORY_BASE = "https://api.factory.8090.dev/v2/external-api";
export const MCP_DOCS = "https://docs.8090.ai/connections/connect-coding-agent";
export function projectId() { return process.env.FACTORY_PROJECT_ID || "111f2375-bea8-4c31-8eb4-dca7f3398144"; }
export function projectUrl(id: string) { return `https://factory.8090.ai/project/${id}`; }
export class FactoryError extends Error { constructor(message: string, public status = 502) { super(message); } }
function redact(text: string) {
  const key = process.env.FACTORY_API_KEY;
  return key ? text.split(key).join("[REDACTED]") : text;
}
export async function factoryRequest(endpoint: string, method = "GET", body?: unknown): Promise<Record<string, unknown>> {
  const key = process.env.FACTORY_API_KEY;
  if (!key) throw new FactoryError("Set FACTORY_API_KEY server-side to connect to 8090. No simulated integration is used.", 503);
  const response = await fetch(`${FACTORY_BASE}${endpoint}`, {
    method, headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body), cache: "no-store", signal: AbortSignal.timeout(20000),
  });
  const text = await response.text();
  if (!response.ok) throw new FactoryError(`8090 returned HTTP ${response.status}: ${redact(text).slice(0, 800)}`, response.status === 401 || response.status === 403 ? 503 : 502);
  try { return JSON.parse(text) as Record<string, unknown>; } catch { throw new FactoryError("8090 returned an invalid JSON response."); }
}
let cached: { value: Connection; until: number } | undefined;
export async function connection(force = false): Promise<Connection> {
  if (!force && cached && cached.until > Date.now()) return cached.value;
  const value: Connection = { configured: !!process.env.FACTORY_API_KEY, connected: false, projectId: projectId(), message: "Configure FACTORY_API_KEY on the server. Credentials are never sent to the browser.", checkedAt: new Date().toISOString(), docsUrl: MCP_DOCS };
  if (value.configured) {
    try { const health = await factoryRequest("/health"); value.connected = health.status === "healthy"; value.message = value.connected ? "Authenticated with the real 8090 External API. Coding-agent execution requires a separate OAuth MCP session." : "8090 returned an unexpected health response."; }
    catch (e) { value.message = e instanceof Error ? e.message : "8090 connection failed."; }
  }
  cached = { value, until: Date.now() + 30000 };
  return value;
}
export function unwrap(value: Record<string, unknown>): Record<string, unknown> { return (value.data || value) as Record<string, unknown>; }
export function items(value: Record<string, unknown>): Record<string, unknown>[] {
  const data = unwrap(value); return (Array.isArray(data.items) ? data.items : Array.isArray(value.data) ? value.data : []) as Record<string, unknown>[];
}
export function normalizeWorkOrder(data: Record<string, unknown>, id: string): WorkOrder {
  return { id: String(data.id || data.work_order_id), number: Number(data.work_order_number || data.number), title: String(data.title), status: String(data.status || "backlog"), url: `${projectUrl(id)}/work-orders/${Number(data.work_order_number || data.number)}` };
}
export async function writingRules(): Promise<string> {
  const response = unwrap(await factoryRequest("/skills/work_orders_writing_rules"));
  if (typeof response.markdown_content !== "string") throw new FactoryError("Cannot read project work-order writing rules; work order not created.");
  return response.markdown_content;
}
export async function createFactoryWorkOrder(title: string, description: string, id: string, requestId: string, onCreated?: (order: WorkOrder) => void): Promise<WorkOrder> {
  // Read live project rules before every write; the request shape follows the documented batch API.
  await writingRules();
  const operationId = "create";
  const result = await factoryRequest("/work_orders/batch_create", "POST", {
    request_id: requestId, operations: [{ operation_id: operationId, operation_type: "CreateWorkOrder", patch: { title } }],
  });
  const results = result.results as Record<string, Record<string, unknown>> | undefined;
  const created = results?.[operationId];
  if (result.status !== "Succeeded" || created?.status !== "succeeded" || !created.work_order_id) throw new FactoryError(`8090 did not create the work order: ${JSON.stringify(result).slice(0, 1000)}`);
  const order: WorkOrder = { id: String(created.work_order_id), number: Number(created.work_order_number), title, status: "backlog", url: `${projectUrl(id)}/work-orders/${created.work_order_number}`, descriptionPending: true };
  // Persist the returned identity before the separate description write: a timeout must not create a duplicate on retry.
  onCreated?.(order);
  await replaceDescription(order.id, description);
  const data = unwrap(await factoryRequest(`/work_orders/${order.id}`));
  if (data.markdown_content !== description) throw new FactoryError(`WO-${order.number} was created but its description did not persist. Sync artifacts to retry attaching the evidence.`);
  return normalizeWorkOrder(data, id);
}
export async function replaceDescription(orderId: string, description: string) {
  await writingRules();
  return factoryRequest(`/work_orders/${orderId}/description`, "PATCH", { markdown_content: description });
}
export function modernizationDescription(run: Run) {
  return `## Summary\n\nModernize the Python financial calculator in ${run.repository} while preserving independently captured financial behavior. INVARIANT run ${run.id} records the baseline and independently verifies the resulting implementation.\n\n## In Scope\n\n- Python calculation layer and its tests only (approximately 5–10 files).\n- Baseline: ${run.baselineRef}${run.baselineCommit ? ` (${run.baselineCommit})` : " (built-in fixture label, not a remote commit)"}.\n- Obtain native requirements and blueprint context through 8090 before implementation.\n- Create a working branch and PR; return the immutable candidate commit to INVARIANT.\n\n## Out of Scope\n\n- Changes to INVARIANT's oracle, policies, captured baseline, evidence, or web UI.\n- Merging or approving a pull request.\n- Treating agent-written tests as independent verification.\n\n## Requirements\n\n${run.request}\n\nTest:\n\n* Zero-interest loans.\n* Positive interest.\n* Invalid inputs.\n* Partial prepayment.\n* Full prepayment.\n* Rounding boundaries.\n* Large principal values.\n\nCapture the original behavior before modernization.\n\nSource: Initial Requirements, §7. The source has no numbered acceptance criteria; no requirement IDs have been invented.\n\n## Blueprints\n\n- Pending native 8090 generation; use the project's authenticated agent to create/link the relevant Python calculation blueprint, not a duplicate specification in INVARIANT.\n`;
}
export function agentHandoff(run: Run) {
  return `INVARIANT → 8090 coding-agent handoff\n\nThis is an instruction, NOT an automatically executing agent session.\n\n1. Connect your coding agent to https://api.factory.8090.dev/v2/mcp with X-Sofa-Mcp-Project-Id: ${run.projectId}. Complete the browser OAuth sign-in. Guide: ${MCP_DOCS}\n2. Read ${run.workOrder ? `WO-${run.workOrder.number} (${run.workOrder.id})` : "the modernization work order after it is submitted"}, project skills, linked requirements and blueprints through 8090 MCP. Ask the native 8090 project agent to generate/link missing requirements and blueprint context before coding.\n3. Work on ${run.repository}; preserve the captured baseline ${run.baselineCommit || run.baselineRef}. ${run.mode !== "repository" ? "For the bundled demo, use demo/baseline/calculator.py as original and provide a standalone invariant_adapter.py exporting calculate for repository-mode verification." : "The candidate must expose invariant_adapter.py with the documented calculate contract."}\n4. Implement: ${run.request}\n5. Do not edit INVARIANT oracle/policies/baseline or auto-merge the PR. Push an implementation branch, open and link the actual PR to the work order, and update its status through MCP.\n6. Return the immutable candidate commit to INVARIANT, enable trusted repository execution on its server, and run independent verification. Creating this handoff or work order does not mean requirements, blueprints or implementation are complete.\n\nRun: ${run.id}\n`;
}
export function remediationDescription(run: Run, selected: string[]) {
  const findings = run.evidence!.findings.filter(f => selected.includes(f.id));
  return `## Summary\n\nCorrect the independently observed financial regressions in INVARIANT run ${run.id}. Preserve the oracle and reproduce the findings before changing the Python calculation layer.\n\n## In Scope\n\n${findings.map(f => `### ${f.invariantId}: ${f.title}\n\n- Classification: ${f.classification}; severity: ${f.severity}.\n- Input: \`${JSON.stringify(f.input)}\`.\n- Original: \`${JSON.stringify(f.original)}\`.\n- Candidate: \`${JSON.stringify(f.candidate)}\`.\n- Source: ${f.sourceLocations.map(l => `${l.file}:${l.line}`).join(", ")}.\n- Suggested correction: ${f.recommendation}\n`).join("\n")}\n- Re-run the counterexample and the full independent regression suite after pushing the fix.\n- Baseline SHA-256: ${run.evidence!.baseline.sha256}; candidate SHA-256: ${run.evidence!.candidate.sha256}.\n- ${run.mode === "demo-regression" ? "Controlled demo regression: this is not claimed to be an agent-introduced defect." : "Evidence comes from actual Python execution."}\n\n## Out of Scope\n\n- Editing the verification oracle, classifications, or captured baseline.\n- Merging or approving the PR.\n\n## Requirements\n\nEvery finding must include:\n\n* Invariant ID.\n* Classification.\n* Severity.\n* Original result.\n* New result.\n* Reproduction input.\n* Source locations.\n* Suggested correction.\n\nSource: Initial Requirements, §4 and §6; evidence above specializes the measured counterexamples without inventing numbered requirements.\n\n## Blueprints\n\n- Read the modernization work order's native 8090 Python calculation blueprint${run.workOrder ? ` (WO-${run.workOrder.number})` : " when available"}.\n`;
}
export const newRequestId = () => randomUUID();
