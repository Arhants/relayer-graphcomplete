# Eval discovery clock verification

PRD §9.1–9.2 and ADR 0003 remain authoritative: Eval executes through the product
runtime and reviews product state. This change makes time injectable only at
Eval's semantic-child discovery boundary. Production still polls every 250 ms,
requires a five-second stable observation window, and bounds native execution
with the existing real ten-minute deadline. No user setting or environment knob
changes those rules.

## Diagnosis and measured result

The unchanged integration file passed all 18 cases in 55.87 seconds on the first
local run. Temporary boundary probes then measured 31.48 seconds in six discovery
windows, including 28.33 seconds sleeping. Runtime startup was 2.27 seconds,
product startup 4.38 seconds, teardown 0.88 seconds, and 39 trace exports 0.23
seconds. Instrumentation was removed before the comparison.

Only the Lantern quartet advances discovery time. Its deterministic fixture
awaits `child.result` before returning the final root and schedules no further
child work after returning its graph. Pending product statuses still wait on real
I/O. Product requests, graph execution, persistence,
trace export, grading, isolation, and capability revocation remain real. The
fire-and-forget Complete pair retains the default clock and pending native child
execution, including its real quiet windows.

Two alternating warm comparisons used the same Node 22.23.2 installation, build
artifacts, command, and single-file workload on macOS arm64. All four runs passed
all 18 original cases; no assertions or timeout values were removed or relaxed.

| Run | Original file | Modified file | Original Lantern | Modified Lantern |
| --- | ---: | ---: | ---: | ---: |
| 2 | 46.886 s | 26.739 s | 25.782 s | 5.935 s |
| 3 | 46.726 s | 27.573 s | 25.472 s | 6.305 s |

The paired median file time fell from 46.806 to 27.156 seconds (about 42%).
`timings.json` binds the measurements to source-file and runtime-artifact SHA-256
values, the base commit, invocation, inner outcomes, timestamps, and host load.
These are local observations, not a hosted CI speedup or a p95 claim. Work in
other Vitest files can overlap; per-file savings cannot be added to job timings.
The initial colder run and instrumented run are diagnostic, not the paired result.

## Changed seams and required checkpoints

| Seam / failure boundary | Checkpoint |
| --- | --- |
| Default real discovery timing and genuinely pending children | Existing authority-isolated Complete pair in `test/eval-app-integration.test.mjs`, unchanged default clock |
| Virtual discovery in Lantern's awaited-child fixture | Existing Lantern quartet, retaining all four cells, twelve root turns, two children, traces, pinned model, review threads, and revoked-capability assertions |
| Late observation, pending child beyond the quiet deadline, terminal-signature reset | `test/eval-child-discovery.test.mjs` drives actual `EvalService.createRun` and its polling loop with controlled HTTP snapshots |
| Recursion-off still observes unexpected descendants; stopped state is not success | Same service-loop cases: recursion on/off, accepted/stopped child, stopped root and persisted result |
| Exact quiet-window arithmetic, including initially absent children | Existing `semanticChildDiscoveryObservation` tests |
| Checkout host and compiled runtime wiring | `npm run test:eval-web` and `npm run test:eval-compiled-runtime`, after `npm run build` |

The controlled HTTP test claims late **observation**, not native creation after
root acceptance. It starts empty, introduces a child at virtual 4,750 ms, leaves
it pending through 9,750 ms, settles it at 12,000 ms, and persists it only after
17,000 ms. Global Date, native-process timers, and the execution deadline are not
faked. It covers stop through a stopped root and stopped child observation; this
change does not alter cancellation or implement a new stop operation.

## Regression sensitivity and handoff

Before the clock seam existed, both new cases failed against the real service
because injected time was ignored and no late child was observed. Both pass with
the seam. Independently removing the pending-child guard or disabling signature
resets makes both cases fail; restoring production code makes them pass again.
The controlled cases take tens of milliseconds. No tests were deleted: arithmetic,
controlled service I/O, and real native execution protect distinct boundaries.

Required handoff gates remain full `npm run check`, `npm run build`, browser Eval,
compiled-runtime proof, and PR CI. Their exact-commit results and adversarial
source/evidence review are recorded in the pull request; this measurement report
does not substitute for those results. There is no packaging, paid-inference, or
release change. This packaging scope follows explicit boundaries, not an assumption
that unchanged default behavior exempts production code: `desktop/packaging/electron-builder.mjs`
excludes `eval-main/**/*` and `eval-renderer/**/*`, and
`scripts/ci/affected-modules.v1.json` lists both as packaging-excluded prefixes.
The shipped main, shared, preload, renderer, root source, and harness-host source
have no imports of those Eval directories or the Eval runner. Eval browser and
compiled-runtime proof still apply. The evidence-document edits can select broader
PR CI, including packaging, under the current conservative scope rules.
