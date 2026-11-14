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
