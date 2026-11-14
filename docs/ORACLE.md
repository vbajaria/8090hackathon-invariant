# Independent Python oracle

## Parent integration

Run from the repository root with `.venv/bin/python` (override the executable for deployment). Dependencies are in `requirements.txt`:

```sh
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python -m pytest oracle/tests -q
.venv/bin/python -m oracle.runner \
  --baseline demo/baseline/calculator.py \
  --candidate demo/preserved/calculator.py \
  --baseline-ref original --candidate-ref preserving-modernization \
  --output .runtime/evidence.json
```

Replace the candidate with `demo/regression/calculator.py` for the **explicitly controlled regression** demo. It deliberately ignores monthly extra principal; it is not an unverified external modernization or simulated test result. Demo modules use only the standard library and import neither oracle nor one another.

Invoke Python with an argument array, never interpolated shell commands. Resolve both adapter paths to trusted local checkouts; keep the subprocess cwd at the application repository root so `oracle` is importable. The parent owns subprocess timeout/termination and trusted-local opt-in; a 45-second bound is ample for these demos. Executing an adapter is arbitrary Python execution, **not a sandbox**. Do not offer this endpoint for untrusted uploads. Source/path validation does not make execution safe.

Successful completion always returns exit code **0**, including drift/review. **Stdout is exactly one Evidence JSON object**, with optional `--output` containing identical JSON. Adapter prints and pytest output cannot corrupt stdout; pytest's real transcript is retained at `evidence.pytest.output`. Configuration/import/syntax/I/O failures return **2**, with an `{error,errorType}` object on stderr and no Evidence on stdout. The parent must visibly fail the run rather than inventing successful evidence. Missing files are not verification results.

There is **no `--capture` mode**. The parent may hash and snapshot the source itself before modernization; report baseline/candidate metadata includes caller-supplied refs, absolute paths, and SHA-256 hashes of captured source bytes compiled for execution (not cached bytecode). Source analysis uses those same bytes. Detected source changes during the run are exposed in `sourceChanged` and require review. Ref labels are not validated Git commits; pass actual immutable refs when available. Adapter hashes do not cover imported dependencies. Snapshot trusted checkout contents when dependency provenance matters.

## Calculator contract

A standalone Python module exports:

```python
calculate(principal, annual_rate, months, prepayment=0) -> dict
# {"payment": float, "total_interest": float, "total_paid": float, "months": int}
```

- Numeric arguments are finite `int` or `float`, excluding booleans; numeric strings and `Decimal` arguments are outside this contract.
- Principal: **0.01 .. 1e15**, inclusive. Annual rate: **0 .. 100**, inclusive, in **percentage points** (5 means 5%, not 0.05). Term: integer **1 .. 1200** months. Monthly extra payment: finite and nonnegative, including amounts greater than the principal. Extra payments are capped at rounded initial principal before conversion or quantization to avoid overflow or integer string-conversion limits for enormous finite inputs. Annual rates below 1e-28 percentage points are treated as zero (far below cent resolution throughout the supported domain).
- Invalid inputs raise `ValueError`. Error wording may change; exception category must not.
- `payment` is the scheduled installment **excluding extra principal**, even when the loan pays off immediately. Returned `months` is actual payoff duration, not requested term.
- Round initial principal and extra principal to cents with **ROUND_HALF_UP**. Compute the annuity at high precision; round scheduled payment and each month's interest to cents. Each month pays the lesser of installment plus extra and outstanding principal plus interest. At the contractual final month, settle the residual balance (cent rounding may require a larger final installment). Zero-rate loans divide principal by term without annuity division by zero.
- `total_paid` includes principal plus charged interest, with no penalties or fees. Output monetary fields are nonnegative finite numbers, cent-rounded. Internal demo/reference calculations are Decimal; outputs are float transport for the TypeScript UI. At very large magnitudes float transport cannot distinguish every cent; ledger tolerances account for ULP resolution, while reference agreement compares actual output values.

Literal goldens: $1,200 / 0% / 12 months => payment $100, interest $0, paid $1,200, 12 months. $1,000 / 12% / 12 months => payment $88.85, interest $66.19, paid $1,066.19, 12 months. With $1,000 extra monthly => payment still $88.85, interest $10, paid $1,010, one month.

## Evidence and actual execution

`oracle.runner` calls actual pytest tests in `oracle/test_execution.py`. Fixed boundary/golden/invalid/precision/contract cases execute **both versions**. Seeded Hypothesis property tests compare both to the separate 60-digit Decimal reference, check principal/interest conservation, and execute prepayment metamorphic pairs. The reference uses a positive-power annuity expression and an independent cash-flow ledger rather than importing the producer. Preserving demo: **156 case assessments / 156 passed / 0 failed**, including literal golden checks; **186 baseline calls + 186 candidate calls** (372 adapter executions) plus 186 reference calls. `summary` counts case assessments, not individual adapter invocations, unique inputs, or pytest functions. `executionCounts` separately counts baseline/candidate/reference calls, including increased-prepayment pairs. Hypothesis generation, replay, and `find` search assessments are retained; search records have `phase: counterexample-search`. Counts may vary with Hypothesis versions and failing examples.

Every case retains input, original outcome, candidate outcome, independent reference, separate version pass flags, and overall pass flag. Metamorphic cases and representative findings also retain increased inputs, both adapter outcomes, and the increased-input reference. Literal golden checks use the already-recorded outcomes instead of making unrecorded extra calls. `referencePassed` guards expected result/error categories and literal reference checks. Invalid inputs use JSON-safe strings `NaN`/`Infinity` in evidence, but actual Python nonfinite values during execution. Finite output JSON is enforced.

The report matches `lib/types.ts` Evidence: verdict; invariants; findings; summary `{total,passed,failed,durationMs}`; baseline/candidate `{ref,sha256,path}`; UTC `generatedAt`; methodology; limitations; cases. Additional `sourceAnalysis` and `pytest` fields use the schema's extension allowance. Every finding has all required fields plus `minimal`, `baselineInvalid`, `reference`, and associated `caseIds`. Repeated counterexamples are grouped by invariant and baseline-invalid vs candidate-only issue, retaining executions in cases.

`hypothesis.find` searches and shrinks real candidate/reference mismatches per failing invariant. A representative finding is marked `minimal: true` only when that search returns a witness. This means minimal under the configured strategy and search budget, **not** an absolute global minimum. Current prepayment witness is principal $0.01, 0%, three months, extra $0.01: baseline pays off in one month, candidate in three. Metamorphic witnesses include both the original and increased extra-payment executions in their case record.

## Invariant extraction and classifications

AST/source extraction records the candidate callable signature, branch predicates, raise statements, and rounding/prepayment locations. It is paired with explicit curated financial policies, not unsound automatic semantic inference. AST branches are evidence about source, not policies that must be mechanically preserved. A preserving refactor may change syntax and guard layout. The invariant's source points to the candidate implementing callable or relevant monetary/prepayment lines; each finding also points to the baseline callable.

Stable policy IDs: `contract`, `principal`, `rate`, `term`, `prepayment`, `zero-rate`, `rounding`, `reference`, `ledger`, `metamorphic`. Default classification is `MUST_PRESERVE` for these known financial policies. Override with a JSON map:

```sh
--classifications '{"prepayment":"INTENTIONAL_CHANGE","reference":"UNKNOWN"}'
```

Only known IDs and `MUST_PRESERVE`, `INTENTIONAL_CHANGE`, `UNKNOWN` are accepted. Classification never changes measured outputs or hides failed cases.

- A candidate-only violation of a MUST_PRESERVE policy => **BEHAVIORAL DRIFT: DETECTED**.
- Any baseline/reference violation => **REVIEW REQUIRED**, even when both versions share the defect, or when candidate corrects it. Never blindly preserve defects.
- Any UNKNOWN policy, or an intentional-change finding => **REVIEW REQUIRED**. Intentional is not approval. Review takes precedence when classifications and defects coexist with must-preserve drift.
- All policies known, no baseline defect and no candidate violation => **BEHAVIORAL INTEGRITY: VERIFIED** within the finite tested scope.
- Missing required pytest cases, deselection, skips, fail-fast truncation, and unexpected setup/call/teardown failures also require review, even alongside genuine financial drift. `pytest.missingTests`, `unexpectedReports`, `reports`, and `infrastructureError` expose these conditions. Policies with no assessments have `status: not-tested`, never passed. Operational failures do not become verified reports.

Finite tests are evidence, not mathematical proof. Policies are deliberately scoped to this amortization contract: other repositories need a matching adapter and explicit policy extension, not guessed business semantics. No arbitrary shell interpolation, network orchestration, or Factory API calls occur in the oracle.

## Bounded independent integrity review

Focused regressions in `oracle/tests/test_integrity_review.py` execute real adapter modules and subprocess runners. They cover incomplete/hidden pytest failures, stale same-size/same-timestamp bytecode, source changes during import, unlimited integer prepayment, literal small-cent/high-rate/tiny-rate financial cases, mixed classifications, and call-count reconciliation. The controlled regression continues to ignore extra principal; only its input-domain defect was corrected. Baseline domain defects are fixed rather than knowingly retained for preservation.

A separate 1,980-input edge probe compared both genuine preserving adapters with the reference across principal/half-cent extremes, rates from zero and subthreshold values through 100%, terms through 1,200, and oversized extras; no mismatches were observed. This is finite evidence, not proof. The reference is separately coded, but shares the documented financial model and is not an external regulatory/accounting authority. Source locations are heuristic implementation anchors, not semantic proofs. Snapshot hashes cover adapter bytes only: imported dependencies, shared interpreter state, and external data remain outside provenance coverage. Post-run source checking detects observed changes, not every possible transient filesystem mutation.

## Cross-revision import isolation

Each adapter now runs in its own persistent Python interpreter using a bounded JSON-lines protocol. The worker prepends only its own checkout directory and ignores inherited `PYTHONPATH` (`python -I`). This supports modular `finance` imports without accidentally loading the baseline's cached package in the candidate. Captured adapter bytes are still compiled directly, and workers do not inherit Factory/GitHub credentials. Worker transport failures are infrastructure errors, not business results. The parent still enforces the whole process-group timeout. This is import isolation, **not a security sandbox**.

Implementing callable source locations are returned by workers, so an import-only adapter points to the real calculation entry point rather than a fictitious wrapper definition. Checkout-owned dependency hashes are recorded from freshly compiled bytes (including lazy imports observed during calls), checked for post-execution changes, and included in the report. Changed dependencies force review. Installed packages, non-Python files and environment remain outside this finite provenance scope. The Git tree/commit gives additional repository provenance; the application does not install target repository dependencies automatically.
