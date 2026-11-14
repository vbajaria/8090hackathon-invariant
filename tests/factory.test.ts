import { test } from "node:test";
import assert from "node:assert/strict";
import { createFactoryWorkOrder, factoryRequest, items, normalizeWorkOrder } from "../lib/factory";

test("documented batch creation attaches and verifies markdown through the separate supported endpoint", async () => {
  const original = global.fetch, key = process.env.FACTORY_API_KEY;
  process.env.FACTORY_API_KEY = "test-key-never-a-real-credential";
  const calls: { path: string; method: string; body: unknown }[] = [];
  const description = "## Summary\nReal evidence";
  global.fetch = async (input, init) => {
    const path = String(input).replace("https://api.factory.8090.dev/v2/external-api", "");
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ path, method: init?.method || "GET", body });
    if (path.startsWith("/skills/")) return Response.json({ data: { markdown_content: "Writing rules fixture" } });
    if (path === "/work_orders/batch_create") return Response.json({ status: "Succeeded", results: { create: { status: "succeeded", work_order_id: "1eced94a-3552-4c51-94df-28f0d032fe3b", work_order_number: 42 } } });
    if (path.endsWith("/description")) return Response.json({ data: {} });
    return Response.json({ data: { id: "1eced94a-3552-4c51-94df-28f0d032fe3b", work_order_number: 42, title: "Modernize", status: "backlog", markdown_content: description } });
  };
  try {
    let recorded = false;
    const order = await createFactoryWorkOrder("Modernize", description, "111f2375-bea8-4c31-8eb4-dca7f3398144", "fixture-request", o => { recorded = o.descriptionPending === true; });
    assert.equal(order.number, 42); assert.equal(recorded, true);
    assert.equal(calls[0].path, "/skills/work_orders_writing_rules");
    const create = calls.find(c => c.path === "/work_orders/batch_create")!;
    assert.deepEqual((create.body as {operations: {patch: unknown}[]}).operations[0].patch, { title: "Modernize" });
    const patch = calls.find(c => c.path.endsWith("/description"))!;
    assert.equal(patch.method, "PATCH"); assert.deepEqual(patch.body, { markdown_content: description });
  } finally { global.fetch = original; if (key === undefined) delete process.env.FACTORY_API_KEY; else process.env.FACTORY_API_KEY = key; }
});

test("Factory failures redact credentials and missing credentials never simulate success", async () => {
  const original = global.fetch, key = process.env.FACTORY_API_KEY;
  try {
    delete process.env.FACTORY_API_KEY;
    await assert.rejects(factoryRequest("/health"), /Set FACTORY_API_KEY/);
    process.env.FACTORY_API_KEY = "redact-me-test";
    global.fetch = async () => new Response("bad token redact-me-test", { status: 401 });
    await assert.rejects(factoryRequest("/health"), e => e instanceof Error && !e.message.includes("redact-me-test") && e.message.includes("[REDACTED]"));
  } finally { global.fetch = original; if (key === undefined) delete process.env.FACTORY_API_KEY; else process.env.FACTORY_API_KEY = key; }
});

test("documented response envelopes normalize without fabricated IDs", () => {
  assert.deepEqual(items({ items: [{ id: "real" }] }), [{ id: "real" }]);
  const order = normalizeWorkOrder({ id: "real", work_order_number: 7, title: "actual", status: "in_review" }, "111f2375-bea8-4c31-8eb4-dca7f3398144");
  assert.equal(order.status, "in_review"); assert.match(order.url!, /work-orders\/7$/);
});
