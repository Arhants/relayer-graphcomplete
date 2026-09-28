# Human task sessions — slice 1

Final stabilization results: [final-verification.md](final-verification.md). Earlier
entries below are historical checkpoints and do not supersede the final report.

Product authority: PRD §13.2.2 and ADR 0003's human task execution decision.
Issue: https://github.com/vishaltandale00/relayer-graphcomplete/issues/544

## Required verification plan

| Changed executable seam / promise | Checkpoint |
| --- | --- |
| Catalog fixture and project preparation; per-step permissions; shared matrix execution after extraction | `test/eval-human-task.test.mjs` real EvalService preparation scenario; existing `test/eval-app-integration.test.mjs` |
| Separate live HTTP scope, private draft reads, query revisions, model pin, ordinary input/Send/invoke, immutable review | `test/eval-human-task.test.mjs`, `test/eval-web-host.test.mjs`; `npm run test:eval-web` |
| Serialized budget, invoke replay, ambiguous dispatch, active-work mutation/finish rejection, host interruption | `test/eval-human-task.test.mjs` |
| Ordered rendering observations, qualified first/later visibility timing, capture failures | renderer observer and real `npm run test:eval-web` follow-up scenario; visibility is not usefulness or visual-quality proof |
| Human Grader launch, live composer, finish, graph review, moment annotation, exports, restart | `npm run test:eval-web` |
| Multi-step snapshot, partial export failure, annotation persistence, immutable bundles | `test/eval-human-task.test.mjs` |
| Eval-only model-free fixture catalog entry | `test/eval-configuration-paths.test.mjs`; browser fixture workflow |
| Sealed renderer telemetry module inventory | `test/desktop-telemetry-module-inventory.test.mjs` |
| Portfolio mapping | `test/ci-affected-plan.test.mjs`; required `npm run check` fallback |
| Model-family editor survives discovery completing after draft creation, editing, or cancellation | `test/model-family-settings-refresh.test.mjs` drives actual production DOM/API seam; original Settings browser workflow |
| Eval profile provider composition, isolated credentials, catalog/selection, lifecycle and active-work protection | `test/eval-provider-setup.test.mjs`, `test/eval-credential-store.test.mjs` |
| Explicit provider preference survives catalog refresh and managed-family policy migration/reopen | Rust `managed_catalog_refresh_preserves_a_separately_chosen_default_provider` plus existing legacy-family migration test |
| Eval default-family choice persists and selects the same family/provider/model | `npm run test:eval-web` through product defaults API and real provider setup |
| Generic provider/model identity pinned at initial and subsequent Eval turns | `test/eval-service-simulated-user.test.mjs` |
| Copied authenticated links work in a fresh browser; older tabs restore fragments; bare links stay unauthorized | `test/eval-web-host.test.mjs` executes the real bridge against the real gateway; `npm run test:eval-web` opens Settings in a separate browser context |
| Independent settings authority and production provider/model controls | `test/eval-web-host.test.mjs`; `npm run test:eval-web` with native-auth fixture |

The HTTP checks protect authorization and admission under
adversarial calls; the browser proof protects actual renderer/composer wiring.
They observe distinct failure boundaries. Default checks spend no inference.
Run the required `npm run check`, `npm run build`, and declared browser entry
point before certifying a source snapshot. No release-candidate proof is due.

## Build preparation

Read `docs/agents/ci.md` before native preparation. No compatible sealed Ladybug
or runtime bundle was located in the inspected local artifact locations. Reused
the existing Cargo compilation directory on the SSD through Cargo's normal
fingerprint checks, and freshly built both Rust runtime binaries from this
checkout. No unverified binary bundle was installed. Dependency installation used
the locked npm dependencies. The developer doctor passed; native temporary files
were moved to the SSD because the default system temporary volume had less than
3 GiB free. These are acceleration/setup observations, not test evidence.

## Evidence limits

A latency whose observer attached after submission includes pre-open delay and
is not suitable for responsiveness comparisons. Rendered text and navigation
records do not replace screenshot-grounded visual judging. Human endpoint and
satisfaction reports do not establish objective correctness. Interrupted sessions
preserve their recorded evidence and explicitly mark missing final conversations.
Simulated users, calibrated taste-fit judging, feedback subagents, and automatic
improvement are not implemented in this slice. The interactive trip variant
provides a private human brief and manual rubric only.
Provider Settings browser proof uses native-auth and catalog fixtures. It does not prove a live
OAuth callback or paid model execution. The human completes real browser sign-in.

Actual command results and final adversarial source review are recorded in the
handoff. An intermediate browser pass or review does not certify subsequent edits.

## Full provider setup executable seams

The production provider composition and native readiness replace the narrow Codex
coordinator. Settings uses a dedicated capability and the production renderer;
the gateway allowlists provider/model operations, rejects active-work mutations,
and withholds product control cookies. Generic Eval model resolution validates
product defaults before execution and followups. Direct Codex judges resolve the
connected subscription's credential home. macOS credentials use authenticated
profile-bound encryption with the master key in Keychain.

Required verification: provider setup and credential-store tests; web gateway and
Eval service/human-task tests; `npm run test:eval-web` for real renderer/product
integration; `npm run check` and `npm run build` before a commit. Live authentication
and paid inference are separate manual checks. Test results below must identify
the source snapshot; this mapping is a plan, not a pass claim.

Settings initialization must also work without a query flag. The executable
seams are the bridge initializer, production module import order, and settings
mutation event routing. The real bridge/gateway test covers query-independent
initialization and unchanged authorization. The existing browser runner opens
the authenticated root URL in fresh storage and opens Add provider, then checks
model-family settings. See `settings-root-verification.md` for results.

### Replacement of the preliminary Codex-only setup

The uncommitted narrow coordinator, renderer, and six coordinator tests were
retired after production replacement checks passed. Provider lifecycle, secret
isolation, logout, cancellation ownership, discovery recovery, and failed cleanup
retry now map to `eval-provider-setup`, `provider-adapters`, `provider-composition`,
and `provider-settings-connection` tests. Production semantics intentionally win:
cancel after a committed connection does not log it out; a pending native login
failure can be cancelled manually or expires after ten minutes instead of relying
on a separate Eval native-notification handler. The timeout delegates cleanup to
the production service. The narrow managed-runtime helper additions were also
removed; isolation is checked at the new, real production composition seam.

### Settings return navigation

The user approved fixing the standalone Settings dead end. Changed executable
seams: dashboard Settings-link construction, bridge fragment/storage restoration
and destination validation, and both desktop/compact Settings back controls.
Checkpoint: same-tab authenticated return without an opener, including a copied
link in fresh storage. This maps to the actual bridge/gateway host test and the
production Settings scenario in `npm run test:eval-web`. Existing bare-URL and
settings gateway authority checkpoints remain required. No test was removed.

Actual results: nine host tests passed; all five browser-runner scenarios passed,
including copied-link return and an authenticated dashboard listRuns request.
PRD readability and whitespace checks passed. Live Settings showed Connected
Codex and Back to Eval returned to the dashboard. No inference or login was run.
No compiled source changed; no build was required for this JavaScript delta.
Earlier full-check failures remain unresolved; this is not a full-check claim.

Return links deliberately bundle Settings and Dashboard browser capabilities
supplied by the originating dashboard, in fragments only. Settings endpoints
never mint dashboard authority. Older links lacking return context show recovery
instructions. See ADR 0003 for the scope consequence.

Adversarial reviewer `/root/provider_backend` confirmed no unresolved findings
for four-file digest
`a781f4e44ca23fcfe497c1e98baf5f260419778c5b0a9bebc7428681638e8cfc`:
web-bridge.js, product-settings.js, eval-web-host.test.mjs, test-eval-web.mjs.
Scope: navigation, capability transport/validation, and test mapping. Digest uses
sorted repository-relative paths + NUL + bytes + NUL. Source changes invalidate
this assertion; without a PR this review is non-certifying.


### Workspace grading

The user explicitly requested grading inside Open task workspace. Changed seams:
production renderer Eval-only panel initialization, task bridge grade methods,
and gateway finish/annotation routes pinned to the surface's session ID. Existing
service finish, frozen evidence, and post-finish annotation semantics are reused.
A task response advertises workspace grading support; older running hosts show
recovery guidance rather than presenting a form that would fail on submission.

Checkpoints: workspace grade and annotation persistence map to the real human
scenario in `test:eval-web`; own-session authority and authentication map to
`eval-web-host.test.mjs`; unsettled finish rejection, freeze, and annotation
ownership map to `eval-human-task.test.mjs`. The browser scenario replaces its
previous direct-RPC grading with user-facing controls, preserving persistence,
reopen, write rejection, and export assertions. No test was deleted.

Actual workspace-grading verification: 19 focused tests passed across host,
human-task lifecycle, and telemetry module inventory. The inventory initially
failed ordering after adding the new renderer module; sorting fixed it and the
rerun passed. All five `test:eval-web` inner scenarios passed, including saving
satisfaction, final feedback, and a moment annotation through workspace UI,
then asserting exported evidence and persistence after restart. PRD readability
and whitespace checks passed. The new telemetry registration is metadata only.
Earlier full-check failures remain unresolved. No compiled source changed and
no commit was made. No paid inference or live login was run.

The existing user host was deliberately not restarted: an active human session
would be interrupted. New grading routes apply to newly started Eval hosts.
The panel detects older hosts and explains the dashboard fallback. Therefore
these results certify deterministic test-host behavior, not current user-host
availability. The live user task and authentication were preserved.

Adversarial reviewer `/root/provider_backend` reports no unresolved findings at
seven-file digest
`0d7509f8c3a9802ff1a1744d3652540f058a39bfce695077bdb2f4268e08f984`.
Scope: web-host.mjs, web-bridge.js, renderer main.js/human-task-grading.js,
telemetry-module-inventory.mjs, test-eval-web.mjs, eval-web-host.test.mjs.
Reviewed authority, feedback isolation, lifecycle UI, older-host compatibility,
and proof mapping. Digest uses sorted repository-relative path + NUL + bytes +
NUL. Invalidated by source changes; non-certifying without a PR.

### Interactive Europe-trip variant

Explicit user decision: copy the existing trip task into an intent-discovery
case. `interactive.planning.group-europe-trip` uses a vague opening and a private
human brief, with graph questions/choices, adaptive incorporation of answers,
and eventual preference fit as manual criteria. The original autonomous case
is unchanged. The new case has no file/commit delivery requirement. Single-turn
matrix grades do not certify hidden preference fit; its description says so.

Changed seams: catalog registration, prepared private brief/rubric and digest,
dashboard instructions, workspace grading brief rendering. Only the initial
prompt enters product thread creation. The real service transport test observes
that boundary. The browser runner creates this case with a deterministic harness
and observes the private brief and grade form together. Human-task and gateway
checks passed (18 tests); the final human-task rerun passed all 8 tests. All five
browser scenarios passed. PRD readability and diff whitespace passed. No paid
inference or semantic-success claim. No compiled source changed; no commit.

The host was restarted after confirming its only human session was already
interrupted, preserving profile/authentication. The new catalog is available on
that host. Judge automation and simulated-user behavior are not implemented by
this case-only change; the rubric guides manual grading.

Reviewer `/root/provider_backend`: clean, no unresolved findings, six-file digest
`7b60380407a90da80bb6f0d68884544ba7fdbd01c4c8b4f9ae9a8e6d70600c78`.
Scope: interactive-trip-case.mjs, eval-service.mjs, human-tasks.js,
human-task-grading.js, eval-human-task.test.mjs, test-eval-web.mjs. Reviewed
private-context isolation, manual rubric semantics, and browser coverage.
Sorted path + NUL + contents + NUL digest; changes invalidate this assertion.
Non-certifying without a PR. Previous full-check failures remain unresolved.

### Finish-to-review lifecycle clarity

User clarified that graph review belongs after finishing. The dashboard now
explains that sequence and calls the final action Save grade and finish, matching
the workspace. Selected-session lifecycle refresh runs on focus and every two
seconds while Human Grader is shown. It rerenders only on a changed session
status, rechecking at the render boundary to protect unsaved same-state drafts.
Only active sessions admit workspace opening; terminal sessions admit graph
review and moment annotations. Transitional states disable opening.

Changed seams: dashboard lifecycle refresh, labels, and state-dependent controls.
The existing browser human-task scenario now verifies automatic switch to Open
graph review and removal of the finish form after workspace grading. This uses
real service persistence and renderer behavior, not a duplicated state model.
No test was removed. PRD readability and whitespace checks passed. The live
user dashboard was refreshed with empty grading fields; its active task was
preserved and the new guidance observed. No backend restart or inference.

Adversarial reviewer `/root/provider_backend` initially found a same-session
refresh race and transitional annotation buttons. Both were fixed and re-reviewed
clean at two-file digest
`fa48f73205630521ee0bca61911eb68424bff616b1f55cb96690372a898a770f`
(human-tasks.js and scripts/test-eval-web.mjs; sorted path + NUL + bytes + NUL).
No unresolved review findings. Non-certifying without a PR; source changes
invalidate the assertion. Prior full-check failures remain unresolved.

Actual heavy result for this snapshot: interrupted startup, human-task (including
finish-to-review transition), and host scenarios passed. The overall browser
runner failed later in the unchanged Settings scenario: #saveFamilyEdit became
unstable/detached before click (30-second timeout). Judge scenario was not reached.
This is a partial proof, not a full browser-suite pass. No unchanged retry was
performed and this unrelated failure remains recorded for follow-up.

### Correction: live in-workspace review and grading

Explicit user correction supersedes the earlier finish-before-review decision:
humans review the graph and save grades/annotations while interacting in the
same task workspace. Saving feedback must not finish a task. Finish task is a
separate optional-rating action. Archived graph review remains a revisit path,
not a grading prerequisite.

Changed seams: HumanTaskService.grade and grade history, optional satisfaction
on finish and rollback restoration, active owned-event annotations, session-bound
/grade transport, dashboard grade RPC, workspace capability version 2, independent
workspace/dashboard controls. Feedback remains evaluator evidence; no product
request is made by grade/annotate. Version 2 refuses the old combined UI on an
older backend. Existing finish clients with an explicit rating remain compatible.

Checkpoint mapping: service scenario saves active grade/annotation, sends another
interaction, retains rating history, finishes unrated, and verifies immutable
old exports after later grading. Host test rejects unauthenticated grading and
binds spoofed session IDs to the surface owner. Browser human-task scenario saves
a grade and annotation before finish, asserts status remains active, then finishes
and verifies persistence/export/reopen. Existing rejection/freeze tests remain.

Actual verification: all 19 focused tests passed; all five browser scenarios
passed, including live grading. PRD readability and whitespace passed. No paid
inference or live login; prior full-check failures remain unresolved. No compiled
source changed, no commit made. The current user host was not restarted because
its active session would be interrupted. New endpoints require a host restart;
the user session remains preserved in the old process.

Final review `/root/provider_backend`: clean at eight-file digest
`719317dfd72ddd8d86841fdf9059f981651db9ecc2618cd3f4ec3cf1f61dac0a`.
Scope: human-task-service.mjs, web-host.mjs, web-bridge.js, human-tasks.js,
human-task-grading.js, eval-human-task.test.mjs, eval-web-host.test.mjs,
test-eval-web.mjs. Fixed status-specific success copy and extended the existing
freeze-failure test to preserve a saved grade/history during rollback. Final
19 focused tests and all five browser scenarios passed after those fixes.
Digest format sorted relative path + NUL + contents + NUL; source edits invalidate
review. No unresolved findings; non-certifying without a PR.

### Archived graph review grading correction

User observed missing controls in Open graph review. That path now passes
session-bound task/grade/annotate callbacks to the read-only review gateway.
Its bridge installs grading separately from the live observer; it grants no
finish, task execution, or additional product writes. Generic/automated review
surfaces have no grading callbacks even if a caller supplies the query flag.
Checkpoint mapping: host test covers authenticated grading, generic/judge denial,
finish denial, and product-write denial. Existing browser human-task proof now
saves a grade through archived graph review, checks durable satisfaction, and
asserts Finish task is absent. All 20 focused tests and all five browser scenarios
passed. PRD readability and whitespace checks passed. No paid inference.

Reviewer `/root/provider_backend` found no unresolved issues at six-file digest
`726f220405fd8ee8a9e355f5ac8724fcee4b79e00b3cf752f12c0dddbea5b68c`:
index.mjs, web-host.mjs, web-bridge.js, renderer main.js, eval-web-host.test.mjs,
test-eval-web.mjs. Reviewer independently passed 11 host tests. Non-certifying
without a PR; changes invalidate the sorted path/NUL/content/NUL assertion.

Confirmed no active user sessions before restarting the same profile. Reopened
the saved interactive trip graph and observed Satisfaction, Feedback, Save grade,
and moment-annotation controls in the real in-app review. Replaced the user's
original stale review tab with this corrected URL and expanded grading. No user
grade was entered. Existing full-check limitations remain as previously recorded.
