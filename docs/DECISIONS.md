# INVARIANT decision log

## 2026-11-14 — Initial architecture
- Build a single Next.js/TypeScript application with server-side SQLite persistence and a separate Python oracle invoked as a bounded subprocess. This keeps deployment simple without making the producer its own judge.
- The external API uses project-scoped `sofa-ext-` keys. No key is present in the workspace. Missing authentication must remain visible, never replaced with fake successful statuses.
- Use only documented REST endpoints. Native requirements/blueprint generation and coding-agent execution require an authenticated 8090 handoff; creating a work order alone is not implementation.
- Start with an executable financial amortization adapter, a behavior-preserving refactor, and a separately labeled controlled regression. All evidence comes from actual Python execution. Arbitrary repositories require the documented adapter contract and trusted local execution opt-in.
- Never merge or approve modernization PRs. Finite verification is evidence, not formal proof.
