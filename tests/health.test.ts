import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
process.env.INVARIANT_DATA_DIR = mkdtempSync(path.join(tmpdir(), "invariant-health-"));

test("readiness opens SQLite without Factory credentials or exposing environment", async () => {
  const { GET } = await import("../app/api/health/route");
  const response = await GET();
  assert.equal(response.status, 200); assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), { status: "ok" });
});
