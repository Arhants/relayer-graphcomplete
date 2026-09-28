# External eval catalog verification

## Product decision and scope

The user explicitly requested moving only the ten cases added by PR #533 into `relayer-capability-evals`, retaining GraphComplete as their runner and run guide. PRD §13.2–13.3 and the external catalog ownership paragraph define this boundary. Existing H3, frontier, calibration, and standalone cases remain unchanged.

## Required checkpoint map

| Changed executable seam | Promise / failure boundary | Smallest deterministic observation |
| --- | --- | --- |
| Public catalog SDK | Descriptor-safe immutable data ownership, task/prompt binding, valid project threads, fixed callback references, snapshot consistency, unique registrations, typed verifier results | `packages/eval-runner/test/eval-catalog.test.ts` |
| Shared command runner type | Public SDK accepts optional command timeout metadata for external consumers; H3 execution is unchanged | Host and external package TypeScript checks/builds |
| Generic suite resolver / run expansion | Ordered exact membership and immutable contract pins; reject omissions, duplicates, drift, overrides | `packages/eval-runner/test/capability-suite-contract.test.ts`, `packages/eval-runner/test/run-plan.test.ts` |
| External Git loader | Explicit origin/commit/entrypoint; reject dirty, tampered tracked bytes (including assume-unchanged), unsupported file modes, Git replacement refs/grafts and inherited Git overrides; bind every tree/blob read to one resolved commit; execute a verified private snapshot with non-writable directories; restore permissions only for cleanup; recheck identity; reject process-local cached modules after a pin change | `desktop/eval-main/external-catalog.test.mjs` |
| EvalService external dispatch | Real materialize/grade callbacks, unavailable members rejected, drift rejected before execution; built-in runs do not depend on external checkout integrity | `test/eval-service-simulated-user.test.mjs` |
| Run persistence and grades | Catalog/suite identities survive reopen without external package; calibration gate mappings and arbitrary external grader names retain evidence that resolves to persisted thread/turn-qualified check identities; interrupted pending presentation grades settle from completed judge evidence; outcome and presentation independent | `test/eval-service-simulated-user.test.mjs` |
| External live-run authorization | Resolve suite membership before confirmation; bind a positive declared USD cap to exact cases/harnesses/judge; validate the actual selected provider/model route for Codex, Claude, and Prime; reject absent or disconnected credentials before queueing or external judge-only reruns; exempt only code-owned deterministic fixtures with deterministic judges | `test/eval-live-authorization.test.mjs`, `test/eval-service-live-authorization.test.mjs`, `desktop/eval-main/live-credentials.test.mjs`, configured `npm run test:eval-web` |
| Dashboard suite selection | Selecting exact ordered members and clearing suite after direct member selection | `test/eval-suite-selection.test.mjs`, `scripts/test-eval-web.mjs` |
| Launcher and compiled exports | Optional configured catalog, built SDK imports, native product boundary retained | `npm run test:eval-compiled-runtime`, configured `npm run test:eval-web` |
| Inherited NodeDetail disposal guard | Disposed views do not accept deferred renderer updates | NodeDetail unit coverage in `npm run check`; `npm run test:desktop:node-detail-csp` |

`npm run check` and `npm run build` remain mandatory fallback gates for the mixed integration change. Heavy proof runs after the source is frozen. No paid inference, release proof, or live-baseline claim is authorized by this migration.

## Test relocation and review boundary

Case tests, fixtures, reference solutions, mutants, runtime preflights, admission commands and historical receipts move with the ten cases. Their verifier semantics are checked in the external repository. The mixed host test's ten-case gate vectors and spreadsheet authority checks belong to the external adapter; generic synthetic registrations replace case-specific host fixtures and protect the actual EvalService dispatch/persistence seam. Existing historical-grade regression coverage stays here.

A replacement passing is necessary but does not certify subsumption by itself. An adversarial review must compare the final two-repository source snapshots, including case assets and formerly mixed host assertions. Record reviewer, exact digest/commit, scope, verdict and unresolved findings in the pull requests. A later source edit invalidates that assertion.

## Results and limitations

Results are recorded in the pull request against the tested source digest. The pre-split GraphComplete snapshot `a6b535236c543544bd2f1f7ad1c49016f506b19f` and its earlier admission receipts are historical after extraction; they do not prove this new boundary. External case admission status is maintained in the external repository. Host fixture tests prove integration behavior, not live model performance.
