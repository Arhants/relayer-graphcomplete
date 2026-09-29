# Integration with main for PR #581

The pre-merge commit `7585ab45650c7048bd32ea01be96123fe96d7eaa` passed full
check, build, and all five browser chapters as recorded in final-verification.md.
GitHub then reported conflicts with main `2e23ac8b`. This report covers the
combined source; prior results do not certify it.

## Preserved behavior and integration checkpoints

- Preserve human grading and observation alongside main's workspace selection,
  reading split, responsive sidebar, and shared graph changes. Renderer suites
  protect both paths; real browser replay remains required.
- Preserve the external catalog's provenance, matrix budget, and credential
  authorization. External catalog cases are disabled in the Human selector and
  rejected before preparation, because human sessions do not yet collect the
  catalog's required budget/credential approval. This is an explicit gap against
  the any-catalog-case product promise, not proof that it is complete. Built-in
  human cases remain available. General external human execution requires a
  product decision about approval/budget accounting before implementation.
- Keep Rust as the only harness-readiness record. Eval coordinates production
  native configurations and validates installed local runtimes without installing
  them at Settings startup. Provider tests and actual Settings browser flow cover
  the integration. Keep paid execution authorization separate from connection.
- Preserve named Codex connection ownership when validating external run access.

Changed integration seams map to eval-provider-setup, eval-service-simulated-user,
external-catalog integration, eval-web-host, renderer navigation/reading/selection,
and the declared browser proof. No test removal or lowered authority requirement.

- Preserve main's atomic provider/family selection and legacy unpaired-default
  repair. The earlier provider-only catalog guard is superseded by that policy;
  the regression now checks valid paired selection through refresh/migration/reopen.
- Preserve profile-backed workspace divider preferences in live human tabs through
  the same narrow presentation preference authority as archived review.

## Results

The first combined-source check stopped compiling the added Rust regression:
main changed connection stamps and model-default arguments and replaced loose
SQLite test paths with owned temporary directories. It made no pass claim.
The regression was adapted to the current API and atomic pairing policy; its
focused scenario and all 22 neighboring catalog tests passed.

Focused compatibility verification: 98 backend tests passed after rebuilding SDK
packages; 105 renderer tests passed. The configuration-owned external follow-up
regression passed within its 15-test authorization suite. Live layout persistence passed 28 targeted tests.

Final combined-source commands:

- `npm run check` passed with `VITEST_MAX_WORKERS=3`, `RUST_TEST_THREADS=1`,
  warm shared Cargo target, and SSD temporary directory. This includes Rust
  workspace/crash checks, formatting, Clippy, package/types/workspace checks,
  3,042 JavaScript tests (three skipped), two secret-boundary tests, 59 Python
  tests, Ladybug receipts, and PRD readability.
- `npm run build` passed afterward.
- `npm run test:eval-web` passed all five inner chapters: interrupted startup,
  human task, host/restart/authority, production Settings, and isolated judge.
  The human chapter includes live workspace layout persistence across reopening.
- The final screenshot was captured by that passing run and visually inspected.
  It represents deterministic fixture feedback, not the user's satisfaction.
- `git diff --check` passed. No paid inference or live OAuth test was run.

Browser proof uses private copies of the newly built native binaries, leaving
user-host binaries untouched. SHA-256: app
`20956f9009bf5328c9fe0d489876fc6ba24cd7d11d02e477a73dea0a56fd3ff4`;
graph `d2f3e6223e93f5df590dc68b5a004b5350f54cadbd24f8988ea8f8e28b94be64`.
Source is frozen at the digest below.


## Frozen integration review

The 38 changed source/config/test/PRD paths relative to main `2e23ac8b`, excluding
this evidence directory, have SHA-256
`11567b08d4f141f876da48e0dc3ff12b31de8d401d1535b7b29b40c72823dbce`.
Algorithm: sorted relative path + NUL + bytes + NUL.

Reviewer `/root/slice1_authority` reviewed combined backend readiness ownership,
validate-only runtime startup, exact selected-provider credential leases, external
case callback preservation, and configuration-owned follow-ups. The live layout
persistence gap it found was fixed and independently reviewed below. External
human eligibility remains the explicit product gap above.

Reviewer `/root/provider_backend` reviewed the live-layout fix at seven-file
digest `8a6095c645c8660be8f2aebceb642fb5f949ca34aa129bead8737e10f7294317`.
Scope: web-host, web-bridge, product-workspace/workspace-layout, test-eval-web,
eval-human-task, eval-web-host, and workspace-reading-layout. Verdict clean:
only authenticated bounded presentation preferences are writable; live mode and
existing execution/settings authority stay unchanged. This reviewer did not
independently rerun the owner's 28 tests; browser proof remains separate.

Reviewer `/root/eval_facts` adapted and checked the catalog regression against
main's product contract. Production catalog behavior matches main exactly; the
new test preserves valid chosen-provider pairing through refresh and migration.
File digest `8e4aa21b42c50f5d90d272038f80320569836e7db3cd0fbeb57d552186e9d103`.
Its focused scenario and 22-test module passed.

Source changes invalidate scoped assertions. No release/live-inference claim.

Backend review confirmation at the 38-path digest: `/root/provider_backend` reports
no unresolved findings in its provider setup, credential store, index/service/host,
product settings, bridge, workspace layout, associated backend/layout/browser
checks, PRD, and ADR subset. Independent runs passed 98 focused tests after SDK
rebuild and 15 authorization tests after the follow-up regression. This is not
whole-manifest certification; Rust and renderer ownership remain as stated above.
