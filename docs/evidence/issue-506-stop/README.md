# User Stop — issue #506

Scope: the shipped product runtime and its existing native provider cancellation.
The primary checkout and the PR #500 worktree are not changed. No inference,
push, merge, deployment, or release operation is part of this work.

## Required verification

The versioned product checkpoints are PRD §5.4, STOP-001 through STOP-006.

| Changed executable seam | Checkpoint and observing boundary |
| --- | --- |
| Authenticated product Stop route, thread/interaction binding, capability projection | STOP-001: real API rejects missing cookie, read-only cookie, foreign thread, and use of the agent broker route |
| Migration 32, request persistence, error retry, terminal transaction | STOP-001/005: SQLite public store calls, duplicate requests, reopen, and terminal-output protection |
| Execution observer, preparation/admission, exact completion cancel targeting | STOP-002/004: app server → HTTP host → actual Codex/Prime adapters, with injected native provider boundaries |
| Host terminal acknowledgment and failure propagation | STOP-003: deferred native settlement, late accepted Return, abort failure, and failed HTTP cancellation dispatch |
| Approval projection during Stop | STOP-004: cancelled approval remains product-running until native settlement |
| Accepted-output reconciliation and restart handling | STOP-003/005: accepted result wins; interrupted Stop cannot resume provider work |
| Composer action, duplicate-click suppression, state/message presentation | STOP-006: production renderer in Electron calls the real API and captures running/stopping/stopped for both adapters |
| Existing input-draft restoration triggered by stopped status | Existing storage input-draft portfolio plus the stopped terminal transaction; no replacement or deletion of these tests |
| Telemetry sealed module inventory | Existing exact inventory test includes the new Rust storage module |
| CI ownership | New process test declares both Rust runtime prerequisites; fixture and manual desktop runner have explicit owners |

Warm checks: `cargo test -p relayer-app-server --lib storage::sqlite::` and
focused harness/provider Vitest files. The retained storage suite exercises
migration, input restoration and reopen in process; provider tests protect
native interrupt/quiescence boundaries distinct from the assembled product
scenarios. No test has been removed or subsumed.

Heavy checks: `npx vitest run test/stop-run-integration.test.mjs`,
`npm run test:desktop:stop`, `npm run check`, and `npm run build`.

## Implemented behavior

A user Stop is a durable request keyed by product interaction. Its route uses
the desktop write cookie and resolves the graph completion from stored product
ownership. It does not accept a caller-supplied completion ID or reuse the
agent-only broker grant. The existing execution observer dispatches it; there
is no new worker, scheduler, or recursive traversal.

Graph Stop closes write authority while preserving the current. Native abort
is then targeted to that exact completion. A host abort acknowledgment is not
settlement: the product remains pending until the adapter settles. The host
separately reports successful cancellation or a failure before native execution
began. Distinct native abort, quiescence, persistence and cleanup failures are
not converted to successful cancellation. Canonical accepted output is checked
before writing a stopped result, including when Return wins the race.

Stop during provider admission is honored before native execution. Confirmed
stopped interactions retain history, current, drafts and traces, and allow a new
follow-up. Interrupted Stop is recovered as failed without automatically
replaying the user's cancelled work. Input-assisted sends retain their existing
fresh-root Send and draft-restoration rules; no generic Retry feature is added.

The developer-only all-off temporal compatibility mode deliberately advertises
`stopRuns: false` and rejects Stop before recording a request. The normal shipped
runtime enables the required graph-current boundary. This evidence does not
claim support for the diagnostic all-off mode.

## Results

Verification date: 2026-09-27. Final reviewed source digest appears below.

User-directed icon refinement: running shows a square, stopping surrounds it with
a rotating circle, and stopped restores the Send arrow. Accessible labels and
busy state remain explicit; reduced-motion preferences disable rotation. Changed
seams are composer projection and CSS; STOP-006 maps both to the existing
Electron runner, now asserting these three icon states. The declared desktop
entry point (including build), PRD readability and diff checks passed after this
refinement. A second user-directed refinement gives Stop controls neutral theme
colors and the confirmed stopped notice and status dot gray styling. Failures
retain their error styling. The same desktop entry point passed with computed
color assertions for both providers; build and PRD readability passed.
The subsequent alignment refinement centers the action group vertically beside
the textarea. STOP-006 now also measures button/input center offset within one
pixel in all six screenshots; the declared desktop command (including build)
and PRD readability passed. Screenshots were refreshed. The historical failure
receipt below precedes the final verification recorded at the end.

| Entry point | Observed result |
| --- | --- |
| `npm run build` | Passed on final source |
| `npx vitest run test/stop-run-integration.test.mjs` | 7 passed, including both ordered acceptance outcomes, native failure, retry, authority, admission, retention, isolation, follow-up and restart |
| `npm run test:desktop:stop` | Passed for Codex and Prime; each recorded one abort after two UI clicks, stopped lifecycle, cancelled attempt, and enabled follow-up after settlement |
| Initial `npm run check` | Failed; Rust formatting, Clippy, workspace tests, crash reconciliation, builds and type checks passed. Vitest reported 179 files passed, 4 failed, 1 skipped; 2367 tests passed, 5 failed, 17 skipped |
| Fixed telemetry inventory rerun | Passed after adding the new `stops.rs` module to the sealed inventory |
| Ladybug artifact test with isolated clean Cargo home | All 14 passed; default shared Cargo source tree fails its integrity check because of generated cache files |
| `npm run test:codex-secret-boundary` | 2 passed, run separately after full check stopped |
| Python client suite | 29 passed, run separately |
| `npm run lint:ladybug-receipt` | Passed, run separately |
| `npm run prd:check-readability` | Passed, run separately |

The earlier full check failed in the exact-port egress test under
Node 26 (`ERR_ACCESS_DENIED` for loopback) and three Prime packaging tests
(package-byte mismatch for `@earendil-works/pi-coding-agent`). The egress failure
also reproduced in isolation. Both failures were traced to the local environment:
`.node-version` pins 22.23.2, while the shell used Node 26; installed Prime source
bytes differed from the vendored archive. Running with the pinned Node and
restoring all four Prime packages from their hash-verified vendored archives
made both complete suites pass: 144 passed, one skipped. No verification rules,
package manifests or lockfile changed. Shared Cargo source pollution was avoided
with a clean isolated Cargo home. Final full verification is recorded below.

Initial new-code Clippy, migration-count and telemetry inventory failures were
repaired. Their failure logs remain in `.relayer/`; the full-check log is
`.relayer/stop-full-check.log`. Focused final runtime, desktop, build and
supplemental check logs use `.relayer/stop-*.log`. Earlier storage and provider
checks passed (88 storage tests before the approval checkpoint; 225 focused
host/provider/workspace tests); the full Rust run includes the added approval
checkpoint. The failed run is retained as historical evidence; it is not the final verdict.

The screenshot runner uses the production HTTP renderer in an isolated Electron
window. OS/account integrations and real provider inference are outside this
fixture. Native provider entry points are deterministic injections, not claims
about a live model or packaged/signed app. The Codex fixture injects
`runAppServerTurn`; actual JSON-RPC `turn/interrupt` targeting is covered by the
existing Codex app-server adapter tests, not the assembled fixture.

The ordered late-submission case reads active current through the original
capability before Stop, then observes `422 authority_generation_expired` on
current read and `503 visual_assets_unavailable` on late submit after Stop.
The submit route encounters the revoked asset barrier before graph validation.
No final output is created. This is deterministic ordering coverage, not a
concurrency stress test.

Visual evidence: [Codex running](codex-01-running.png),
[stopping](codex-02-stopping.png), [stopped](codex-03-stopped.png);
[Prime running](prime-01-running.png), [stopping](prime-02-stopping.png),
[stopped](prime-03-stopped.png). [Runner assertions](result.json).

## Build acceleration

A copied local Cargo cache was used only for acceleration, never as test proof.
The repository Ladybug verifier initially rejected the shared Cargo source tree
because generated `.cache/lbug-prebuilt*` files changed its digest. The published
crate files and archive checksum matched. A separate Cargo home unpacked the
checksum-pinned archive without changing the shared registry, and the repository
bundle creator/verifier then passed. The initial native build fell back to source.

## Adversarial review

The first non-certifying review found and prompted fixes for temporal stopped
state hiding product failure, and ignored terminal persistence failures before
execution. The final static review by `/root/stop_contract_review` passed with
no unresolved findings for authority, native settlement, acceptance precedence,
early cancellation, approvals, persistence/restart, renderer lifecycle and
checkpoint mapping. The follow-up icon, neutral-color and alignment reviews also passed with no findings. Reviewed digest:
`52d017a7d2a35c23c59019fb46c56e14a09e66d5878a63d2401339e07ac6e6ab`.
This is SHA-256 of sorted `path + NUL + bytes + NUL` for 33 changed
executable/test/PRD/CI files, excluding `docs/evidence/**` and media assets.
The reviewer did not independently run tests. The PR assertion binds this
reviewed source digest to the execution results below.

## Final handoff preparation

The user explicitly approved the final visual design in this chat: square Stop,
loading ring, neutral gray styling, and vertical alignment. The branch then
incorporated `origin/main` at `73c3d9f2`, including #493 and #505. Stop projection
now uses #505's shared status helper with native-settlement precedence. The
existing environment-rail test observes both graph-leading and Stop-requested
status/key transitions (17 passed). The final static review covered this
integration and found no unresolved findings.

Final execution environment: pinned Node 22.23.2, hash-verified vendored Prime
packages, clean isolated Cargo home, and the previously verified native Ladybug
bundle. One full run then passed 2390 Vitest tests but hit a graph-search parity
wall-time deadline under heavy host load. The unchanged parity test passed in
isolation (1.48 seconds for the scenario). The final run uses
`VITEST_MAX_WORKERS=2` to limit contention; no assertion, query budget or test
timeout changed. The failed run remains in
`.relayer/stop-check-parity-timeout.log`.

Final results on the reviewed digest above:

- `npm run check`: passed. All Rust workspace and crash-recovery tests passed;
  Vitest passed 183 files and 2391 tests (one file and three tests skipped by
  their existing platform/context guards). The separate Codex secret-boundary
  stage passed two tests; Python passed 29 tests. Receipt and PRD checks passed.
- `npm run test:desktop:stop`: passed, including its required `npm run build`.
  Both providers recorded one native abort, a stopped interaction and a cancelled
  attempt. All six icon, neutral-color and alignment captures passed. The final
  screenshots and `result.json` were refreshed from this run.
- `git diff HEAD --check`: passed.

Logs: `.relayer/stop-final-check.log` and `.relayer/stop-final-desktop.log`.
No paid inference, production changes, merge or deployment occurred.
