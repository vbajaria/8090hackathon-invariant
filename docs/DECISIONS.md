# INVARIANT decision log

## 2026-11-14 — Initial architecture
- Build a single Next.js/TypeScript application with server-side SQLite persistence and a separate Python oracle invoked as a bounded subprocess. This keeps deployment simple without making the producer its own judge.
- The external API uses project-scoped `sofa-ext-` keys. No key is present in the workspace. Missing authentication must remain visible, never replaced with fake successful statuses.
- Use only documented REST endpoints. Native requirements/blueprint generation and coding-agent execution require an authenticated 8090 handoff; creating a work order alone is not implementation.
- Start with an executable financial amortization adapter, a behavior-preserving refactor, and a separately labeled controlled regression. All evidence comes from actual Python execution. Arbitrary repositories require the documented adapter contract and trusted local execution opt-in.
- Never merge or approve modernization PRs. Finite verification is evidence, not formal proof.

## 2026-11-14 — Real integration and verification findings
- Authenticated `/health` returned 200. Created real modernization WO-1 and remediation WO-2 for the controlled regression; no credentials are committed or returned to the client.
- Live API testing showed `CreateWorkOrder` accepts the title but does not persist an undocumented `description` patch field. Use the documented `PATCH /work_orders/{id}/description` with `markdown_content`, verify the returned description, and persist the new order identity before attachment so retry cannot silently duplicate it.
- Keep captured sources/reports outside Git in private SQLite/runtime storage. Demo labels are fixture labels, not invented remote branches or commits; reports explicitly identify the fixture and actual containing commit.
- Harden oracle provenance: execute fresh source, detect source mutation, reject incomplete pytest coverage and infrastructure errors. Report Hypothesis search counts and bounded shrinking rather than claiming global minimality.
- Provide a real root `invariant_adapter.py` baseline so the same repository can be used for immutable Git checkout verification. Agent modernization and controlled-regression branches are separate from the application delivery branch.

## 2026-11-14 — Real financial workflow and import isolation
- Created native Factory requirement `a1b62fcf-5c16-4703-92bd-2ccde7db817a` and paired blueprint `d9f4d308-43c4-4426-822b-9c18d24ce6cb`, linked to WO-1/WO-2. Content awaits project review; references are real, not synthetic UI records.
- Native authenticated Factory subagent executed WO-1: PR #2 (`9236d57b867b69497220251e9f99671ea575b141`), 48 unit tests and strict mypy pass; independent oracle verifies 156/156 assessments. This was not an externally OAuth-authenticated MCP session.
- Separate NOT-FOR-MERGE controlled regression PR #3 (`2ced874262abbd504f78e27e47902af590fe9037`) ignores prepayment and produces genuine differential failures. WO-2 correction PR #4 (`320e9ec9d5d45532a98c05b3655ee357934fc86f`) verifies 156/156 with 8 focused unit tests. Nothing is merged or approved.
- Harden modular repository verification with separate persistent Python interpreter workers. A shared interpreter can incorrectly reuse baseline packages in the candidate. Ignore inherited PYTHONPATH, use each checkout's root, compile captured adapter bytes, strip credentials, distinguish worker transport failures from business violations.
- Clear the displayed current report when re-verification starts, preserving append-only report files and remediation history. A prior candidate's verdict must never appear to describe a newly selected ref.

## 2026-11-14 — End-to-end verification and operating model
- Application retrieved immutable remote Git commits for the real modernization, controlled drift and correction. Verified the preserving implementation, detected the controlled defect, associated existing WO-2, then verified the correction with full-suite execution. Use existing-order association to avoid duplicating modernization/remediation work.
- Persist remediation history across re-verification; mark a correction independently verified only after a verified full-suite report, without closing/merging/approving its PR.
- Record exact Python/pytest/Hypothesis versions, pin oracle dependencies, hash verification-engine files and loaded Python dependencies, and provide checkout-based replay commands in Markdown reports.
- Keep deployment to one long-running Node process with local Python and SQLite. Do not claim stateless/serverless support or hostile-code sandboxing. Provide optional HTTP Basic authentication for shared deployments; require HTTPS and a configured password outside the private development workspace.
- Use real API/browser/oracle tests. Keep React Flow's attribution, avoid formal-proof marketing, and retain explicit finite-scope limitations.

## 2026-11-14 — Rebuild and release checks
- Fresh workspace rebuild successfully installed the pinned dependencies and started the declared Next dev terminal. Ignored runtime data and credential files do not survive a clean rebuild: restored the credential-free evidence backup from Knowledge Base and recreated the server-only key file with mode 0600. No credential was uploaded with evidence. Production deployments must use persistent storage and securely provision environment variables.
- Ignore Next's generated `next-env.d.ts`, which differs between dev/build modes; run `next typegen` before type-checking so clean clones are supported.
- Add CI that runs API/security/orchestration, adversarial oracle, production build and real browser tests without external credentials or work-order mutations.
- Post-rebuild browser inspection confirmed restored real reports and authenticated API connectivity. Browser-extension recorder failures are platform diagnostics, not app errors; fixed the app's missing favicon. Real Playwright tests independently check browser page errors and report behavior.
- Fresh-rebuild production tracing attempted to follow the external virtualenv Python symlink. Mark runtime-only filesystem paths with supported Turbopack ignore annotations; the subsequent production build passes without warnings. The app still executes real local Python at runtime.
- Preserve previously recorded remediation links when upgrading/re-verifying older runs, instead of losing them when clearing stale evidence.

## 2026-11-14 — Explicitly authorized release merges
- The user explicitly requested merging the connected GitHub repository. Merge the application PR #1 into `main`, then retarget and merge the preserving financial modernization PR #2 into `main`.
- Use merge commits to preserve the original commit IDs referenced by behavioral evidence; do not squash/rewrite the verified history.
- Keep PR #3 (deliberately broken controlled regression) and PR #4 (correction of that demonstration branch) separate from `main`. The preserving implementation in PR #2 already has correct prepayment behavior; applying the demonstration-only patch to main would overwrite the modular adapter and add no release functionality.
- This is a direct user-authorized release action. INVARIANT itself still never auto-merges or approves a candidate based on finite verification.
- Integrate the current application base into the existing financial PR before its release merge. The integrated refactor passes 48 component tests and 156 independent case assessments; include the financial component tests in release CI.

## 2026-11-14 — Local Docker launcher
- Package Next.js, SQLite, Git and the independent Python oracle in one multi-stage Debian-based container; do not introduce a separate verification service or database server. Default local launch uses the compiled app, not a host-dependency/hot-reload bind mount.
- Bind only loopback on the development machine. Persist SQLite, captured repositories and evidence in a named volume; normal stop/rebuild never deletes it. Run as a non-root user with dropped Linux capabilities and no Docker socket mount.
- Exclude all developer .env files, .git metadata, runtime data and host dependencies from the build context. Runtime credentials come from the ignored private .env.docker, never build arguments or image layers.
- Record the genuine source revision and dirty-build indicator as non-secret build metadata. Images without metadata explicitly report an unknown revision; do not invent a synthetic Git repository/commit just to make verification execute. Real repository checkout commits and executed source hashes remain independent provenance.
- Use a cheap SQLite readiness check, independent of 8090 connectivity, with support for configured Basic authentication. Docker packaging is not a security sandbox for untrusted repository code.
- Validation completed on the real Docker Engine: image builds and runs as UID 1000; preserving fixture verified across 156 assessments, controlled regression detected across 1087 assessments, minimized witness and JSON/Markdown downloads checked. All 147 Python tests (99 oracle + 48 financial) and 15 Node tests pass. Basic-auth denial/acceptance, credential-free image inputs and normal stop/recreate persistence are verified. Add an isolated Docker CI job that executes the real image and deletes only its own ephemeral CI volume.

## 2026-11-14 — User-authorized Docker release merge
- The user explicitly requested merging all relevant completed work. Application PR #1 and preserving financial modernization PR #2 are already merged; merge Docker PR #5 into main after final-head checks pass.
- Retain merge-commit history so the source revisions used by verification evidence remain available. Confirm main contains the tested Docker release tree after merging.
- Keep controlled-regression PR #3 and demonstration correction PR #4 outside main. They are evidence-only branches, not unfinished release features; main already contains the correct modular prepayment implementation from PR #2.
- This authorization concerns repository release work only. The application continues to require explicit human action and never auto-merges a modernization candidate.

## 2026-11-14 — Remove CI at user request
- The user explicitly requested ignoring CI and removing it from this repository. Stop the prior CI wait, disable the GitHub Actions workflow, cancel its active runs, and delete .github/workflows/verify.yml.
- Keep all test suites, oracle execution, Docker health/smoke scripts and local verification commands. CI removal does not remove independent application verification or its safeguards.
- This decision supersedes the earlier CI-job and CI-gated release decisions. Merge the Docker release with CI removed under the user's existing explicit release authorization, without waiting for or relying on GitHub Actions.
- Preserve existing run history and evidence; do not delete demonstration branches or merge the intentionally broken regression/correction into main.

## 2026-11-14 — Light and dark application themes
- Add an accessible header toggle with a browser-local preference. Follow the system scheme until the user chooses a mode, synchronize across tabs, and keep toggling functional when storage is blocked.
- Apply the preference before initial paint to avoid a wrong-theme flash; preserve the original dark palette and supply readable light counterparts for panels, forms, status findings, buttons and the workflow graph.
- Keep this change limited to presentation. Do not change financial/oracle behavior, credentials, evidence, or reintroduce CI. The user explicitly authorized merging this theme PR after local verification.
- Local verification: 17 Node tests and five real-browser tests pass against the built Docker image, including system preference, reload persistence, tab synchronization, storage denial, keyboard toggling, 320/390px layouts, and actual oracle findings/graph/evidence in both modes. Keep input focus clearly visible in light mode. Browser-extension recorder 401 errors are platform diagnostics, not application errors.
