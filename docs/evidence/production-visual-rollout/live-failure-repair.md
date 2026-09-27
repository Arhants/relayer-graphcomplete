# Live Prime failures and repair — 2026-09-27

The PR500 live Max run was cancelled by user request after extended tool
execution. Flash failed with an upstream 429 and then an invalid
unknown/unknown model retry. Neither live attempt is acceptance evidence.

## Changed seams and required checkpoints

- Prime IPython request envelope: discard only native `type` and
  `cellSourceCode` metadata before strict visual-program validation. Keep
  active-run, token, node, and authoring-field checks unchanged.
- Python checkpoint/submit error: construct ValidationError with status 422,
  retain exact structured details, and display compiler issues and locations.
  Failed compilation must remain repairable.
- Python integrity pins and Prime native retry dependency: retain exact
  reviewed bytes in the manifest, verifier, recipe, and lockfile.
- Native retry: preserve selected model and scoped credentials without
  changing durable model selection or weakening the scope check.

PRD 6.2 already requires location-preserving checkpoint errors and repairable
compiler failure. Native model authority follows ADR 0001/0006. No product
contract change or test deletion is included.

## Evidence

Python suite: 34 passed. TS bridge: 6 passed. Both Prime configurations passed
adapter/graph/asset/persistence tests with native metadata included. The
optional real IPython KernelManager path also passed both configurations,
including rejected markup, displayed source guidance, repair, accepted assets
and controls, import/export and reopen. No inference is used in these checks.

Prime native scoped-model and retry-event suites: 39 passed after reproducing
failure with an unset/different ambient model. Native source npm check passed.
Recoverable source provenance is documented in vendor/prime-agent/source.

Full Relayer check reached 2,375 passing Vitest tests, with the known local
Cargo Ladybug cache-integrity failure. Its 14 artifact cases passed using the
previously checksum-verified isolated Cargo home. The aggregate failure remains
recorded; isolated success does not convert it into an aggregate pass.
Subsequent resealed-package verification is recorded at handoff.

Reviewer /root/review_python_fix reviewed six Python/adapter/test/pin files
at HEAD c947290e with workspace digest
`db7f3c2402eaeb6f4f4e2fb7e25c9da428ddb83ad25b2613b50c3af76a9f111a`:
no actionable findings. Later dependency resealing is outside that review.
Reviewer /root/review_prime_retry diagnosed the native retry loss and confirmed
passing the selected model preserves the existing authority boundary.

Live-success proof remains outstanding. PR500 must remain draft. Separate
scoped-compaction lifecycle work is not covered by this fix or these results.

## Final resealed dependency review

Reviewer `/root/review_prime_retry` reviewed source
`3635b59066ebf4facf1a6d0285b005056644226b` and eight Relayer provenance/pin
files at workspace digest
`d48f8d57574defed680bcc5cdabf5ee7178e6b7b9ec5cef55ef71e4e1ac63a2e`:
no actionable findings. Scope: native retry authority, source bundle,
archive/lock integrity, recipe, runtime verifier, manifest and dependency
closure agreement. Excludes compaction repair, Python changes and live success.

Final source suites passed 39/39. Fresh managed-runtime preparation passed with
recipe digest `012de645921c1831a71aa5646d61653845026a17e848497cc24d38ed3e0ce3be`.
The resealed real-kernel visual scenarios passed 2/2. `npm run build` passed.

Final full check: Rust, Clippy, crash reconciliation, package builds and type
checks passed; Vitest reported 2,374 passed, 1 failed and 17 skipped. In addition
to the local Ladybug cache failure, recursive-complete-e2e failed in runtime
cleanup (`AggregateError: GraphComplete runtime resources did not close cleanly`),
not its stopped-state assertions. An unchanged focused rerun passed all 3 cases;
the aggregate failure is retained. Final package/managed-runtime/cache tests
passed 34/34 with verified isolated Cargo source, and Python passed 34/34.
Secret-boundary, receipt and PRD checks were run separately after the aggregate
stopped. The repaired isolated dev profile passed runtime readiness and the app
was reopened with existing failed-run history intact. No new inference ran.
