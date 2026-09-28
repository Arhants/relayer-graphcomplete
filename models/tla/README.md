# TLA+ models

These models find bugs in the parts of Relayer with the most concurrent
state: provider connections, the completion current, and the Product
workspace's follow-up composer, node inspector, and node-authored inputs. The method is model,
counterexample, reproduce, fix:

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
`TLA2TOOLS_JAR`. All checks and scenarios together take about a minute.
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

For `TurnComposer` and `NodeInspector`, the adapters render the real
Product workspace (`createProductWorkspace`) in happy-dom:

- [`test/support/turn-composer-trace-adapter.mjs`](../../test/support/turn-composer-trace-adapter.mjs)
  types into `#threadPrompt`, clicks Send, and switches threads by calling
  `render()`, as `renderThread()` does. A fake `threads.submitInteraction`
  holds the POST, the refresh that loads the new turn, and the await before
  settlement on deferreds. `observe()` reads the prompt's value and disabled
  state and the drafts persisted in `composer-drafts`.
- [`test/support/node-inspector-trace-adapter.mjs`](../../test/support/node-inspector-trace-adapter.mjs)
  clicks graph nodes, `+`, `×`, and Close, and types in the annotation
  editor, with the real node context draft controller. Every draft save and
  discard request and every Node Detail asset is held on a deferred, and the
  controller's 350 ms autosave runs on fake timers. `observe()` reads the
  selection, the inspector, its header, the Node Detail host and whether its
  page is shown, and the annotation dock.

- [`test/support/authored-input-send-trace-adapter.mjs`](../../test/support/authored-input-send-trace-adapter.mjs)
  types into an authored Node Detail input, commits it with `change`, and
  clicks Send, with the real input draft controller. A fake app server
  applies the commit and reservation rules of the SQLite storage it cites;
  the replay checks what the renderer decides: whether Send is enabled and
  which draft revision each request carries.

A scenario may list `violatedAtEnd`: promises of an open bug. The replay must
match the model at every step, and those promises must hold until the final
step and break at it. This records the bug on the real code while the suite
stays green. A fix removes them from `violatedAtEnd`, and the replay then
requires them to hold. Deleting the guard a scenario depends on makes its
replay diverge at the step the guard governs.

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

### `TurnComposer.tla`

This model covers the follow-up composer across two threads:

- typing, which persists the draft under the active scope `thread:latest turn`;
- Send, the follow-up POST, the server recording the turn before it answers,
  and its `interaction_in_progress` rule;
- the refresh that loads the new turn, or skips it when the navigation entry
  `[thread, turn, layer path]` changed or the refresh failed;
- settlement of the submitted draft and its revision comparison;
- thread switches, which load the thread's state, and `renderThread()` for
  unrelated reasons (the environment refresh every 5 s and on window focus,
  which does not fetch `/api/state`);
- the new turn arriving by polling, and finishing;
- a Send that waits for an authored input commit before it posts, and ends
  there without posting when the answer does not save or the thread changes;
- a turn created elsewhere in the thread, such as by an authored invoke;
- a POST that fails with a network or server error, before or after the
  server recorded the turn.

Context annotations, restored retry drafts, the model picker, and the
unconfirmed-draft warning are not modeled. `composer-today` leaves out turns
created elsewhere to keep the per-promise checks fast; `composer-fixed` and
`composer-invoked-turns` include them.

| Check | Verdict | Finding |
| --- | --- | --- |
| `composer-typing-during-send` | Fixed; now passes | Before the fix (#512): `submitInteraction` disables the prompt, but any `renderThread()` during the POST re-enables it through `renderInteractionState`, because the loaded latest turn still reads as settled; the environment refresh renders every 5 s on project threads and on window focus. Text typed then stayed in the old turn's draft scope, and when the new turn loaded the composer moved to that turn's empty scope, so the text was never shown again. Entering a newer turn's empty scope now moves the thread's unsent text written this session into it (settlement deletes a sent draft, so what remains is unsent; persisted text from earlier sessions is not moved), and a send definitely rejected after its turn arrived restores its text. A user's persisted draft also wins over a restored retry that arrives in its scope, so the prompt no longer flips between them. Scenarios: `composer-typing-during-send`, `composer-failed-send-restores-draft`. |
| `composer-typing-during-send-without-renders` | Fixed; now passes | The same loss, reached by leaving the thread and returning during the POST before the server records the turn. Scenario: `composer-return-during-send`. |
| `composer-without-carry` | Records the bug | With `CarryUnsentDraft` off, text typed during a send is stranded. |
| `composer-settlement-erases-edit` | Fixed; now passes | Before the fix (#513): re-entering a scope with persisted text assigned `currentPromptRevision + 1`, which could repeat a revision the scope already had. An edit after Send could then reach the submitted revision, and settlement cleared the prompt and deleted the persisted draft. A scope's revision now only moves forward. Scenario: `composer-settlement-erases-edit`. |
| `composer-sent-text-lingers` | Fixed; now passes | Before the fix (#513): re-entering a scope during a send bumped its revision though the text was unchanged, so settlement no longer recognized the sent text and left it in an enabled composer. Unchanged text now keeps its revision. Scenario: `composer-sent-text-lingers`. |
| `composer-one-send-per-thread` | passes | One follow-up per thread is in flight at a time, and every send releases its thread's Send button. |
| `composer-invoked-turns` | Fixed; now passes | Before the fix (review of #512): the submission was held only once `submitInteraction` began, after Send had waited for authored input commits. A turn created elsewhere that arrived during the wait carried the text into its scope, and the Send then posted it and cleared only the older scope, so the sent text stayed. The submission is now held from the click. A Send that ends without posting hands back text a newer turn left in its scope into the empty prompt, as a rejected POST does; text typed since wins. One thread, three turns. Regression tests: the "newer turn arriving while Send waits" cases in `test/authored-input-send-traces.test.mjs`, since only that world holds a Send on an authored commit. The draft-send warning, which the model leaves out, also holds the text while open and hands it back when cancelled; a test in the same file covers it. |
| `composer-without-click-hold` | Records the bug | With `HoldFromClick` off, the text is carried away while Send waits. |
| `composer-without-uncertain-hold` | Records the bug | With `HoldUncertain` off, the text of a POST that failed after the server recorded it is carried into the turn it created, and could be sent again (SCP-019). The renderer recognizes that turn by the text: any draft whose text a later turn of the thread carries was sent, which also holds after a restart. An unrelated turn, or a POST that never reached the server, still carries the text forward. A retry refused after the turn arrived does not hand the text back. Scenarios: `composer-uncertain-send-stays-put`, `composer-retry-of-landed-send`. |
| `composer-fixed` | passes | With every candidate fix, every composer promise holds. |

The candidate fixes are:

1. `CarryUnsentDraft`: moving a turn's unsent text into the newest turn's
   empty scope, and restoring it into the prompt when a send fails after the
   new turn arrived. Text still owned by an in-flight send is not moved.
   Landed (#512).
2. `StableScopeRevision`: re-entering a scope keeps its revision when its
   text is unchanged, and otherwise takes a revision above any it had.
   Landed (#513).
3. `HoldFromClick`: holding the submission from the click on Send, and
   handing back stranded text when that Send ends without posting. Landed
   in review of #512.
4. `HoldUncertain`: after a network or server error, holding the
   submission once a turn with its text arrives, so its text is neither
   carried into that turn nor handed back. Landed in review of #512.

`SentTextIsNotShownAgain` allows the text of a send that may have been sent
to stay in the prompt of the scope it was sent from, where the user sees it
until its turn arrives. `UnsentDraftSurvives` drops its promise for such text
only when a newer turn already arrived before the error; SCP-019 then does
not restore it. Stranded text is restored only into an empty prompt: text the user typed
since wins (a decision recorded in the PRD).

The model does not restart the app. After a restart, text an earlier session
left in an older turn's scope, such as one closed while a send was in
flight, is carried into the newest turn unless a later turn with that text
shows it was sent, and text restored after a restart is not carried into
a turn with that text that arrives later. Tests in
`test/turn-composer-traces.test.mjs` cover these cases.

`CarryUnsentDraft` recognizes the in-flight submission by its revision, so
it is sound only together with `StableScopeRevision`.

Every fix has landed, so `composer-today` and `composer-fixed` now agree.
Keeping per-turn draft scopes and carrying unsent text forward is the recorded
product decision (PRD SCP-018 to SCP-020).

### `NodeInspector.tla`

This model covers node selection on the graph canvas and the Node Details
inspector with a durable annotation draft:

- `selectNode`, including the draft flush before switching nodes and the
  asynchronous Node Detail mount;
- `prepareNodeContextSelectionChange` before Close and before a turn change;
- `+`, typing, autosave, and `×` on an annotation draft;
- `render()` with newer state, which re-selects the node or, on entering a
  new view, may clear the selection;
- the dock reconciliation in `renderNodeContextDock`;
- reuse or disposal of the mounted Node Detail runtime.

A draft's target includes the layer it was made in, so drafts and editors
belong to a view: entering a new view drops the editor, and a draft is
reopened only in its own view. `nodeSelectionSequence` is compared only for equality, so each request in
flight carries whether it is still the latest. Historical context
selections, node inputs, annotation comments, and confirm are not modeled;
confirm resolves like discard.

| Check | Verdict | Finding |
| --- | --- | --- |
| `inspector-promises` | Fixed; now passes | Before the fixes: (#514) while a draft save, confirm, or discard was in flight, `selectNode` returned at once and `prepareNodeContextSelectionChange` returned false, so a node click, Close, or turn change did nothing; a dropped Close or turn change also incremented `nodeSelectionSequence`, cancelling a pending click or the first Close, so a double-clicked Close closed nothing. (#515) A switch refused by a failed flush returned without re-rendering the kept node; if the switch had superseded that node's own Node Detail mount, the inspector showed its header over a disposed, empty page. A render during the flush was dropped, so the inspector kept older state or, on entering a new view, stayed hidden. Now such a request waits for the draft to resolve and the latest one proceeds; a click made in a view the user has since left is void; a prepare whose editor was replaced prepares again. A switch continues from the latest state, and a resolved draft re-renders the selection unless a waiting request or the switch will. Selecting a node with an unconfirmed draft still reopens its editor (PRD L2203). Scenarios: `inspector-click-during-discard`, `inspector-close-during-flush`, `inspector-double-close`, `inspector-refused-switch-rerenders`, `inspector-view-change-during-discard`. |
| `inspector-without-supersede` | Records the bug | With `LatestRequestSupersedes` off, a switch waiting on a draft save commits its node, reporting it through `onSelectionChange` and recording it in history, before a click queued meanwhile replaces it. Before the fix (review of #514), a queued click did not advance `nodeSelectionSequence`, and a request that proceeded at once did not void one still waiting, so a waiting Close could run after a newer click. `OnlyLatestRequestSelects` is checked on the real workspace through the nodes it reports. Scenarios: `inspector-click-during-switch`, `inspector-click-voids-waiting-close`. The same rule for a Close or turn change that proceeds at once has no replay, because the adapter does not change turns. |
| `inspector-without-queue` | Records the bug | With `QueueWhileResolving` off, input made while a draft resolves is dropped. |
| `inspector-without-refresh` | Records the bug | With `RefreshAfterResolve` off, a refused switch can leave the kept node's detail disposed. |

The candidate fixes are:

1. `QueueWhileResolving`: a click, Close, or turn change that arrives while
   a draft resolves waits for it, and the latest one then proceeds against
   the state it finds; a click whose node is gone does nothing. A prepare
   whose editor was replaced prepares again. Landed (#514).
2. `RefreshAfterResolve`: continuing a switch from the latest state, and
   re-rendering the selection once a draft resolves unless a waiting request
   or the switch will. Landed (#515).
3. `LatestRequestSupersedes`: a user's newest request supersedes every
   earlier one, whether it waits for a resolving draft or proceeds at once.
   Landed in review of #514.

The replay reads which state revision the inspector shows: each refresh
delivers a new state object whose node kinds name the revision, and the
header's kind is compared with the model's `title.rev` at every step, so
`InspectorIsCurrent` is checked on the real inspector. The desktop host
mutates one `appState` in place, so a stale state would not show there
today; the replay would still catch code that continues from a stale state.
Scenario: `inspector-switch-sees-refresh`.

The model has one thread. Switching threads voids a request still waiting
for a draft, so a turn change queued in one thread cannot act on the next;
a test in `test/node-inspector-traces.test.mjs` covers it. After each step
the replay waits for in-flight `crypto.subtle` digests and a steady
inspector, since a Node Detail mount verifies its package off the event
loop.

The replay also showed the dock keeps the previous node's locked editor
until the new node's Node Detail mount finishes. The replay compares the
dock only once the renderer is quiet.

The model reuses the mounted runtime when the node matches; the code also
requires the same interaction, layer, and package, which differs only on
entering a new view. Discard is modeled only for a saved draft with no newer
text. Other callers of `prepareNodeContextSelectionChange` (sidebar thread
switch, Back and Forward, breadcrumbs, navigate actions) are dropped the same
way but are not modeled.

### `AuthoredInputSend.tla`

This model covers one input action in an authored Node Detail and the
follow-up Send:

- typing, and the commit on `change` at the controller's draft revision;
- Send's gates and the draft revision it captures;
- the server's commit rule and its reservation of committed attachments;
- the turn ending, with the failure restore;
- a commit that fails in transport or on the server;
- draft reloads, which the controller queues behind a commit in flight;
- the lock on authored inputs while a Send is in flight;
- the renderer's reloads after each response.

| Check | Verdict | Finding |
| --- | --- | --- |
| `input-send-carries-answer` | Fixed; now passes | Before the fix (#521): legacy input controls registered each commit with `inputPending`, which kept Send disabled; an authored input's commit did not. Mousedown on Send blurs the input, whose `change` commits it, so the commit and the Send went out together at the same revision. A Send served first went without the answer, which then landed in the next turn's draft; a commit served first got the Send refused with `input_draft_revision_conflict`. Send now waits for the thread's authored commits before it captures the draft revision, and stops if one fails, since the answer did not save; a commit still in flight counts toward Send being ready. Authored inputs are locked while a Send is in flight; a commit during a run still goes to the next turn's draft (ADR 0008). Scenarios: `input-send-waits-for-commit`, `input-failed-answer-stops-send`. |
| `input-send-without-waiting` | Records the bug | With `SendAwaitsAuthoredCommits` off, a Send served before the commit goes without the answer. |
| `input-send-forgets-early-failure` | Records the bug | With `KeepFailedCommit` off, a commit that fails before the click is forgotten, and the Send goes without the answer. Before the fix (review of #521), a failed commit left the set Send waits on as soon as it settled. Now an input's latest failed commit is kept until a Send it stops, a newer commit of that input, or detaching it accounts for it. It stops the next Send once, whether or not its Node Detail is still open; clicking Send again sends without it. Its error is shown again when a new Node Detail mounts the input, until a later commit or detaching it clears it. Scenario: `input-early-failure-stops-send`; the closed-inspector case is a test in `test/authored-input-send-traces.test.mjs`. |

Send waits rather than being disabled during the commit, because disabling it
would swallow the click that caused the blur.

The ghost `intended` is the answer in the field when Send is clicked. The
model first recorded the committed value when no commit was in flight, which
hid the early failure. A Send stopped for an answer that did not save is
told so; if the user clicks Send again without editing it, the message goes
without that answer.

### `CanvasGesture.tla`

This model covers pointer gestures on the graph canvas while the workspace
re-renders underneath:

- pressing, moving, and releasing on a node, with the pointer capture that
  routes the node's events;
- panning the stage;
- renders that keep the layout, change it, or switch to another view and
  back, with the view cache that restores pinned positions and the camera.

Positions are locations on a ring of `L` points; a node's screen location is
its world location plus the camera offset. There is one draggable node, and
the other view does not contain it. Pinch and wheel zoom, keyboard
navigation, the inspector's camera fit, and the click that selects a node
are not checked. A gesture never spans a return to the home view. The canvas
has no force simulation: layouts are authored and normalized, and the camera
is the only transform (`docs/architecture.md`).

| Check | Verdict | Finding |
| --- | --- | --- |
| `canvas-promises` | Fixed; now passes | Before the fix (#531): `renderGraph` replaced `graphNodes` and the node elements on every render, but `dragging` kept the replaced object and the capture on the removed element. After a render mid-drag, moves went to the old object and the node stopped following the pointer (`DragFollowsPointer`, Press → Move → RenderLayout). The next render rebuilt positions from the new objects, so the drop was lost (`DropStays`, Press → RenderSame → Move → Release). A render now re-binds the drag to the node's new object and captures the pointer on its new element. A node that has moved stays under the pointer, pinned, and the camera is not refit while it is dragged. Entering another view, the node disappearing, a failed re-capture, or a move with no button pressed ends the drag. `CameraMovesOnlyByPanOrFit` is a property of steps: in the home view, only a pan, a new layout, or the fit after a drop moves the camera. Scenarios: `canvas-drag-across-render`, `canvas-drag-across-layout`, `canvas-drop-round-trip`, `canvas-pan-across-render`, `canvas-drag-into-view-change`. |
| `canvas-without-rebind` | Records the bug | With `KeepDragAcrossRender` off, a render during a drag leaves the drag on the replaced node. |
| `canvas-without-fit-before-leaving` | Records the bug | With `FitBeforeLeaving` off, leaving the view mid-drag after a layout change caches the unfitted camera, and returning restores it. The view is now fitted before it is cached. Scenario: `canvas-leave-after-layout-change`. |
| `canvas-without-fit-after-drop` | Records the bug | With `FitLayoutAfterDrop` off, a layout that changed mid-drag is never fitted, and new nodes can stay off-screen (`DropFitsNewLayout`). Now the view fits the new layout once the node is dropped, and the node stays where it was dropped. Scenario: `canvas-drag-across-layout`. |

The replay dispatches pointer events the way a browser routes them. An event
goes to the element holding capture while that element is still in the
document, and otherwise to the element under the pointer. Each refresh
delivers a new state object. `RenderLayout` is replayed only while a moved
drag holds the node, because a new placement does not otherwise map onto
evenly spaced locations. Tests outside the model cover a graph that
empties mid-drag (the node elements are removed with the graph, so the
release cannot click a node that is gone) and each way a drag ends: a move
with no button pressed, a failed re-capture, and entering another view that
also shows the node. The camera and layout functions
have their own tests (`test/graph-camera.test.mjs`,
`test/graph-layout.test.mjs`).

A fit centers the graph, which the model writes as `Fit`: the one node at
location 0. The replay reads locations and camera offsets modulo `L`.

## Limits

- **Bounds:** one provider plus one new connection, one renderer, one lease,
  and a single child at depth 1 with head revision at most 3. The composer
  has two threads, two turns each, and two typed values; the inspector has
  two nodes, three state revisions, and three editors; the canvas has three locations,
  one draggable node, and six renders. A bug that needs more
  actors is out of reach. `composer-fixed` also passes with three turns and
  three values (2.7 million states), which is not part of the suite.
- **Queue order:** the provider queue is FIFO for queued cancels, but requests
  that queue behind an interior await may start in either order.
- **Not modeled:**
  - the parent retrying a failed stop;
  - label uniqueness and ids;
  - the model catalog refresh queue's own ordering;
  - harness readiness generations;
  - thread permission pinning;
  - Ladybug index crash recovery;
  - remint races in the graph server;
  - the parent's `/result` long poll;
  - grandchildren.
- **Composer assumptions:** `threads.submitInteraction` reads the thread from
  `viewState` behind a dynamic `import()`, assumed to resolve in the same
  task; if it took a task, a thread switch could send one thread's text on
  another's POST. The model always views the latest turn, so the `finally`
  that reads the viewed turn's status is modeled for that case only.
- **Candidate fixes are modeled, not designed.** A fix still needs a product
  decision wherever the PRD is silent. One example is what the default family
  should become when its managed family is tombstoned.
- **Adapter:** `bound` is attributed to the step that registered the
  listener, not read from the listener itself. `lock`, the program counters,
  and the families are not compared.
- **Review:** an independent adversarial review of model fidelity is not
  certifying. Record its commit, scope and verdict in the PR.
