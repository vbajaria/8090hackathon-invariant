import { test } from "node:test";
import assert from "node:assert/strict";
import { body } from "../lib/http";
import { createRunSchema, verifySchema } from "../lib/runs";
import { childEnvironment } from "../lib/process";

test("reject cross-origin writes, simple form CSRF, and oversized bodies", async () => {
  await assert.rejects(body(new Request("http://localhost:3000/api/runs", { method: "POST", headers: { origin: "https://attacker.example", host: "localhost:3000", "content-type": "application/json" }, body: "{}" })), /Cross-origin/);
  await assert.rejects(body(new Request("http://localhost:3000/api/runs", { method: "POST", headers: { "content-type": "text/plain" }, body: "{}" })), /Content-Type/);
  await assert.rejects(body(new Request("http://localhost:3000/api/runs", { method: "POST", headers: { "content-type": "application/json" }, body: " ".repeat(50001) })), /50KB/);
  assert.deepEqual(await body(new Request("http://localhost:3000/api/runs", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })), {});
});

test("Git inputs cannot become command options or arbitrary network targets", () => {
  const input = { repository: "https://github.com/vbajaria/8090hackathon-invariant", baselineRef: "main", targetRef: "safe/branch", request: "Preserve financial behavior", mode: "repository" };
  assert.equal(createRunSchema.safeParse(input).success, true);
  for (const repository of ["https://localhost/repo", "file:///etc/passwd", "git@github.com:user/repo", "https://github.com/user/repo;echo pwned"]) assert.equal(createRunSchema.safeParse({ ...input, repository }).success, false);
  for (const targetRef of ["--upload-pack=evil", "main; rm -rf /", "../HEAD", "main~1", "HEAD^{commit}", "foo.lock"]) assert.equal(verifySchema.safeParse({ targetRef }).success, false);
});

test("child processes never receive integration credentials", () => {
  const old = process.env.FACTORY_API_KEY; process.env.FACTORY_API_KEY = "fixture";
  try { const env = childEnvironment(); assert.equal(env.FACTORY_API_KEY, undefined); assert.equal(env.GITHUB_TOKEN, undefined); assert.equal(env.PYTHONNOUSERSITE, "1"); }
  finally { if (old === undefined) delete process.env.FACTORY_API_KEY; else process.env.FACTORY_API_KEY = old; }
});
