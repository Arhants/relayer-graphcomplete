# External interactive catalog integration

Approved scope: external interactive cases use the existing SDK, pinned catalog and
production Human Grader. The exploratory set has two unchanged coding cases and
eight everyday tasks. It is not a comparative baseline. Case content and the
fictional restaurant fixture belong to the capability repository.

## Executable seams and checkpoints

| Promise/boundary | Changed seam | Required proof |
| --- | --- | --- |
| Optional private interaction contract, unchanged legacy identities | SDK snapshot creation/digest/public projection and catalog validation | autonomous-case-contract + eval-catalog tests: private edits affect identity, public metadata excludes private facts/rubric, mutable inputs cannot change bound snapshots, legacy cases unchanged |
| Native account proves subscription rather than API billing | live credential validator | live-credentials tests: account kind and provider adapter preserved; API-key login rejected on subscription adapter |
| External Human Grader uses trusted callbacks and pins authority | EvalService preparation/thread/grading | eval-service-live-authorization: bound consent, API denial, ordinary thread creation, pinned model, catalog provenance and drift, external grading |
| Interactive tasks cannot silently become unattended benchmarks | matrix admission and case/suite selectors | eval-service-live-authorization rejects interactive matrix runs before authorization or queueing; Human Grader availability remains |
| Later submissions preserve catalog identity | HumanTaskService dispatch | eval-human-task: drift before completion admission; existing budget, replay and reopen scenarios remain distinct |
| External launch is available and consent visible | Human Grader UI | test:eval-web: external launch, follow-up, finish, human review/export using fixture inference |
| Private participant context stays out of candidate requests | preparation and actor prompt | external service sentinel test plus existing actor privacy trajectory tests |

Required gates: focused tests during editing; npm run check and npm run build;
npm run test:eval-web after the integrated build. Adversarial review must cover
privacy, authority, compatibility and evidence claims. No live inference is
part of this change's proof.

## Dependencies and limits

Based on calibration PR #628. The providerAdapterId and ChatGPT account-kind check
reuse the separately inspected subscription work; its original checkout remains
untouched. No timing changes from that checkout are copied here.

Initial dispatch still precedes observer attachment. Existing rendered evidence
must keep that fact explicit; backend graph timestamps do not prove visible
first-graph latency. Correct pre-dispatch observer timing remains a separate
integration checkpoint, not certified by this catalog change.

## Observed results

Final `npm run build` passed using the compatible warm Cargo cache.

The required `npm run check` was executed under Node 22.23.2. Rust formatting,
Clippy, workspace and crash-reconciliation tests, package type checks and the
main Vitest suite passed (245 files, 3,313 tests; one file and three tests skipped).
The outer command failed afterward: both Codex secret-provider process tests
hit their five-second `features list` startup deadline. The unchanged isolated
`npm run test:codex-secret-boundary` rerun passed both tests in 1.48 seconds.
This does not turn the original outer command into a clean pass.

The remaining declared checks were run explicitly: 60 Python tests, Ladybug
receipt lint, and PRD readability passed. The focused external authorization
suite passed 19 tests. Full `npm run test:eval-web` passed all chapters, including
external launch and follow-up, matrix-disabled UI, grading/export/reopen,
calibration, actor actions and provider settings. Its final run used the same
native binaries copied from the successful warm-cache build:
app-server SHA-256 `73cb8b59670b88acd19be7cd2890859768c91113331e216186f6f9f66bb07ea1`
and graph-server SHA-256 `28a5f930089908200a95289e111efb18a0c98b6142b207f162dec81d7d32d08b`. The first
added matrix assertion needed the actual New Run view opened; after correcting
that test, one run timed out during native startup, and an unchanged rerun passed.
No application startup workaround or increased timeout was added.

Production Git catalog loading passed for capability commit
`3e0e9711aa0d5732933f6c2928a478fc5f8b5d6f`, tree
`6c54df6d1d00833ed6ef34b4a1940d5e1396de27`, entrypoint
`interactive-catalog.mjs`: 18 registrations and two suites. Case-package build,
124 focused tests (16 skipped), and the restaurant browser lifecycle passed.
See capability PR https://github.com/vishaltandale00/relayer-capability-evals/pull/2.

Adversarial reviewer `/root/eval_facts` found no unresolved privacy, authority,
identity or browser-test-subsumption findings in source snapshot
`568037a4061d61b8a3d6fe8c6dcf2a81e0053b0c7954dc544861852265059c94`
(18 changed/untracked files, before this evidence-only result update). The PR
records final commit-scoped review. No inference, comparative score, current
research correctness, or rendered first-graph timing is certified.


## Merge-readiness follow-up

CI on the initial head found the preserved design prototype's forced exit could
truncate piped stdout (170 of 282 expected comparison rows). The design test now
captures its unchanged checker through a regular file descriptor; the same exit
status and all 282 comparisons remain required. This is a test transport change,
not a palette or product-rule change. The smallest checkpoint is the existing
`test/design-config.test.mjs` integration comparison; all nine focused tests pass.
Adversarial review by `/root/eval_facts` found no assertion weakening or resource
cleanup gaps in diff SHA-256
`b935cb2f952f632172990ab63c727efba6a619605163d3158a144c36bc3d0393`.

## Whole-stack integration gate (2026-09-30)

The stack is rebased on main `fa9ecb01`, with actor repairs and refreshed renderer
capture evidence from #608 and immutable calibration repairs from #628.
The design-check transport fix now lives in the actor dependency.

Additional changed seams and checkpoints:

| Seam | Product promise / failure boundary | Deterministic checkpoint |
| --- | --- | --- |
| External human preparation | Cancellation during credential/catalog/materialization work permits no late product dispatch | eval-service-live-authorization stalled callback scenarios |
| External thread/grading callbacks | Stop releases noncooperative callbacks; late results cannot launch a thread or capture a grade | eval-service-live-authorization thread and grade cancellation scenarios |
| Follow-up admission | A stalled catalog check does not hold the session queue or consume a completion after cancellation | eval-human-task stopped catalog-check scenario |
| Frozen external calibration | Different catalog code cannot stand in for the frozen catalog despite identical case/harness/model descriptors | eval-setup-registry new and legacy frozen-set reopen, pre-dispatch rejection and observation rejection |
| Legacy evidence | Missing identity projection is recovered from sealed evidence without rewriting frozen sets | Same legacy-set reopen scenario |

Actor startup cancellation, v3 visible-label selection, screenshot artifacts,
terminal observations and endpoint-at-budget tests remain in the inherited
portfolio. Human-create form retains startup cancellation, revision selection
and case-bound subscription consent. Inference is not used by these tests.

Reviewer `/root/slice1_authority` reviewed HEAD
`ca3cbe4421ddc1bd189c567bab4ebbb17d13ec1f` plus six dirty files:
`desktop/eval-main/calibration-service.mjs`, `desktop/eval-main/eval-service.mjs`,
`desktop/eval-main/human-task-service.mjs`, `test/eval-human-task.test.mjs`,
`test/eval-service-live-authorization.test.mjs`, and
`test/eval-setup-registry.test.mjs`.
Sorted path + NUL + hexadecimal SHA256 + LF manifest SHA256:
`818d86f0652f500e292890697254aef85788c12aa0f17533b5e9d1f3741d2bcf`.
Verdict: catalog provenance blocker resolved; no remaining finding in the
reviewed cancellation, subscription consent, frozen identity and model-route
scope. Reviewer independently ran 14 setup/calibration tests. This does not
certify the separate full-stack gates or live inference.

The earlier focused run passed 64 tests. The two new provenance tests initially
expected the raw service error through the actor's intentional error redaction;
they now observe the actual task-admission seam and exact raw rejection.
All fourteen setup tests then passed. The final full `npm run check` passed:
3,459 Vitest tests, two secret-boundary tests, 66 Python tests, native workspace
and crash-recovery suites, type checks, receipts and PRD readability. Three
Vitest tests and one file remain skipped by the existing portfolio. Build passed.
All twelve browser chapters passed, including the integrated external human
lifecycle and retained actor/calibration flows. All four compiled-runtime tests
passed. These gates ran against the reviewed source bytes above; only this
result report changed afterward. No merge is authorized until the user's
whole-stack human gate is complete.

The human gate uses private copies of the successfully built native binaries:
app-server SHA256 `c333eea7da8a14151b9eac3d3c5143bc70f378e128b157eafdd742bf3ce9efeb`,
graph-server SHA256 `d8e03edcdda070914c0bdb53b8fd9c8d8cad45abf5cbc0ff95be7eac09d4a559`.
The existing profile's databases and Eval records were backed up after graceful
shutdown. Authentication, historical setup revisions and trajectories are kept.
The gate starts no paid inference and performs no setup promotion.

Independent restack reviewer `/root/eval_facts` found no remaining blocker in
SDK privacy projections, matrix denial, startup Cancel/revision/consent UI,
external callback cancellation, late materializer dispatch and frozen catalog
identity. Same HEAD and six-file scope; its sorted path + NUL + raw SHA256
manifest digest is `c5eb8cdba95e2a53d7bb38525a9f87cf8e556c5d4b50fb6489678980c178dcc3`.
The different digest format identifies the same reviewed bytes. This was a
source review, not an independent browser or live-inference run.
