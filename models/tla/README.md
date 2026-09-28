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
`TLA2TOOLS_JAR`. All checks and scenarios together take about 90 seconds on an idle machine.
`--render` rewrites the scenario traces (see below).

`check:models` is not part of `npm run check` yet. Adding it there requires a
Java runtime in CI and an entry in `scripts/ci/verification-portfolio.v1.json`.

## How expectations work

Each check in `checks.json` expects either `pass` or a named violation. A
known bug is recorded as an expected violation, so the runner stays green
while the bug is open. The runner reads only the models, never the code, so
the models must be kept in step with the code by hand.

`CompletionCurrent` and `ExecutionLeases` have one constant for each
candidate fix:

- `completion-today` and `leases-today` mirror the code as it is.
- `completion-fixed` enables every fix. Every `ExecutionLeases` fix has
  landed, so `leases-today` is also its fixed preset.

Each bug check starts from `completion-today`, switches every other bug's
fix on, and leaves its own constant as the code has it. A violation of that
check can therefore come only from its own mechanism.

`CatalogRefresh` follows the same rule with `catalog-today`, which mirrors
the code. It has one constant per landed fix, and each open bug check keeps
every landed fix on.

A fix PR flips its constant in `completion-today` or `catalog-today`. That
check then passes, so the PR must also flip its expectation to `pass`;
otherwise the runner fails.
A provider fix edits `ProviderSettings.tla` directly and flips its check the
same way. Violated checks run on one TLC worker, so a violated invariant's trace is
the same from run to run. A liveness counterexample may still differ between
runs.

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

`ExecutionLeases` has no scenarios or adapter yet.

## Verdicts

The Verdict column is an independent read of the code for each
counterexample:

- **Confirmed:** the product can reach the trace.
- **Plausible:** reaching it depends on the assumption named in the row.
- **Latent:** the mechanism is real, but the current UI cannot reach it.

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
| `provider-leased-runtime` | Plausible: narrow window | Rust admits a turn while `P` still reads connected in SQLite, and the user then signs out and reconnects. When the harness takes its lease, `acquireExecution` hands out the runtime the pending reconnect registered, because it never checks `pendingConnections`. A failed handoff, a cancel or a terminal check then runs `#cancelPendingConnection`, which closes that runtime under the turn. Since PR 4 the cancel registers a fresh runtime in its place (F4), but the leased one still closes. |
| `provider-remove-during-reconnect` | Fixed; now passes | Before the fix: after sign out, Reconnect, then Remove, the pending reconnect outlived the removal and could still complete. Now `remove()` drops it as the provider enters `removal_pending`, which "immediately blocks new attempts through it" (docs/architecture.md). The runtime stays in `this.runtimes` for turns still draining, and it closes with the tombstone. The PRD is silent here, so this is an architecture-backed decision. Scenario: `provider-remove-during-reconnect`. |
| `provider-attempt-ownership` | Fixed; now passes | Before the fix: `bindConnection` ran only after `connect()`/`reconnect()` (including `login()`) and `openExternal` resolved. It added a `destroyed` listener to contents already destroyed, and that listener never fired. It now cancels the attempt instead. This restores PRD BRW-005. Scenario: `provider-destroyed-before-bind`. |
| `provider-close` | Plausible: depends on shutdown order | `close()` waits for lifecycle tasks but not for the queue, and `acquireExecution` ignores `closing`. A turn admitted before shutdown can create and register a runtime after the maps are cleared. |
| `provider-default-family` | Needs a product decision | A catalog refresh that reports `provider_no_eligible_execution_models` tombstones the provider's managed family even when it is the default family. A later refresh with eligible models reactivates the same family. Disable, delete and removal all refuse to break the default family, but the PRD makes no promise here. |

### `CatalogRefresh.tla`

This model covers the model catalog and the default provider and family:

- **Desktop main:** the per-provider catalog refresh queue
  (`model-catalog-service.mjs`). Before PR 4 a refresh captured its adapter
  when it was requested; now it resolves the adapter and the connection
  generation when it runs. The model also covers the pre-inference join,
  `close()`, the unavailable stub's explicit recovery, and logout, reconnect,
  remove and connect at the points where they meet that queue.
- **SQLite catalog:** a publish reactivates or tombstones the provider's
  managed family and reconciles an unset or managed default. With the
  generation, it first refuses a result from an older connection generation.
  It also covers the user's default provider and family choices and the
  removal guard.

There are two providers: the existing managed provider `P`, and `Q`, which
starts absent and may connect. The families are their managed families `mP`
and `mQ`, and one custom family `C` with members from both. Each check
shrinks the bounds in `catalog-today`. On an idle machine the two slowest,
the default-provider checks, take about 10 and 20 seconds.

`catalog-today` has four fix constants, all landed:

- `DefaultProviderPairsFamily`: choosing a default provider also selects that
  provider's enabled managed family, in the same transaction. A provider
  without one is refused, and the defaults stay unchanged (PROV-008).
- `ConnectionGeneration`: each provider row carries a connection generation.
  Logout, reconnect completion and removal advance it in their own
  transaction. A refresh resolves its adapter and generation when it starts.
  Rust refuses a publish from an older generation inside its write
  transaction. Logout commits its signed-out state itself and no longer waits
  for its refresh inside the provider queue (PROV-002).
- `ReconnectKeepsAdapter`: a cancelled or failed reconnect leaves the active
  provider a catalog adapter. Recovery refuses while a reconnect is pending,
  so it never discovers through that reconnect's runtime (F4, L1).
- `AdapterAfterCommit`: connect registers the catalog adapter only after the
  definition commits (PROV-007).

Each `-reverted` check turns one constant off and keeps the others on, so its
violation comes only from its own mechanism.

| Check | Verdict | Finding |
| --- | --- | --- |
| `catalog-refresh-keeps-chosen-default` | Fixed; now passes | Before the fix, the Settings default-provider selector saved only `providerId`. Rust stored that provider with the old provider's managed family. The next catalog publish for the old provider matched "the default family is my managed family" and moved the default provider back. The pairing leaves nothing for a refresh to revert. The check also proves `DefaultIsPaired` and `RefreshKeepsOtherDefault`. Regression test: `catalog_refresh_keeps_the_chosen_default_provider_and_its_managed_family` in `model_catalog_flow.rs`. |
| `catalog-refresh-keeps-default-chosen-from-unset` | passes | Starts with no default family. A refresh may fill it, with its provider, which PROV-008 allows. Once the user chooses a provider and family, no refresh changes them. With the fix off, the same bounds violate `RefreshKeepsUserDefault` through the same trace as `catalog-chosen-default-reverted`. |
| `catalog-chosen-default-reverted` | violated: shows why the fix is needed | With `DefaultProviderPairsFamily` off, `Q` connects, the user chooses `Q`, and a refresh of `P` moves the default provider back to `P`. |
| `catalog-stale-refresh-after-reconnect` | Fixed; now passes | Before the fix, a refresh discovered "disconnected" after sign-out, then stalled. The user reconnected, which published connected directly. The stalled refresh then published its disconnected result, and nothing queued behind it corrected that (CR-V1, plausible: needs a stall). Now that result carries the older generation and has no effect. The check also proves `NoStaleEffect`. Regression tests: `drops a refresh that discovered before a reconnect completed` in `provider-connection-generation.test.mjs`, and `a_catalog_result_from_a_superseded_connection_generation_has_no_effect` in `model_catalog_flow.rs`. |
| `catalog-stale-refresh-after-reconnect-reverted` | violated: shows why the fix is needed | With `ConnectionGeneration` off, the stalled result publishes over the reconnect. |
| `catalog-old-account-repopulates` | Fixed; now passes | Before the fix, a refresh discovered eligible models. A reconnect to an account with zero eligible models then tombstoned the managed family. The older eligible result published afterwards and reactivated it (CR-V3, plausible: an old `model/list` outlasts a full login). Now it carries the older generation. Regression test: the same Rust flow test. |
| `catalog-old-account-repopulates-reverted` | violated: shows why the fix is needed | With `ConnectionGeneration` off, the older eligible result reactivates the family. |
| `catalog-stale-adapter-capture` | Fixed; now passes | Before the fix, a refresh captured the unavailable stub when it was requested, and the stub answered "could not be activated". A reconnect or recovery then registered the real runtime and published connected. The stub's result then published over it (F3/V2, confirmed). A refresh now resolves its adapter when it runs. Regression test: `keeps a recovered provider connected when a refresh requested during recovery runs after it`. |
| `catalog-stale-adapter-capture-reverted` | violated: shows why the fix is needed | With `ConnectionGeneration` off, the captured stub contradicts the reconnect. |
| `catalog-stub-recovery-logout-deadlock` | Fixed; now passes | Before the fix, an explicit refresh through the stub waited for the provider queue. Logout held that queue while it waited for its own refresh, queued behind the explicit one. Neither returned (CR-V7, latent: the UI hides Sign out while the stub is registered). Logout now commits its signed-out state with the next generation and does not wait for the refresh. Regression test: `signs out while an explicit recovery is queued behind another refresh`. |
| `catalog-stub-recovery-logout-deadlock-reverted` | violated: shows why the fix is needed | With `ConnectionGeneration` off, logout never returns. |
| `catalog-no-restore-after-cancelled-reconnect` | Fixed; now passes | Before the fix, a cancelled reconnect unregistered the catalog adapter while the provider stayed active. A tombstoned default family then never restored, because no refresh could run (V8, F4, confirmed). Recovery could also discover through the pending reconnect's runtime (L1). The check proves `ActiveProviderHasAdapter`, including when the fresh runtime cannot start and the recovery adapter stands in, and `DefaultRestores`. Regression tests: `keeps a catalog adapter for an active provider whose reconnect is cancelled`, `falls back to the recovery adapter when a cancelled reconnect cannot restart the runtime`, and `does not recover through the runtime of a pending reconnect`. |
| `catalog-no-restore-after-cancelled-reconnect-reverted` | violated: shows why the fix is needed | With `ReconnectKeepsAdapter` off, a cancelled reconnect leaves the active provider with no adapter. |
| `catalog-connect-adapter-after-commit` | Fixed; now passes | Checks `AdapterOnlyForDefinition`. Before the fix, connect registered the catalog adapter before the definition committed, so a refresh could run for a provider that did not exist (F1). Regression test: `publishes nothing and registers no adapter before the definition exists, and a refused create leaves nothing`. |
| `catalog-connect-adapter-after-commit-reverted` | violated: shows why the fix is needed | With `AdapterAfterCommit` off, the adapter exists before the definition. |
| `catalog-own-family` | passes | A catalog publish changes only its own provider's managed family and never the custom family. |
| `catalog-tombstoned-default-blocks-send` | passes | A default family tombstoned by a zero-eligible publish stays the default and blocks Send. |
| `catalog-default-restores` | passes | With the real adapter registered, a tombstoned default family restores once its provider is healthy again. |

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
| `completion-child-admission-reverted` | violated: shows why the fix is needed | Before child admission, a selected child's provider ran with no admitted plan, attempt or held lease. Prime refused to run such a child. This check turns admission off and shows `ProviderRunsUnderLease` breaking. With admission on (`completion-today`), the safety checks include `ProviderRunsUnderLease`, `LeaseReleasedOnlyAfterSettlement`, `AccessReleasedOnlyAfterProviderRun` and `AttemptEndsOnlyAfterProvider`. A child's graph current can settle while its provider still runs, so its attempt ends only after both. The model separates the attempt's durable lease record (`lease`, which the adapter reads) from the host's provider access (`access`). The host releases the access as soon as the provider run ends (`HostAccessRelease`), without waiting for the attempt. The record is released only after the attempt ends, when Rust's release finds nothing left to free. `ClaimedChildSettles` requires both to be released. A refused admission fails the child with the host's reported category; the fake refuses with `model_unavailable`. Its cleanup skips the cancel, since no run was started: an unreachable host cannot hold a refused child active. Scenarios: `completion-admitted-start-failure`, `completion-admitted-return-after-lost-start`, `completion-admitted-returns-while-provider-runs`. |
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

The committed scenarios do not step `HostAccessRelease`, since the adapter
has no such step. In their traces the access stays held until
`LeaseReconcile`, which the model also allows.

### `ExecutionLeases.tla`

This model covers provider execution leases from admission to release:

- **Rust:** the interaction execution task, from admission through the
  attempt, `/complete`, terminal persistence and the inline release; the one
  lease-debt reconciler; startup reconciliation after a restart.
- **Harness host:** the pending access entry (admitted, claimed, settled,
  released), its release timers, the owner's release and acknowledgement,
  and close.
- **Desktop main:** the provider lease count, the lease's acknowledgement,
  removal and its finalize, the runtime, and `close()`.
- **User:** Stop, removal, reading a quarantined interaction, quit and
  restart.

There is one provider `P`. Each turn has one attempt, one lease and its own
thread. Most checks use one turn and at most one restart; `leases-safety`
and `leases-ideal` use two turns.

Fault constants turn on the conditions the findings need:
`AdmissionTimeout`, `RustCanAbandon`, `PersistCanFail`, `StartupQuarantine`,
`StartupCleanupCanFail` and `HarnessCanHang`. `UserCanStop` lets the user
Stop a turn while Rust still waits on it (`Cancel`); unlike `GiveUp`, Rust
then waits for the turn's end. Each fix has its own constant; finding G's is
`ForceStopsCancelledTurn`.

An attempt has four states: `none`, `running`, `ended` and `terminal`.
`ended` is an undecided attempt that Relayer no longer waits on
(`native_wait_ended_at`). It keeps its outcome open for reconciliation, but
the removal drain skips it and its lease is debt. Live native work is still
guarded by the held lease (`jsHeld`), which the host releases only when the
turn settles, or when a cancelled turn is force-stopped (`ForceStop`).

| Check | Verdict | Finding |
| --- | --- | --- |
| `leases-safety` | passes | With every fault on, a leased runtime stays open, a turn runs only under held access, access is never released while its turn runs (`AccessKeptWhileTurnRuns`), only a cancelled turn is ever force-stopped (`OnlyCancelledTurnsForceStopped`), and the app always starts. |
| `leases-ideal` | passes | With no faults, every lease is released, every lease debt is reconciled, every attempt whose turn ended stops holding the provider, and a removal completes without a restart. |
| `leases-abandon` | Fixed; now passes | Finding B. Before the fix: after Rust gave up on a running turn, its lease release freed the access while the native turn still ran. Removal could then close the runtime and delete its home under it. Now access lives as long as the native turn. An owner's release of a running turn cancels the turn and returns at once. The host releases the access as soon as the native turn ends, and keeps the entry until the owner's release (`HostReleasesOnSettle`). `leases-abandon-reverted` shows the old trace. |
| `leases-timer-claim` | Fixed; now passes | Finding A, plausible: needs a 30 s stall. Before the fix: the admission timer's release could be in flight when the claim ran, and it then freed the access under the running turn. Once any release is decided for an admission, the claim refuses it, even if that release failed (`ClaimRejectsReleasing`). `leases-timer-claim-reverted` shows the old trace. `leases-claim-after-failed-release` covers a failed release. It turns A2's fix off, because a refused finalize is the only way the model has for a release to fail. |
| `leases-removal-finalize` | Fixed; now passes | Finding A2. The host releases the last lease when the native turn ends, before Rust ends the attempt, so the store refuses the removal finalize. The refusal now leaves `P` `removal_pending` instead of throwing. The owner's release, which Rust sends only once the attempt is terminal, acknowledges the lease, and the acknowledgement retries the finalize (`AckRetriesFinalize`). `leases-removal-finalize-reverted` shows removal waiting for a restart without it. |
| `leases-view-debt` | Fixed; now passes | Finding D. Before the fix: settling a quarantined attempt (from the thread view or an invoke action's destination) made lease debt but did not wake the reconciler. The debt then waited for a restart. The settle now wakes it (`QuarantineSettleWakesReconciler`). `leases-view-debt-reverted` shows the old trace with C's fix off, because C now releases the lease before the settle. |
| `leases-persist-lease` | Fixed; now passes | Finding C, lease half. Before the fix: when a turn's terminal state could not be persisted, nothing released its lease. The host now releases it when the native turn ends. `leases-persist-lease-reverted` shows the old trace with C's attempt fix off, because that fix also releases the lease. |
| `leases-restart-quarantine`, `leases-restart-persist` | Fixed; now pass | Finding E, startup half. A removal waited on a running attempt, and the user quit. At the next start, an interrupted submitted input was quarantined, or a failed persist had left it quarantined, so its attempt stayed `running`. `reconcileStartup`'s refused finalize then failed every start. A refused finalize now leaves `P` `removal_pending`, and the app starts. `leases-restart-quarantine-reverted` shows the old trace with E's removal fix off, because that fix stops the refusal. |
| `leases-restart-drained-removal` | Fixed; now passes | Finding E, retry half. After that restart, once the quarantined attempt becomes terminal, the reconciler's release finds no host entry, because host memory is fresh. A release for a lease the host no longer tracks retries every drained removal (`UnknownReleaseRetriesFinalize`), so the removal finishes without another restart. The same path covers access the host forgot ten minutes after releasing it. The check turns E's restart fix off, because with it startup's own finalize succeeds and the retry is never needed. `leases-forgotten-release-reverted` shows removal waiting for a restart without the retry. |
| `leases-restart-removal` | Fixed; now passes | Finding E, removal half. Before the fix: after that restart, the quarantined attempt stayed `running` until its thread was opened or the app restarted again. Opening the thread is a user action, so the removal could stay pending meanwhile. Startup now records the end of the wait on the attempts it leaves open for reconciliation, since their process exited with the app (`RestartEndsWaits`). The drain skips them, so startup's finalize succeeds. `leases-restart-removal-reverted` shows the old trace. |
| `leases-persist-attempt`, `leases-persist-removal` | Fixed; now pass | Finding C, attempt half. Before the fix: when a turn's terminal state could not be persisted, its attempt stayed `running`, which blocked the provider tombstone until a restart. A harness approval that is aborted, expired or cancelled reached this with no fault (`Persist` with `q = "decided"`). The execution task now ends its wait on any attempt it leaves running and releases its lease (`PersistFailureEndsWait`). An attempt whose interaction already failed or stopped ends with that outcome; a quarantined one stays undecided. The owner's release acknowledges the access, which retries the finalize. `leases-persist-attempt-reverted` and `leases-persist-removal-reverted` show the old traces. |
| `leases-persist-attempt-forced` | passes | `AttemptEndsAfterTurn` also holds for a force-stopped turn. Rust gives up on the turn, or the user stops it, and it ignores the cancellation, so `ForceStop` ends it. The attempt then ends even when its terminal state cannot be persisted. The other `AttemptEndsAfterTurn` checks never cancel a turn. The check is not vacuous: a force-stopped turn with a running attempt and the app up is reachable, through both `GiveUp` and `Cancel`. `leases-persist-attempt-forced-reverted` turns `PersistFailureEndsWait` off, and the property fails through `Cancel`, `ForceStop` and a failed persist. |
| `leases-startup-isolation` | Fixed; now passes | Finding L6. Before the fix: a removal or cleanup failure other than a drain refusal rejected `reconcileStartup`, so Relayer could not start. Startup now records each provider's failure and continues (`StartupIsolatesProviders`). `leases-startup-isolation-reverted` shows the old trace. The model has one provider, so "other providers still activate" is covered by the composition test, not the model. |
| `leases-hang` | Fixed for Codex and Prime; now passes | Finding G. Before the fix: a cancelled native turn that ignored the cancellation kept its provider access forever, so removal waited forever. Now a cancelled turn still running after two minutes is force-stopped, and its access is then released (`ForceStopsCancelledTurn`, action `ForceStop`). The turn is cancelled by Rust giving up (`GiveUp`) or by the user's Stop (`Cancel`). After a Stop, Rust still waits, so the force-stop is what hands Rust its result. The force-stop ends only that turn. The model assumes every harness supports it and that it always ends the native work. In the code the kill or disposal is best effort, and the host releases the access at most ten seconds later, so `AccessKeptWhileTurnRuns` holds only under that assumption. `claude.basic` has no force-stop, so its turn that never settles still keeps its access. `OnlyCancelledTurnsForceStopped` follows from the action's guard; it documents the promise rather than testing the sibling case. `leases-hang-reverted` shows the old trace. |

The fixes are:

1. The host releases access when the native turn ends, and an owner's
   release of a running turn cancels it (`HostReleasesOnSettle`). Landed.
2. The claim refuses an admission once a release was decided
   (`ClaimRejectsReleasing`). Landed.
3. A refused finalize leaves the provider `removal_pending`, and the owner's
   acknowledgement retries it (`AckRetriesFinalize`). Landed.
4. Settling a quarantined attempt wakes the reconciler
   (`QuarantineSettleWakesReconciler`). Landed.
5. A release for a lease the host no longer tracks retries every drained
   removal (`UnknownReleaseRetriesFinalize`). Landed.
6. An execution task that stops waiting on a native run without persisting
   its outcome ends the attempt with a decided interaction outcome, or records
   the end of the wait, and releases the lease (`PersistFailureEndsWait`).
   Landed.
7. Startup records the end of the wait on attempts it leaves open for
   reconciliation (`RestartEndsWaits`). Landed.
8. Startup isolates each provider's removal and cleanup failure
   (`StartupIsolatesProviders`). Landed.
9. A cancelled turn still running after two minutes is force-stopped, and
   its access is released (`ForceStopsCancelledTurn`). Landed.

The `*-reverted` checks turn one landed fix off and show its old trace. In
them the acknowledgement call is attributed to `AckRetriesFinalize`, so a
reverted `HostReleasesOnSettle` still acknowledges. A reverted check turns
off any other fix that would hide its trace, and says so in its finding.
Recursive children unwinding across a restart are modeled in
`CompletionCurrent`, not here. Neither model orders startup's one observation
of those children before Desktop's startup removal; the product persistence
and completion trace tests cover that ordering.
A release and its acknowledgement are one step, and acknowledgements do not
fail in the model, so the host's retry of a failed acknowledgement is not
modeled. The ten-minute forget of access released without an owner is
modeled (`ForgetReleased`).

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

### `ReadinessRepair.tla`

This model covers readiness across Repair, restart and upgrade for two
providers that share one harness. ChatGPT and OpenRouter both run through
`codex-basic`. It adds three things to `HarnessReadiness`:

- **Two runtime predicates:** `files` is what startup's cheap validation
  checks, and `execs` is what the version probe checks. External damage
  can break either one.
- **Upgrades:** a restart may change the configuration digest, or leave the
  runtime on an older recipe.
- **The automatic evaluation:** the app server's upgrade mark, Desktop's one
  background evaluation, and the commit that clears the mark.

`readiness-repair-today` mirrors the code, and each `-reverted` check turns
one fix off. Two constants hold the fixes:

- `RepairRevalidates` (R1): Repair, app-update staging and post-update
  activation reuse an installation only when it passes startup's full
  validation, then the probe. Otherwise they reinstall.
- `UpgradeEvaluates` (#556): an upgrade that changes the digest marks the
  route due in the app server. After startup, Desktop runs one background
  evaluation through the `recipe-update` trigger. The next committed result
  clears the mark.

| Check | Verdict | Finding |
| --- | --- | --- |
| `repair-validated` | Fixed; now passes | Before the fix (R1): reuse checked only that the entrypoints were regular files and that the probe passed, and `stat` follows symlinks. Startup also checks the ownership marker, the owned private state and entrypoint confinement. So Repair published ready for an installation the next start rejected. Regressions: the installer tests "repairs an installation startup rejects because …", "stages a fresh app-update generation when the active one is unusable because …" and "does not activate a pending generation startup would reject because …" fail on the old code. |
| `repair-validated-reverted` | Confirmed | With the probe alone, a Repair after the layout broke publishes ready for an installation startup rejects. |
| `repair-survives-restart` | Fixed; now passes | A route an evaluation made ready survives a restart that changes nothing. |
| `repair-survives-restart-reverted` | Confirmed | Before the fix, the next unchanged restart withdrew the ready that Repair had published, so Repair never stuck. |
| `repair-records` | passes | With both fixes, startup restores only from the app server's record (PROV-006), and the latest evaluation wins (PROV-005). A route marked due is never ready, across two restarts. Leaving the mark set after a publish breaks this check. |
| `repair-records-prerule` | passes | The same holds from a row an older build left ready. |
| `upgrade-evaluated` | Fixed; now passes | Before the fix (#556): a changed digest left both providers pending until someone pressed Repair. Now each changed digest gets one committed evaluation without a Repair, even across a restart before the commit. The model assumes a connected provider publishes a route; without one, the mark waits. Regressions: `an_upgraded_digest_is_due_one_automatic_evaluation`, `one_post_upgrade_evaluation_restores_both_providers_sharing_a_route`, the migration test `the_update_migration_marks_routes_an_earlier_upgrade_left_pending`, and the provider-composition test "evaluates an upgraded shared route once after startup". |
| `upgrade-evaluated-reverted` | Confirmed | Without the automatic evaluation, the upgraded route stays pending while nobody presses Repair. |
| `repair-liveness` | passes | Every started evaluation, automatic or not, settles. |
| `shared-route-witness` | Witness, expected violation | Readiness is per harness, so an evaluation not started for a provider makes that provider's shared route ready too. This is why one Repair restored both providers in #556. |

The model checks the digest trigger only. A newly activated recipe also
starts the automatic evaluation, but that trigger lives in Desktop memory,
so the model leaves it out. A quit before its result commits loses it; the
next start then restores the old ready record, because the digest did not
change. Migration 0039 also marks every loaded route startup left pending.
The model starts after that migration, so it does not cover the backfill.
The automatic evaluation skips a harness whose runtime was never
installed; the model has one harness whose runtime starts installed.
In the code it runs once per process with the models published so far,
and a recipe change the update did not stage marks nothing. The installer test "stages and activates the
exact incoming recipe" covers which activations count. A mark stays set
when its evaluation found no provider with a route. The next start looks
again, but it prepares nothing until a provider has a route.

## Limits

- **Bounds:** one provider plus one new connection, one renderer, one lease,
  and a single child at depth 1 with head revision at most 3. The lease model
  has one provider, at most two turns and two restarts, and one turn per
  thread, so it cannot show that a force-stop spares a sibling turn on the
  same thread; the harness-host, Codex and Prime tests cover that.
  `CatalogRefresh` has two providers, two queued refreshes per provider, and
  at most two lifecycle events. A bug that needs more actors is out of reach.
- **Connection generation:** removing the generation check from `Publish`
  makes `catalog-stale-refresh-after-reconnect`, `catalog-old-account-repopulates`
  and `catalog-stale-adapter-capture` fail, so their passes are not vacuous.
  A logout whose signed-out publish fails advances nothing and supersedes
  nothing. A cancelled reconnect whose fresh runtime fails to start swaps the
  adapter for the stub within one generation; a real result already in
  flight may still publish, which PROV-002 allows because the account and
  generation are unchanged. No check covers restoring through the recovery
  adapter: that needs an explicit refresh, a user action the model does not
  make fair. `CatalogRefresh` checks the generation once, at publish. The code checks twice: the catalog service before it publishes,
  and Rust inside the write transaction. The model's single check stands for
  both. A lifecycle write whose response is lost is not modeled; a JS test
  covers the refresh that relearns the generation. The ad hoc
  `ProviderConnect` model, which covers a crash between the create's commit
  and its reply (F2), is not promoted; a JS test covers F2.
- **Catalog abstractions:** `CatalogRefresh` has no harness. A family is
  resolvable when it is enabled and has a connected member with available
  models. That stands for "some harness can run it": the model leaves out
  the default harness that a provider choice moves along with the family.
  `RefreshKeepsUserDefault` counts only a provider and family chosen
  together. A default with no family is not one: a harness-only save also
  sets `defaults_modified`, and every provider or family save now sets a
  family. `RefreshKeepsOtherDefault` is checked only from a set default
  family, because filling an unset family may also set its provider. Legacy
  system families without a managed provider are not modeled; a service test
  covers them.
- **Queue order:** the provider queue is FIFO for queued cancels, but requests
  that queue behind an interior await may start in either order.
- **Not modeled:**
  - the parent retrying a failed stop;
  - label uniqueness and ids;
  - thread permission pinning;
  - Ladybug index crash recovery;
  - remint races in the graph server;
  - the parent's `/result` long poll;
  - grandchildren;
  - several turns on one harness session or thread;
  - in the lease model, a user's Stop before the native turn starts;
  - store errors other than a refused drain in the provider service, and
    acknowledgement failures.
- **Candidate fixes are modeled, not designed.** A fix still needs a product
  decision wherever the PRD is silent. One example is what the default family
  should become when its managed family is tombstoned.
- **Adapter:** `bound` is attributed to the step that registered the
  listener, not read from the listener itself. `lock`, the program counters,
  and the families are not compared.
- **Review:** an independent adversarial review of model fidelity is not
  certifying. Record its commit, scope and verdict in the PR.
