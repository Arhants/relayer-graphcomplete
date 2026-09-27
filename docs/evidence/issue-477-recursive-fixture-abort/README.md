# Recursive fixture abort checkpoints

This bounded fixture repair maps to the explicit Complete contract in PRD §1.4
and the provider execution lifecycle in PRD §12.2. Stopping a child must leave
its semantic current stopped and observable. The fixture tests separately check
that cancellation settles this child execution. This fixture change does not
establish that it was the unique cause of the historical host cleanup timeout.

| Checkpoint | Deterministic evidence | Boundary covered |
| --- | --- | --- |
| An abort delivered before the graph advance response and an abort delivered after readiness both settle child native execution as failed | `test/recursive-complete-fixture-abort.test.mjs` runs the actual shared fixture with a controlled graph-client response; both cases use event-loop turns, not a timer deadline | Fixture cancellation and native execution settlement; not product graph persistence |
| Parent waits through delayed child startup and publication; startup failure cannot bypass or deadlock readiness | `test/recursive-complete-fixture-abort.test.mjs` drives the parent fixture with gated child startup and publication, then checks the stop call; a rejected child result must fail the waiting parent without stopping | Parent fixture synchronization and early child failure boundary |
| Child publication failure settles child execution as failed | `test/recursive-complete-fixture-abort.test.mjs` rejects the controlled advance response and observes failed native settlement | Child fixture setup failure path |
| A second parent on one persistent harness waits for its own child; an earlier success or publication failure cannot release or poison it | The sequential success and failure cases reuse one harness while routing graph controls by canonical completion identity | Per-completion readiness lifetime across sequential calls |
| Concurrent parents cannot release or reject one another | One case publishes child A while child B remains pending; another fails A before readiness while B remains independently completable | Concurrent completion isolation within one harness |
| Harness instances returned by one factory do not share readiness | The two-instance case overlaps one parent and child pair in each harness, then publishes each child separately | Per-harness ownership of readiness state |
| A child resolves the exact readiness entry captured at native entry even if the map later receives a same-ID replacement | The replacement-boundary case starts a second parent from the first child's post-publication hook, reuses the child ID, and proves each parent stops only after its captured child publishes | Deferred object identity and exact-entry cleanup |
| Parent stop preserves a stopped retained current, `cancelled_by_user`, and one stop operation | `test/recursive-complete-e2e.test.mjs` stop scenario runs through the real app server, host, and graph server | Product authority and durable semantic state |
| Ordinary runtime close completes within the existing deadline after cancellation | `test/recursive-complete-e2e.test.mjs` teardown after the stop scenario | Host and runtime cleanup; requires reserved integration run |
| Shared success, fire-and-forget, and visual detail paths remain usable | `test/recursive-complete-e2e.test.mjs` and `test/eval-app-integration.test.mjs` exercise the shared fixture consumers | Secondary shared-fixture behavior; requires reserved integration run |

The new focused test is selected by the `test/` changed-test rule in
`scripts/ci/affected-modules.v1.json` and is part of the Vitest chapter in
`scripts/ci/verification-portfolio.v1.json`. The shared fixture is also covered
by the existing recursive E2E and Eval integration suites. No tests were
removed.

The original focused regression was run against the old fixture and the earlier
repair with late child readiness; both failed. The lifetime expansion then ran
against the factory-wide singleton: 4 of 10 tests failed. The repaired fixture
passed those 10 tests. The added same-ID replacement test was separately shown
red against a map reread and green against the captured entry.

The source-bound integrated Linux run used index tree
`95fd97881f094e8d4776dd9283cdd5ff68b04076`, with `origin/main` and
`MERGE_HEAD` at `77150aee37f84fda043caa0b8433fa41cf4bbf57`.
Fresh dependency installation passed, followed by these exact results:

- the focused fixture file passed 11 of 11 tests;
- the recursive E2E file passed 3 of 3 tests;
- the Eval integration file passed 18 of 18 tests;
- the complete Vitest chapter passed 186 files with one platform skip;
- `npm run check` and `npm run build` both passed.

Source identity before and after verification remained the same. The check log
has SHA-256
`5331b84d271ab4b2a6523f21ef696037c04ca7ce433264b7e2f2420af67c0591`;
the build log has SHA-256
`2e785a350fdbf92c54ce43661d75a4590607567274ee3d92510afae5d865043d`.
These results establish the mapped deterministic and integration checkpoints
for that exact tree. They do not prove that the fixture race was the unique
cause of the historical host cleanup timeout, and they do not broaden proof to
paid inference, release, or unavailable-platform execution.
