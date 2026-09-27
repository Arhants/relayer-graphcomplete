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
| Child publication failure rejects readiness and settles child execution as failed | `test/recursive-complete-fixture-abort.test.mjs` rejects the controlled advance response and observes both readiness rejection and failed native settlement | Child fixture setup failure path |
| Parent stop preserves a stopped retained current, `cancelled_by_user`, and one stop operation | `test/recursive-complete-e2e.test.mjs` stop scenario runs through the real app server, host, and graph server | Product authority and durable semantic state |
| Ordinary runtime close completes within the existing deadline after cancellation | `test/recursive-complete-e2e.test.mjs` teardown after the stop scenario | Host and runtime cleanup; requires reserved integration run |
| Shared success, fire-and-forget, and visual detail paths remain usable | `test/recursive-complete-e2e.test.mjs` and `test/eval-app-integration.test.mjs` exercise the shared fixture consumers | Secondary shared-fixture behavior; requires reserved integration run |

The new focused test is selected by the `test/` changed-test rule in
`scripts/ci/affected-modules.v1.json` and is part of the Vitest chapter in
`scripts/ci/verification-portfolio.v1.json`. The shared fixture is also covered
by the existing recursive E2E and Eval integration suites. No tests were
removed.

The focused regression was run against the old fixture and the earlier repair
with late child readiness; both failed. It passed against the corrected fixture
(5/5 tests). The real recursive E2E, Eval integration suite, `npm run
check`, and `npm run build` remain reserved coordinator checks; this mapping
does not claim those results or resolve the historical cleanup diagnosis.
