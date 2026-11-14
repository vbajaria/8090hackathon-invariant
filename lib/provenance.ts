import { existsSync } from "node:fs";
import path from "node:path";
import { checked } from "./process";

export type ApplicationSource = {
  gitCommit?: string;
  repositoryStatus: string;
  kind: "git" | "container";
  sourceDirty: boolean | null;
};

/** Preserve real source provenance without copying a developer's .git/credentials into an image. */
export async function applicationSource(cwd = process.cwd(), environment: Record<string, string | undefined> = process.env): Promise<ApplicationSource> {
  if (existsSync(/* turbopackIgnore: true */ path.join(cwd, ".git"))) {
    const gitCommit = await checked("git", ["rev-parse", "HEAD"], cwd);
    const repositoryStatus = await checked("git", ["status", "--porcelain"], cwd);
    return { gitCommit, repositoryStatus, kind: "git", sourceDirty: repositoryStatus !== "" };
  }
  const revision = environment.INVARIANT_SOURCE_COMMIT?.trim();
  if (revision && revision !== "unknown" && !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i.test(revision)) {
    throw new Error("INVARIANT_SOURCE_COMMIT must be a full Git revision or unknown.");
  }
  const dirty = environment.INVARIANT_SOURCE_DIRTY;
  const sourceDirty = dirty === "true" ? true : dirty === "false" ? false : null;
  return {
    gitCommit: revision && revision !== "unknown" ? revision : undefined,
    kind: "container", sourceDirty,
    repositoryStatus: sourceDirty === true ? "Uncommitted changes were present in the image build context."
      : sourceDirty === false ? "" : "Image source cleanliness is unknown; Git metadata is not included.",
  };
}
