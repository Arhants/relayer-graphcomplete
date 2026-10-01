# Issue 544 — simulated task user

This report records the original slice-2 snapshot. The subsequent user-approved
calibration changes and their verification are in [actor v2](actor-v2.md).
The original review digest below does not certify those later source changes.
Current merge-readiness repairs and pending gates are recorded in
[merge readiness](merge-readiness.md).

Product authority: PRD §13.2.3 and ADR 0003. This is slice 2: an actor
operating the production task workspace between settled responses. In-turn
input simulation, independent observers, private taste profiles, and human
calibration remain separate work.

## Changed seams and checkpoints

| Promise / boundary | Production seam | Deterministic proof |
| --- | --- | --- |
| Separate versioned actor configuration and restricted native inference | `task-actor.mjs`, eval-runner `simulated-user/task-actor.ts` | `eval-task-actor.test.mjs`: native configuration, prompt and environment projection |
| Adapt to current rendered state while preserving admission and budgets | `task-actor-service.mjs` → `HumanTaskService.write` | Actor test: adaptive trajectory, unknown write, action limit; browser: Send and invoke |
| Wait for the submitted response to render, including same-turn retry attempts | Service submission identity, renderer presentation, browser readiness predicate | Actor tests: stale failed-attempt presentation and actual settled retry identity; browser: latest accepted turn after invoke |
| No action during product execution; cancellation reaches reads, writes and inference | Service settlement, browser context, gateway abort signal | Actor tests: settlement, queued intent, persisted satisfaction, pending read/write, native deadline and service close |
| No replay after uncertain submission | Existing durable admission reservation | Actor unknown-write/reopen test and existing human-task tests |
| Actor satisfaction stays independent of human grades and objective checks | Actor events, human grade, finish, immutable export | Actor test: reopen/export with disagreement and failed objective check; browser: active human grade and completed export |
| No evaluator feedback or broader capability reaches actor | Projected actor surface and denied annotation routes | Actor surface route tests; browser: separate live reviewer and actor contexts |
| Only pixels and visible enabled controls; stale refs fail | `task-actor-browser.mjs` | Browser: clipped control excluded, forged/stale refs rejected, node selection, compiled node input, Send and invoke |
| Active actor review permits grading but no product mutation or Finish | `index.mjs`, review surface and `human-task-grading.js` | Browser: grade in active graph review, no Finish control, product write 403, actor continues without human feedback |
| Dashboard configuration/start/stop and host lifecycle | Human Grader UI/bridge/RPC, `index.mjs` | Browser: mode/config/start, real-index disconnected runtime rejected before candidate creation; service cancellation tests; source review of Stop dispatch and shutdown ordering |
| Preserve human-session behavior and provider/model authority | Existing task routes and optional signal propagation | Existing session/web/service tests; browser human follow-up, setup authority, finish/export, real-index process restart |
| Select actor tests in CI | `affected-modules.v1.json` | `ci-affected-plan.test.mjs` for desktop and eval-runner changes |

## Required verification plan

Run warm actor, human-session and gateway tests during edits. Before handoff,
run `npm run check`, `npm run build`, and all chapters of
`npm run test:eval-web`. These tests use fixture model decisions; none invokes
paid inference. The browser proof retains production rendering, real native
product servers, model-admission receipts, and task routing.

## Browser coverage and subsumption

The human follow-up chapter now uses the existing task-system fixture with
inert provider/model acquisition and accepted native attempt receipts. The old
receiptless historical fixture is correctly non-continuable under current
conversation compatibility rules. Production compatibility policy was not
changed to make the test pass.

The replacement retains composer input, two completions, timing observation,
node annotation, live and completed grading, export, presentation persistence,
and failed-grade draft preservation. A separate executable-index chapter
retains the host startup/RPC/finish/export/shutdown/restart boundary and verifies
persisted read-only review with rejected product writes. Native product restart
also verifies the admitted conversation remains compatible. These chapters
protect different process and admission boundaries; neither subsumes the other.

The actor chapter inspects a node, fills the composer, sends, selects another
node, invokes an action, and verifies the latest accepted response before
finishing. It saves a human grade from a separate read-only review while the
actor is active. A second actor chapter fills a rendered compiled node input,
commits its draft and sends through the real product routes; exported evidence
retains the supplied answer.

## Verification results

Final browser run: all nine chapters passed, including active human grading,
node input, Send/invoke, and process restart. Independent focused verification:
50 tests across actor, human-task and web-host suites passed. Full `npm run check` passed: Rust formatting/clippy/workspace/crash recovery,
package builds and type checks, 3,223 JavaScript tests (three skipped), two
secret-boundary tests, 60 Python tests, native receipt lint and PRD readability.
See [check summary](check-summary.txt) and [browser summary](browser-summary.txt).
Final `npm run build` passed on the same reviewed source. All required deterministic gates passed; the three existing skipped JavaScript tests remain unclaimed.

![Actor observation after an invoke](actor-workspace.png)

The screenshot is the production workspace shown to the fixture actor after
its third admitted completion. It demonstrates the observation surface, not
live model adaptation.

Earlier evidence: 100 focused tests across seven files passed after correcting
the native SDK package boundary and stale local binaries. Nine browser chapters
passed before the last retry/read-only-active-review additions. Those runs do
not certify the final snapshot.

Failures encountered and repaired:

- The first full check found the SDK added at the desktop root. Native actor
  transport now belongs to eval-runner, which already owns this dependency.
- Two existing native end-to-end tests used the worktree's stale `target/debug`
  link. Pointing that local link to current source-built binaries made both
  unchanged tests pass. Existing user preview processes were not restarted.
- The old human fixture could not Send under current admission rules; the
  replacement above preserves the original boundaries with valid receipts.
- A browser assertion caught an old graph after invoke. Observation now waits
  for after-paint thread/turn/attempt identity, not backend settlement alone.
- One intermediate browser run timed out on the existing Settings family
  selector. Subsequent complete runs passed that unchanged chapter.
- Adversarial review identified cancellation races, annotation exposure,
  clipped DOM text, a nonfunctional Finish control in active review, and stale
  retry presentations. The resulting tests exercise those boundaries directly.

## Native artifact provenance

No cold native provisioning or downloaded cache was needed. The existing warm
Cargo target built the repository's native source at base `f9ce3209`; this change
has no Rust edits. Private copies isolate browser proof from other worktrees'
builds. SHA-256:

- app server: `bc37bd089ed2f4fade78a2a3547baa9395470658f34b6a2942a1a250c1ac6805`
- graph server: `a277448c2cab1d0e0a989ff3f4fb27d97e2d8eb51834c3551d39691b5ba78a61`

## Limits

No live Luna call, calibrated human realism, useful-first-graph latency,
independent observer, automatic improvement, or desktop release proof is
claimed. Native transport tests verify options and rejected tool traces with
an injected SDK; they do not certify a paid native-model run. The initial actor
browser opens after candidate dispatch, so its first-visible-graph latency is
not suitable for responsiveness comparisons. Human review cannot steer the
actor. Actor action/completion limits are not monetary cost caps.

## Adversarial review

Reviewer `/root/eval_facts` independently reviewed the 21-file scope in
[review-scope.json](review-scope.json), digest
`6102fb0b74d4f5b3ad0ffc5eb4a3ad741d6c8e356f1a46c0b641d8d28065b956`.
The digest hashes sorted relative path + NUL + raw SHA-256 file digest for
each entry. Verdict: no actionable source findings in authority isolation,
cancellation/no-replay, exact retry-attempt readiness, and preservation of the
host/human browser-test boundaries. Independently ran 50 tests successfully.
Stop-button wiring and shutdown ordering are source-reviewed; service tests
prove actor cancellation, while the browser separately proves process restart.
Any change to that scope invalidates this assertion. Source review does not
substitute for the required gates or live-model proof.

## Overnight actor recovery (2026-10-01; verification in progress)

The ten-case live batch preserved ten interrupted trajectories, not successful
results. Nine action-associated failures involved graph-node clicks; one happened
between observation and an actor decision. Raw errors were intentionally absent
from exported evidence, so the generic category did not establish the cause.

Changed executable seams and checkpoints:

- Actor browser node resolution: keep opaque references, but allow a detached
  graph-node handle to resolve only to one identical node in the same observed
  thread, turn, layer, attempt, selected-node and navigation scope. Names alone
  never resolve a target. Normal visibility, hit testing and browser clicks remain.
  The real-browser actor chapter replaces an observed graph element using the
  production DOM-replacement pattern and real activation callback. It verifies
  selection after rebinding and rejects changed labels/scope, duplicates and hidden
  replacements. Forged and expired observation references still fail closed.
- Error classification and action validation: closed categories distinguish stale
  controls, unavailable controls and invalid actions without logging raw provider
  payloads. `test/eval-task-actor-errors.test.mjs` verifies safe classification.
- Deadline admission and execution: the user's overnight request permits sufficient
  interaction time. PRD §13.2.3 records configurable one-to-sixty-minute deadlines,
  retaining the fifteen-minute default. One signal spans startup and the run;
  `test/eval-task-actor.test.mjs` verifies configured timeout selection, bounds,
  cancellation and no extension. Case budgets and AI stopping decisions remain.

The natural-poll hypothesis did not reproduce in the deterministic fixture. A
forced same-presentation DOM replacement did reproduce the runtime failure before
rebinding. The initial repaired browser suite passed all twelve chapters. This
establishes the detached-DOM failure boundary; a live canary is required before
claiming it explains the saved failures. Additional adversarial checks and full
check/build are pending. Focused actor/error tests passed 32 tests.

Failed runs and subsequent attempts remain distinct. More actions, longer time,
or actor-reported satisfaction do not establish independent endpoint attainment.
Any new actor revision must preserve its predecessor and real motivating feedback;
there is no automatic promotion. Genuine failures and incomplete endpoints belong
in the final report alongside successful outcomes.

The restaurant failure was independently traced to its final structured response:
`reason` contained prose although finish validation required an enum. Actor v4
constrains that field in the native output schema and locates explanations in
`comment`. The service passes each revision's pinned schema, including historical
unrestricted schemas. The registry test reopens a sealed legacy record and proves
that old and new schemas remain distinct at dispatch. The SDK test observes the
actual native `run` output schema. The focused three-file suite passed 46 tests.

The repaired live canary preserved three submissions and successful node actions
before its original fifteen-minute deadline. The first graph took roughly nine
minutes. It ended `actor_timeout`, not success. This is live evidence that node
interaction can proceed, not proof that all earlier failures had the same cause.
The next revision gives each case sixty minutes and retains its case completion
budget; the AI user still decides its actions and stopping outcome.

Recovery verification: `npm run check` passed (276 test files, 3471 tests;
three tests skipped, plus the separate two-test secret-boundary pass). `npm run
build` passed. The final `npm run test:eval-web` passed all twelve chapters,
including the replacement-node negative cases and real node activation.
An earlier browser invocation overlapped package rebuilding and timed out before
native startup; it is retained as an unsuccessful attempt, not product proof.
The complete sequential-build browser rerun passed.

Follow-up boundaries found during adversarial/live review:

- Editing a historical actor revision now accepts only the exact known legacy
  contract and upgrades the newly published revision to the current code-owned
  schema. Earlier revisions remain byte-preserved. The registry regression uses
  the editor's predecessor-copy payload (failed before the fix, passed afterward).
- The setup editor exposes the pinned deadline in minutes and preserves the chosen
  value during publication/reopen. The browser chapter verifies sixty minutes.
- A single-step local-weekend run chose `next_step` and was interrupted. Actor v5
  supplies currently available action kinds and narrows the pinned native schema
  before each decision. `next_step` is absent at the last step or exhausted budget.
  The effective schema is saved with its observation; the actor still chooses the
  next action. One- and two-step real-service tests failed before this repair and
  passed afterward. The SDK seam verifies forwarding the narrowed schema. These
  changes neither replay the failed action nor turn an interrupted run into success.

The focused actor, registry and safe-error suite passed 48 tests after these fixes.
Earlier full-gate results certify the preceding snapshot only; full final checks
remain required for this follow-up snapshot. Active v4 runs retain their original
runtime and are assessed separately from any v5 rerun.


Workspace refresh exposed another boundary: a well-formed finish claimed reached
while listing remaining work. The authority check still rejects that declaration.
A single bounded fresh AI decision can now reconsider it with fixed validation
feedback and a new observation. Both rejected action and usage are recorded;
fields are never rewritten. Repeated contradictions and exhausted action budget
still interrupt. Unknown actions, product-write errors and provider failures are
not retried. Focused production-service tests cover repair-to-incomplete and
repeated contradiction, with zero product dispatch. The focused suite now passes
53 tests. Browser observation allowlists explicitly cover action availability and
continue excluding evaluator state; full final gates remain pending.

Terminal contradictory finishes also retain their exact bounded action and usage,
with `retryAllowed: false`. A last-slot regression proves no budget extension.
The first v5 browser attempt correctly failed its old observation-key allowlist;
the updated allowlist explicitly permits only action admission metadata alongside
controls, screenshot and text. The complete twelve-chapter browser rerun passed.

An independent native-metadata audit then found all eight everyday candidates
running in the parent Relayer repository, not their materialized task folders.
Those runs are preserved but excluded from clean outcome evidence. The external
catalog now owns isolated Git seeds with new materializer/environment and case
identities. The host requests the exact subfolder and verifies its canonical
returned project path before any candidate dispatch. The service regression
returns an ancestor project and proves rejection before thread creation; it
failed before the guard and passed afterward. Native cwd validation is required
on all replacement everyday runs. The two coding cases used correct workspaces;
their objective failures remain valid negative evidence.

Final deterministic gates for the v5/isolation follow-up passed: `npm run check`
(3479 tests passed, three skipped, plus two secret-boundary tests), `npm run build`,
and all twelve `npm run test:eval-web` chapters. The preceding full check had one
failure in an outdated fake project response; its correction creates the fixture
folder and returns the real API's path field. The corrected 28-test suite and the
subsequent complete check both passed. Earlier failed logs remain diagnostic
history, not passing proof. Replacement live runs remain separate evidence.
