import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { applicationSource } from "../lib/provenance";
import { checked } from "../lib/process";

const withoutGit = mkdtempSync(path.join(tmpdir(), "invariant-image-source-"));

test("real checkout provenance takes precedence over image metadata", async () => {
  const source = await applicationSource(process.cwd(), { INVARIANT_SOURCE_COMMIT: "a".repeat(40), INVARIANT_SOURCE_DIRTY: "false" });
  assert.equal(source.kind, "git");
  assert.equal(source.gitCommit, await checked("git", ["rev-parse", "HEAD"]));
});

test("images record an actual supplied revision and explicit dirty build context", async () => {
  const source = await applicationSource(withoutGit, { INVARIANT_SOURCE_COMMIT: "a".repeat(40), INVARIANT_SOURCE_DIRTY: "true" });
  assert.equal(source.gitCommit, "a".repeat(40)); assert.equal(source.sourceDirty, true); assert.equal(source.kind, "container");
  assert.match(source.repositoryStatus, /Uncommitted changes/);
});

test("images without revision metadata never invent a Git commit", async () => {
  const source = await applicationSource(withoutGit, {});
  assert.equal(source.gitCommit, undefined); assert.equal(source.sourceDirty, null); assert.match(source.repositoryStatus, /unknown/);
});

test("clean image builds and unknown revision sentinel are explicit", async () => {
  const source = await applicationSource(withoutGit, { INVARIANT_SOURCE_COMMIT: "unknown", INVARIANT_SOURCE_DIRTY: "false" });
  assert.equal(source.gitCommit, undefined); assert.equal(source.sourceDirty, false); assert.equal(source.repositoryStatus, "");
});

test("invalid image revision cannot become fabricated provenance", async () => {
  await assert.rejects(applicationSource(withoutGit, { INVARIANT_SOURCE_COMMIT: "main; not-a-commit" }), /full Git revision/);
});
