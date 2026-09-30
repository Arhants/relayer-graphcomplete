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

