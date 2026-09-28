# TLA+ models

These models find bugs in the parts of Relayer with the most concurrent
state. The method is model, counterexample, reproduce, fix:

1. Model one race-prone state machine, citing the code each action abstracts.
2. Let TLC search every interleaving for a trace that breaks a stated promise.
3. Reproduce the trace as a scenario the real code replays, and watch it fail.
4. Fix the code, mirror the fix in the model, and flip the check.

A model is a search tool, not proof. The evidence for a bug or a fix is the
regression test on the real code. A passing check means only that no
counterexample exists within the model's abstraction and bounds.

## Running

```bash
npm run check:models
```

Pass check ids to run a subset. The runner needs Java 11 or newer and the
pinned `tla2tools.jar` (version and sha256 in `checks.json`). It never
downloads the jar; place it at `~/.cache/tlaplus/tla2tools-1.8.0.jar` or set
`TLA2TOOLS_JAR`. All checks and scenarios together take about 40 seconds.
`--render` rewrites the scenario traces (see below).

`check:models` is not part of `npm run check` yet. Adding it there requires a
Java runtime in CI and an entry in `scripts/ci/verification-portfolio.v1.json`.

## How expectations work

Each check in `checks.json` expects either `pass` or a named violation. A
known bug is recorded as an expected violation, so the runner stays green
while the bug is open. The runner reads only the models, never the code, so
the models must be kept in step with the code by hand.

`CompletionCurrent` has one constant for each candidate fix:

- `completion-today` mirrors the code as it is.
- `completion-fixed` enables every fix.

Each bug check starts from `completion-today`, switches every other bug's
fix on, and leaves its own constant as the code has it. A violation of that
check can therefore come only from its own mechanism.

A fix PR flips its constant in `completion-today`. That check then passes, so
the PR must also flip its expectation to `pass`; otherwise the runner fails.
A provider fix edits `ProviderSettings.tla` directly and flips its check the
same way. Violated checks run on one TLC worker, so their traces are the same
from run to run.

## Scenarios and trace replay

A scenario in `scenarios.json` is a list of named spec actions with their
arguments, such as `["Handoff", "N", "ok"]`. The runner runs each scenario
through its model with TLC. It writes the full expected state after every
step to `traces/<id>.json`. The spec's `Act` operator maps each name to its
action.

The traces are committed, so replaying them needs no Java. Outside
`--render`, the runner fails if a committed trace no longer matches the
model. A step the model does not allow is also an error.

An adapter replays each trace against the real code, one step at a time. For
`ProviderSettings`, [`test/support/provider-settings-trace-adapter.mjs`](../../test/support/provider-settings-trace-adapter.mjs)
drives the real `ProviderDefinitionService` and IPC handlers:

- **Actions:** each spec action becomes the real call it abstracts.
- **Awaits:** the spec splits an operation at certain awaits (`prepareRuntime`,
  `login()`, `openExternal`, `account()`, `onRuntimeReady`). Each of those is
  held on a deferred, so each step resumes exactly one of them.
- **State:** `observe()` is the refinement mapping. It reads the real objects
  back as the spec's variables.

[`test/provider-settings-traces.test.mjs`](../../test/provider-settings-traces.test.mjs)
checks two things after every step:

- The real state must equal the model's state. A mismatch means the code and
  the model disagree.
- The scenario's promises must hold. A broken promise is a bug in both.

For `CompletionCurrent`, [`crates/relayer-app-server/tests/support/completion_traces.rs`](../../crates/relayer-app-server/tests/support/completion_traces.rs)
replays against the real app-server code:

- **Graph:** a real in-memory graph server holding a real recursive child.
- **Product:** the real SQLite product store.
- **Harness:** a fake whose start is refused, or runs while acknowledging
  another identity (a lost acknowledgement).
- **Launch steps:** each step calls the function `complete_prepared_child`
  calls for it (reserve, claim, activate, start).
- **Cleanup:** the start-failure cleanup is the real background task. The fake
  harness holds its first call (cancel) until the replay reaches
  `CleanCancel`, so the task cannot run ahead of the trace. Its later loops
  cannot be paused, so the replay compares state once it has run.
- **Child Return:** the child's model returns through its own graph writer.
- **Projection:** the product's settlement reason (`execWhy`) is compared, so
  a wrongly projected reason is caught.
- **`finalPromises`:** these must hold at the end of the scenario.
- **The deadlock the model missed:** the model has no harness session lock. The real-process `recursive-complete-e2e` test found the gap: child admission first asked the host to set up the thread's session, which the running root turn holds while it awaits the child. Children now skip that step (`admit_invoked_execution`). The adapter's fake harness rejects session setup as busy, so the fast tier guards against it too.
- **Selected children:** a scenario whose initial state has `selected = TRUE` seeds a catalog and gives the root a model selection. The child inherits it and is admitted: the fake harness signs the admission with the app server's own digest helpers. The replay compares the child's attempt and lease, read from the product database, with the model.
- **Unheld background work:** the semantic and exit observers run on their own. A step that sets them off (`ChildReturn`, `ProviderExit`) is compared together with the background steps that follow it, once they have run. Comparing it at once raced the observer.
- **Beyond the traces:** direct adapter tests cover what the model abstracts:
  - a host that stays unreachable while a child runs (`provider_end_waits_through_an_unreachable_harness`);
  - leases granted for an attempt the product then refuses to record (`a_child_whose_attempt_cannot_be_recorded_releases_its_leases`).

  The handler test `a_launch_whose_caller_disconnects_still_attaches_and_observes_the_child` covers a broker request dropped during the start.
- **Restarts:** `Crash` restarts the app with its harness, so the provider run ends. `AppRestart` restarts only the product server: the harness and the provider run survive, and so do the child's attempt and lease. After either, the resumed provider-end wait (`AttemptEnd`) ends the attempt only once the provider has stopped, and `CancelTerminal` keeps cancelling a stopped or failed child that still runs. Start-failure cleanup fails and settles the child before it cancels (`CleanFail`, `CleanFinalize`, then `CleanCancel`), so an unreachable harness cannot hold the child's result open.
- **Known model gaps:** `AttemptEnd` is a free action guarded by the provider having ended, rather than a step of the observers. The model has no observation error while the provider runs, and the timeout re-poll is modeled only by turning the timeout off. The adapter drives each launch step itself rather than through `complete_prepared_child`, so a wiring slip in the handler is caught only by the handler tests.

The first replay found a model error. The IPC layer releases a renderer
binding once its connection settles, and the model did not.

A bug fix follows these steps:

1. Add the counterexample's steps as a scenario, render it, and watch the
   replay break the promise at the final step.
2. Fix the code and mirror the fix in the model.
3. Re-render the trace. The replay now matches the model's new state, and the
   promise holds.

With the code fix reverted, the replay fails at exactly the step the fix
changes.

## Verdicts

The Verdict column is an independent read of the code for each
counterexample:

- **Confirmed:** the product can reach the trace.
- **Plausible:** reaching it depends on the assumption named in the row.

## Models

### `ProviderSettings.tla`

This model covers provider connections, execution leases, and default model
settings:

- **Desktop main:** the `#serialized` provider queue, connect, reconnect,
  complete, cancel, logout, remove, the execution lease broker and `close()`.
- **IPC:** the browser handoff and renderer ownership.
- **UI:** when Reconnect and Remove are offered.
- **SQLite catalog:** the default family and provider removal guards.

There is one existing managed provider `P`, one new connection `N`, and one
renderer.

| Check | Verdict | Finding |
| --- | --- | --- |
| `provider-leased-runtime` | Plausible: narrow window | Rust admits a turn while `P` still reads connected in SQLite, and the user then signs out and reconnects. When the harness takes its lease, `acquireExecution` hands out the runtime the pending reconnect registered, because it never checks `pendingConnections`. A failed handoff, a cancel or a terminal check then runs `#cancelPendingConnection`, which closes that runtime under the turn. |
| `provider-remove-during-reconnect` | Fixed; now passes | Before the fix: after sign out, Reconnect, then Remove, the pending reconnect outlived the removal and could still complete. Now `remove()` drops it as the provider enters `removal_pending`, which "immediately blocks new attempts through it" (docs/architecture.md). The runtime stays in `this.runtimes` for turns still draining, and it closes with the tombstone. The PRD is silent here, so this is an architecture-backed decision. Scenario: `provider-remove-during-reconnect`. |
| `provider-attempt-ownership` | Fixed; now passes | Before the fix: `bindConnection` ran only after `connect()`/`reconnect()` (including `login()`) and `openExternal` resolved. It added a `destroyed` listener to contents already destroyed, and that listener never fired. It now cancels the attempt instead. This restores PRD BRW-005. Scenario: `provider-destroyed-before-bind`. |
| `provider-close` | Plausible: depends on shutdown order | `close()` waits for lifecycle tasks but not for the queue, and `acquireExecution` ignores `closing`. A turn admitted before shutdown can create and register a runtime after the maps are cleared. |
| `provider-default-family` | Needs a product decision | A catalog refresh that reports `provider_no_eligible_execution_models` tombstones the provider's managed family even when it is the default family. A later refresh with eligible models reactivates the same family. Disable, delete and removal all refuse to break the default family, but the PRD makes no promise here. |

### `CompletionCurrent.tla`

This model covers one recursive child from `complete()` to settlement:

- the graph current's compare-and-swap and receipts;
- the product execution phases and status;
- broker retries of `complete()`;
- the child model;
- the harness run, including a start whose acknowledgement was lost;
- the semantic and provider-exit observers;
- start-failure cleanup;
- the parent's stop, which may come before launch;
- an application restart.

| Check | Verdict | Finding |
| --- | --- | --- |
| `completion-safety-holds` | passes | There is at most one launch per reservation. Stop reports what the graph holds. Terminal states are absorbing. |
| `completion-observe-timeout` | Fixed; now passes | Before the fix: `observe_invoked_completion` had a 5 s control timeout, but the harness answers only when the run ends. A child still running after 5 s was failed with `provider_exited_without_return`, and its capability was revoked while the provider kept running. A live Prime delegation run hit this at about 5.1 s. The observation is now a long poll that the exit observer repeats on a timeout. `provider_end_waits_through_observation_timeouts` proves the repeat with a 100 ms poll against a run that is still going. |
| `completion-activation-failure` | Confirmed | A lost or failed activation settles the execution row only. The graph current stays active, the product status is never finalized, and a broker retry gets 200 with no launch. Restart skips settled rows. |
| `completion-clean-exit` | Fixed; now passes | Before the fix: for an invoked child, the harness resolves a clean native end without checking for Return (`host.ts`). The exit observer failed only on an error, so the child stayed active until its parent stopped it or the app restarted. With child admission, its attempt and leases were then held that whole time. The exit observer now fails an active child once its provider run ends, however it ended: a run that ends without Return is a failure. Scenario: `completion-admitted-exits-without-return`. |
| `completion-clean-exit-reverted` | violated: shows why the fix is needed | Without the clean-exit check, a child whose provider exits cleanly without Return never settles. |
| `completion-start-failure-reason` | Fixed; now passes | Before the fix: start-failure cleanup retried `fail_graph_completion("provider_start_failed")` every 250 ms, and the graph rejected that reason forever. `provider_start_failed`, `provider_attachment_persist_failed` and `graph_observation_failed` are now canonical failure reasons in `validate_terminal_reason`, so the graph and product rows share one reason. Scenario: `completion-start-failure`. `app_server_failure_reasons_are_canonical` in graph-core covers all three reasons. |
| `completion-start-failure-terminal` | Fixed; now passes | Before the fix: if a stop before launch, or a Return after a lost start acknowledgement, terminated the current first, cleanup retried forever. Cleanup now stops at any terminal current and settles the product with that current's own outcome. It uses the same settlement as the semantic observer (`settle_terminal_recursive_child`). Scenarios: `completion-stop-before-failed-start`, `completion-return-after-lost-start`. |
| `completion-child-admission-reverted` | violated: shows why the fix is needed | Before child admission, a selected child's provider ran with no admitted plan, attempt or held lease. Prime refused to run such a child. This check turns admission off and shows `ProviderRunsUnderLease` breaking. With admission on (`completion-today`), the safety checks include `ProviderRunsUnderLease`, `LeaseReleasedOnlyAfterSettlement` and `AttemptEndsOnlyAfterProvider`. A child's graph current can settle while its provider still runs, so its attempt ends, and its leases are released, only after both. `ClaimedChildSettles` now also requires the lease to be released. A refused admission fails the child with the host's reported category; the fake refuses with `model_unavailable`. Its cleanup skips the cancel, since no run was started: an unreachable host cannot hold a refused child active. Scenarios: `completion-admitted-start-failure`, `completion-admitted-return-after-lost-start`, `completion-admitted-returns-while-provider-runs`. |
| `completion-restart` | passes | Restart reconciliation does not abort on a state the product produced. |
| `completion-fixed-safety` | passes | With every candidate fix, every safety invariant holds. |
| `completion-fixed-liveness` | passes | With every candidate fix, every claimed child settles. |

The candidate fixes are:

1. Long-poll or re-poll the observation instead of timing out.
2. Fail the child when a clean exit leaves its current active.
3. Fail both stores when activation fails.
4. Use valid failure reasons. Landed.
5. Let cleanup settle a current another actor already terminated, with that
   current's own outcome. Landed.

A landed fix is on in `completion-today` as well.

Fix 3 conflicts with the retryable activation path. That path restores the
interaction to `submitted` for a retry, and resetting the execution to
`reserved` is the alternative. Choosing between them is a product decision.

### `HarnessReadiness.tla`

This model covers harness readiness from evaluation to admission:

- **Desktop main:** the readiness coordinator's generations, its
  publication chain, and startup's file-only runtime validation.
- **Stores:** the app server's `product_harnesses` row and, before the fix,
  the readiness copy in `harness-configurations.json`.
- **Restart:** a crash at any point, then the whole next startup.
- **Admission:** Send admits only a route the app server holds ready.

There is one harness configuration, three evaluations, two configuration
digests and one restart.

`readiness-today` mirrors the code, and each `-reverted` check turns one fix
off. Two constants hold the fixes:

- `RustIsReadinessRecord`: Electron publishes readiness only to the app
  server. Startup restores ready only from the app server's own row.
- `RustRejectsOlderGeneration`: the app server rejects a generation lower
  than one it accepted for that harness in the same process.

`RequestCanOutliveClient` lets a readiness request reach the app server after
its client saw an error. Without it, the publication chain alone keeps
results in order.

| Check | Verdict | Finding |
| --- | --- | --- |
| `readiness-restart-restore` | Fixed; now passes | Before the fix (R1): readiness was written to Rust first, then to the JSON catalog. At startup Electron restored ready from the JSON, and Rust rebuilt its row from that JSON without reading its own. A crash or failed write between the two writes restored a ready that Rust had withdrawn, and Send was admitted. Now the JSON carries only whether the runtime files validate. `initialize_model_catalog` restores ready only from its own previous row for the same digest (PROV-006). Regressions: the desktop-shell test "hands startup readiness to the app server record instead of the previous catalog file" fails on the old code; `restart_keeps_the_app_server_record_of_an_unavailable_route` guards the new rule. |
| `readiness-restart-restore-reverted` | violated: shows why the fix is needed | With the JSON catalog as a second record, a crash between the two writes restores the withdrawn ready, and Send is admitted on it. |
| `readiness-single-record` | Fixed; now passes | Before the fix (R2): a failed JSON write left the two records split, with nothing to reconcile them. The JSON readiness write is gone, so there is one record. |
| `readiness-single-record-reverted` | violated: shows why the fix is needed | With two records, a JSON write that fails after the Rust commit splits them. |
| `readiness-never-backwards` | Fixed; now passes | Before the fix (R3): Rust checked only that a generation was positive. The app server now rejects an older generation than one it accepted in the process (PROV-005). Regression: `readiness_rejects_an_older_generation_within_a_process`. A superseded result can still publish until the newer one does. PROV-005 allows that, because it never replaces a newer result. |
| `readiness-never-backwards-reverted` | Plausible: needs a request that outlives its client | Without the guard, a request that reaches Rust after its client gave up replaces a newer result. |
| `readiness-liveness` | passes | The latest evaluation always reaches the app server. |

With the fix on, `PROV006_RestoreOnlyFromRecord` restates the `Restart`
action and `ReadinessRecordsAgree` compares Rust with itself. They guard
against a regression in the model, not in the code. With the fixes on,
`PROV006_AdmitOnlyLatestReady` and `PROV005_NeverOverNewer` also hold almost by
construction; their discriminating power is in the `-reverted` checks. The
model starts with no ready row, so it does not cover the JSON field that
marks a coordinated harness. A row made ready before this fix is cleared once
by migration 0034, which `first_launch_after_upgrade_reverifies_a_route_an_older_build_left_ready`
covers.

The generation guard lives in app-server memory. Electron restarts its
counter with each process, and the desktop quits when the app server stops.
If the app server alone restarted, its restored row would stay the record.
It would accept the coordinator's next generation, and the coordinator's
counter only grows.

## Limits

- **Bounds:** one provider plus one new connection, one renderer, one lease,
  and a single child at depth 1 with head revision at most 3. A bug that needs
  more actors is out of reach.
- **Queue order:** the provider queue is FIFO for queued cancels, but requests
  that queue behind an interior await may start in either order.
- **Not modeled:**
  - the parent retrying a failed stop;
  - label uniqueness and ids;
  - the model catalog refresh queue's own ordering;
  - thread permission pinning;
  - Ladybug index crash recovery;
  - remint races in the graph server;
  - the parent's `/result` long poll;
  - grandchildren.
- **Candidate fixes are modeled, not designed.** A fix still needs a product
  decision wherever the PRD is silent. One example is what the default family
  should become when its managed family is tombstoned.
- **Adapter:** `bound` is attributed to the step that registered the
  listener, not read from the listener itself. `lock`, the program counters,
  and the families are not compared.
- **Review:** an independent adversarial review of model fidelity is not
  certifying. Record its commit, scope and verdict in the PR.
