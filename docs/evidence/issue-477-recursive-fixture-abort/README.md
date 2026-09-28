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
| Parent cancellation cannot strand the readiness wait or silently take ownership of an independently running child | The focused file covers a pre-aborted parent, abort during readiness alongside an independently completing sibling, and readiness plus abort in one turn; it also observes abort-listener removal | Parent cancellation, listener cleanup, same-turn authority, and child/sibling independence |
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
red against a map reread and green against the captured entry. The parent-abort
regression timed out against the prior waiter and the expanded focused file
passed 15 of 15 tests after the waiter began racing the parent signal. The suite also covers synchronous launch cancellation followed by a late child rejection and listener removal for readiness, child-result, and abort winners.

The source-bound Linux portfolio for the parent-abort expansion used index tree
`9b2f285f808c21c80a1adb5c89dbfe8bc1c04436`, with `origin/main` at
`0f654791220a72c09b7e893ad97a403b4826e5f9`. Fresh dependency installation
passed, followed by these exact results:

- the focused fixture file passed 15 of 15 tests;
- the recursive E2E file passed 3 of 3 tests;
- the Eval integration file passed 18 of 18 tests;
- the complete Vitest chapter passed 189 files and 2,458 tests, with one file
  and 26 tests skipped for their declared environments;
- `npm run check`, `npm run build`, `npm run test:eval-compiled-runtime`, and
  `npm run test:eval-web` passed.

Source identity before and after verification remained the same. The check and
build log SHA-256 values are
`009c9a51a0478ecfc13a0ce06e8b6647d88a4f39a53b46f6be31850c8f56b868`
and `4a0382f53dc5a4cef59a8c5db0cd076b5a647a292c0153d86cbbdede47efef8b`.
The compiled-runtime and Eval-web log SHA-256 values are
`72ea2bda9abe45cf8afca1d4777f6b9ed24c0ddb293ee7f4f0d0970d13121d96`
and `864f712007848fe43f62dccaf21a2f8dcd16a1061337c49c953b4b6abfe4fd70`.
The earlier `4c10e913…` full run plus `15775ea…` test-only delta proof remains a
historical ledger and is superseded by this full current executable proof.

These results establish the mapped checkpoints only for their stated source
snapshots. The first CI run on an earlier integrated head completed its test
body but exceeded both resource-close deadlines during teardown; a later
unchanged retry passed, but the failure's cause remains unknown. The evidence
does not prove that either fixture race uniquely caused a historical cleanup
timeout, and it does not broaden proof to paid inference, release, or
unavailable-platform execution.
