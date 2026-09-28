--------------------------- MODULE ExecutionLeases ---------------------------
(***************************************************************************)
(* Provider execution leases across the Rust app server, the harness host *)
(* and the Electron-main provider broker, including the provider removal  *)
(* drain, harness-host close, and restart.                                *)
(*                                                                         *)
(* Source of truth (every action cites the code it abstracts):            *)
(*   HH  = packages/harness-host/src/host.ts                               *)
(*   RTB = desktop/main/services/graphcomplete-runtime.mjs (broker)        *)
(*   PDS = desktop/main/providers/provider-definition-service.mjs          *)
(*   RAS = desktop/main/services/relayer-app-server.mjs                    *)
(*   PC  = desktop/main/providers/provider-composition.mjs                 *)
(*   IDX = desktop/main/index.mjs                                          *)
(*   EX  = crates/relayer-app-server/src/product/execution.rs              *)
(*   RT  = crates/relayer-app-server/src/runtime.rs                        *)
(*   AS  = crates/relayer-app-server/src/app_server.rs                     *)
(*   AT  = crates/relayer-app-server/src/storage/sqlite/attempts.rs        *)
(*   INT = crates/relayer-app-server/src/storage/sqlite/interactions.rs    *)
(*   CAT = crates/relayer-app-server/src/storage/sqlite/catalog.rs         *)
(*   THR = crates/relayer-app-server/src/api/threads.rs                    *)
(*                                                                         *)
(* A citation is a function name (HH releaseAfter) or lines (HH:1194).    *)
(* Line numbers drift as the code changes; prefer a name for a function.  *)
(*                                                                         *)
(* One provider P. Each turn t is one Rust interaction execution task with *)
(* at most one attempt and one execution lease, on its own thread (so its  *)
(* own harness session). The harness host runs in Electron main, so       *)
(* harness -> broker -> PDS calls are in-process; Rust reaches the harness *)
(* over HTTP (RT admit_execution, release_provider_execution). The PDS     *)
(* #serialized queue makes each PDS operation below one atomic step        *)
(* (acquire, release+finalize, acknowledge+finalize, remove).              *)
(***************************************************************************)
EXTENDS Naturals, FiniteSets

CONSTANTS
  Turns,              \* concurrent turns on provider P
  MaxRestarts,        \* bound on app restarts
  \* --- faults ---
  AdmissionTimeout,   \* HH:879/944 30 s admission timer may fire before the claim
  RustCanAbandon,     \* Rust stops waiting on /complete while the harness still runs
  PersistCanFail,     \* Rust terminal persistence fails (record_reconciliation_pending)
  StartupQuarantine,  \* startup reconciliation quarantines an interrupted submitted input
  HarnessCanHang,     \* a native turn may ignore cancellation (no fairness on NatEnd)
  UserCanStop,        \* the user may Stop a running turn while Rust still waits on it
  StartupCleanupCanFail, \* reconcileStartup's finalize fails with a non-drain error
                         \* (catalog write, credential delete, runtime-state removal)
  \* --- fixes (TRUE once landed) ---
  HostReleasesOnSettle,  \* HH:1273-1277 (executeCompletion's finally) and
                         \* HH settleExecutionAccess: the host releases access as
                         \* soon as the native turn ends and keeps the entry until
                         \* the owner's release; an owner release of a running turn
                         \* cancels it instead (HH releaseProviderExecution)
  ClaimRejectsReleasing, \* HH:1194: no claim once a release was decided
                         \* (releaseRequested, set at HH:997, 1088, 1473)
  AckRetriesFinalize,    \* PDS #finalizeRemoval: a finalize the store refuses as
                         \* drain-incomplete returns false instead of throwing
                         \* (the refusal code, RAS:436-440); the owner's
                         \* acknowledgement (HH acknowledgeReleasedExecution ->
                         \* PDS acquireExecution's acknowledge) retries it
  QuarantineSettleWakesReconciler, \* THR reconcile_quarantined_interaction:
                         \* settling a quarantined interaction wakes the lease
                         \* reconciler
  UnknownReleaseRetriesFinalize, \* HH:986-991 -> RTB:192-194, 521-523 ->
                         \* IDX:224 -> PDS finalizeDrainedRemovals: an owner release
                         \* of a lease the host no longer tracks retries every
                         \* drained removal
  PersistFailureEndsWait, \* EX:67-80, 1070-1124: when the task stops waiting on
                         \* a native run without a terminal attempt, it ends the
                         \* attempt with a decided interaction outcome, or records
                         \* native_wait_ended_at (AT:311-368), and releases the lease
  RestartEndsWaits,      \* INT:83-95: startup records native_wait_ended_at on the
                         \* attempts it leaves open for reconciliation
  StartupIsolatesProviders, \* PDS reconcileStartup records a provider's
                         \* removal or cleanup failure and keeps starting
  ForceStopsCancelledTurn \* HH runCompletion (armForceStop) and
                         \* settledOrForceStopped: a cancelled turn still
                         \* running after two minutes is force-stopped, and
                         \* its access is released

Lives == {"active", "removal_pending", "tombstoned"}

VARIABLES
  \* --- durable Rust SQLite (survives restart) ---
  rLife,     \* model_providers.lifecycle_state for P
  att,       \* t -> none | running | ended | terminal
             \*      (interaction_attempts.outcome; "ended" is outcome='running'
             \*       with native_wait_ended_at set: undecided, but Relayer no
             \*       longer waits on it, so the drain skips it)
  quar,      \* t -> no | ordinary | submitted  ("Canonical reconciliation pending")
  acked,     \* t -> execution_lease_reconciled_at IS NOT NULL
  \* --- Rust in-memory ---
  rpc,       \* t -> Rust execution task program counter
  wake,      \* reconciler Notify permit (AS:502-537)
  wBusy,     \* reconciler worker is scanning debt (AS:539-575)
  \* --- Electron main: provider definition service ---
  jLife,     \* this.definitions[P].lifecycleState
  jsHeld,    \* t -> PDS lease for t counted in activeExecutions (PDS acquireExecution)
  rt,        \* P's runtime in this.runtimes: none | open | closed
  pClosed,   \* PDS close() ran
  \* --- Electron main: harness host ---
  hl,        \* t -> pendingExecutionAccess entry state:
             \*      none | admitted | claimed | settled | released | awaiting
             \*      (awaiting is the state before HostReleasesOnSettle)
  hRel,      \* t -> a host-initiated release promise is in flight
  hTimer,    \* t -> a release timer is armed (HH releaseAfter)
  hReq,      \* t -> releaseRequested: a release was decided
  hOwn,      \* t -> ownerReleased: the owner's release arrived
  abort,     \* t -> the completion's AbortController has fired
  nat,       \* t -> native harness turn using the provider runtime:
             \*      none | running | done | forced (ended by a force-stop)
  hClosed,   \* harness host closed flag (HH:1419)
  \* --- process ---
  app,       \* up | rustDown | down | startFailed
  restarts

vars == <<rLife, att, quar, acked, rpc, wake, wBusy, jLife, jsHeld, rt,
          pClosed, hl, hRel, hTimer, hReq, hOwn, abort, nat, hClosed, app,
          restarts>>
hostVars == <<hl, hRel, hTimer, hReq, hOwn, abort>>

Count == Cardinality({u \in Turns : jsHeld[u]})
\* CAT:206-218: the drain counts only undecided attempts Relayer still
\* waits on. Live native work is guarded by jsHeld (the host's claim and the
\* PDS count), not by this.
RustRunning == \E u \in Turns : att[u] = "running"
\* AT:370-410: lease debt is any attempt the drain no longer counts.
Debt(t) == att[t] \in {"terminal", "ended"} /\ ~acked[t]

Init ==
  /\ rLife = "active" /\ jLife = "active"
  /\ att = [t \in Turns |-> "none"]
  /\ quar = [t \in Turns |-> "no"]
  /\ acked = [t \in Turns |-> FALSE]
  /\ rpc = [t \in Turns |-> "idle"]
  /\ wake = TRUE /\ wBusy = FALSE            \* AS:814-815 schedules at open
  /\ jsHeld = [t \in Turns |-> FALSE]
  /\ rt = "open" /\ pClosed = FALSE          \* PC:88 -> PDS activate()
  /\ hl = [t \in Turns |-> "none"]
  /\ hRel = [t \in Turns |-> FALSE]
  /\ hTimer = [t \in Turns |-> FALSE]
  /\ hReq = [t \in Turns |-> FALSE]
  /\ hOwn = [t \in Turns |-> FALSE]
  /\ abort = [t \in Turns |-> FALSE]
  /\ nat = [t \in Turns |-> "none"]
  /\ hClosed = FALSE
  /\ app = "up" /\ restarts = 0

-----------------------------------------------------------------------------
(* PDS #finalizeRemoval: definitionStore.save PUTs the tombstone to Rust,  *)
(* and sync_provider_definitions rejects it with                           *)
(* provider_execution_drain_incomplete while any attempt on P is           *)
(* undecided and still waited on (CAT:206-218). Only after the tombstone   *)
(* commits is the runtime closed. With AckRetriesFinalize the refusal     *)
(* returns false and P stays removal_pending; before it, it was thrown.    *)
FinalizeOk == app = "up" /\ ~RustRunning
Tombstone ==
  /\ rLife' = "tombstoned" /\ jLife' = "tombstoned"
  /\ rt' = IF rt = "open" THEN "closed" ELSE rt

(* A PDS release (the lease's release in PDS acquireExecution, via         *)
(* releaseHeldExecutionAccess HH:2917 and the broker's onceRelease         *)
(* RTB:173-185) sets released=true, drops the count, and then finalizes if *)
(* the count is zero and P is removal_pending                             *)
(* (PDS #finalizeDrainedRemoval).                                          *)
(* A retried release is a no-op. An acknowledgement (the lease's           *)
(* acknowledge in PDS acquireExecution) runs the same drained-removal      *)
(* finalize again; before AckRetriesFinalize the lease had no acknowledge  *)
(* and the host's `acknowledge?.()` did nothing.                           *)
(*                                                                         *)
(* Settle(t, rel, ack) is one host step that releases t's PDS lease (rel)  *)
(* and then acknowledges it (ack). The release throws only when the        *)
(* finalize is refused and AckRetriesFinalize is off; a thrown release     *)
(* skips the acknowledgement.                                              *)
CountAfter(t, rel) == Count - (IF rel /\ jsHeld[t] THEN 1 ELSE 0)
RelTries(t, rel) == rel /\ jsHeld[t] /\ Count = 1 /\ jLife = "removal_pending"
RelThrows(t, rel) == RelTries(t, rel) /\ ~FinalizeOk /\ ~AckRetriesFinalize
AckTries(t, rel, ack) ==
  ack /\ AckRetriesFinalize /\ CountAfter(t, rel) = 0 /\ jLife = "removal_pending"

PdsSettle(t, rel, ack) ==
  /\ jsHeld' = IF rel THEN [jsHeld EXCEPT ![t] = FALSE] ELSE jsHeld
  /\ IF (RelTries(t, rel) \/ (~RelThrows(t, rel) /\ AckTries(t, rel, ack)))
        /\ FinalizeOk
     THEN Tombstone
     ELSE UNCHANGED <<rLife, jLife, rt>>

(* After a release promise resolves (HH releaseHeldExecution): the entry   *)
(* becomes "released" and, if the owner already released it, is           *)
(* acknowledged and forgotten (HH finishReleasedExecution,                 *)
(* acknowledgeReleasedExecution). A failed release clears the promise and  *)
(* re-arms a 30 s retry unless the host is closed (HH:1067-1072).          *)
(* Before HostReleasesOnSettle, a release deleted the entry at once.      *)
AfterRelease(t, ack) ==
  IF RelThrows(t, TRUE)
  THEN /\ hTimer' = [hTimer EXCEPT ![t] = ~hClosed]
       /\ UNCHANGED hl
  ELSE /\ hl' = [hl EXCEPT ![t] =
                   IF ~HostReleasesOnSettle \/ ack THEN "none" ELSE "released"]
       /\ hTimer' = [hTimer EXCEPT ![t] = FALSE]

(* The owner's release: Rust's DELETE (RT release_provider_execution) ->   *)
(* HH:1849-1850 -> HH releaseProviderExecution. An unknown lease answers   *)
(* 200 released:false, which Rust treats as success (AS:455-500). A lease  *)
(* is unknown after a restart (fresh host memory) or once the host forgot  *)
(* it (ForgetReleased). With UnknownReleaseRetriesFinalize the host first  *)
(* asks the broker to acknowledge it (HH:986-991), which Desktop wires to  *)
(* finalizeDrainedRemovals (RTB:192-194, 521-523, IDX:224, PDS             *)
(* finalizeDrainedRemovals): every removal_pending provider with no        *)
(* counted lease is finalized. A refused finalize is thrown to Rust only   *)
(* before AckRetriesFinalize. With HostReleasesOnSettle a claimed entry is *)
(* not released: the owner abandons the completion (HH:994, abandon set by *)
(* the claimer at HH:1209, 823) and gets true at once; the host releases   *)
(* the access when the native turn ends and acknowledges it then (HH       *)
(* finishReleasedExecution). Any other entry is released if needed (an     *)
(* admitted one first marks releaseRequested, HH:997), acknowledged and    *)
(* deleted; a failed release or acknowledgement is thrown back to Rust,   *)
(* whose worker retries. Before the fix it released any entry, including a *)
(* running turn's.                                                         *)
Abandons(t) == HostReleasesOnSettle /\ hl[t] = "claimed"
OwnerRel(t) == hl[t] \in {"admitted", "settled", "claimed", "awaiting"}
UnknownTries == UnknownReleaseRetriesFinalize /\ Count = 0
                /\ jLife = "removal_pending"
OwnerReleaseFails(t) ==
  IF hl[t] = "none"
  THEN UnknownTries /\ ~FinalizeOk /\ ~AckRetriesFinalize
  ELSE ~Abandons(t) /\ RelThrows(t, OwnerRel(t))

OwnerRelease(t) ==
  IF hl[t] = "none"
  THEN /\ IF UnknownTries /\ FinalizeOk THEN Tombstone
          ELSE UNCHANGED <<rLife, jLife, rt>>
       /\ UNCHANGED <<jsHeld, hl, hTimer, hReq, hOwn, abort>>
  ELSE IF Abandons(t)
  THEN /\ abort' = [abort EXCEPT ![t] = TRUE]
       /\ hOwn' = [hOwn EXCEPT ![t] = TRUE]
       /\ UNCHANGED <<jsHeld, rLife, jLife, rt, hl, hTimer, hReq>>
  ELSE /\ PdsSettle(t, OwnerRel(t), TRUE)
       /\ hOwn' = [hOwn EXCEPT ![t] = TRUE]
       /\ hReq' = [hReq EXCEPT ![t] = hReq[t] \/ hl[t] = "admitted"]
       /\ IF RelThrows(t, OwnerRel(t))
          THEN /\ hTimer' = [hTimer EXCEPT ![t] = ~hClosed]
               /\ UNCHANGED hl
          ELSE /\ hl' = [hl EXCEPT ![t] = "none"]
               /\ hTimer' = [hTimer EXCEPT ![t] = FALSE]
       /\ UNCHANGED abort

-----------------------------------------------------------------------------
(* Rust execution task (EX execute_prepared_interaction).                 *)

(* Rust resolves the plan against SQLite (provider active), then POSTs     *)
(* execution-leases (RT admit_execution) -> HH admitModelPlanExecution    *)
(* -> broker.acquire (RTB:187-241) -> PDS acquireExecution, which checks   *)
(* only the JS lifecycle; #runtimeFor opens a runtime if none is           *)
(* registered. The host arms the 30 s admission timer (HH:944).            *)
(* A refused admission is a pre-execution failure with no attempt row.    *)
Admit(t) ==
  /\ app = "up" /\ rpc[t] = "idle" /\ rLife = "active"
  /\ IF jLife = "active" /\ ~hClosed
     THEN /\ jsHeld' = [jsHeld EXCEPT ![t] = TRUE]
          /\ rt' = IF rt = "none" THEN "open" ELSE rt
          /\ hl' = [hl EXCEPT ![t] = "admitted"]
          /\ hTimer' = [hTimer EXCEPT ![t] = TRUE]
          /\ rpc' = [rpc EXCEPT ![t] = "admitted"]
     ELSE /\ rpc' = [rpc EXCEPT ![t] = "done"]
          /\ UNCHANGED <<jsHeld, rt, hl, hTimer>>
  /\ UNCHANGED <<rLife, att, quar, acked, wake, wBusy, jLife, pClosed, hRel,
                 hReq, hOwn, abort, nat, hClosed, app, restarts>>

(* begin_interaction_attempt (AT:116, EX:320-399) re-resolves the plan in  *)
(* one SQLite transaction and inserts outcome='running' with the lease id. *)
(* If P is no longer admissible, EX:352-399 records a terminal admission-  *)
(* failure receipt and releases the lease. Abstraction: we record the     *)
(* terminal row and then take the ordinary terminal release path.         *)
Begin(t) ==
  /\ app = "up" /\ rpc[t] = "admitted"
  /\ IF rLife = "active"
     THEN /\ att' = [att EXCEPT ![t] = "running"]
          /\ rpc' = [rpc EXCEPT ![t] = "attempt"]
     ELSE /\ att' = [att EXCEPT ![t] = "terminal"]
          /\ rpc' = [rpc EXCEPT ![t] = "release"]
  /\ UNCHANGED <<rLife, quar, acked, wake, wBusy, jLife, jsHeld, rt, pClosed,
                 hostVars, nat, hClosed, app, restarts>>

(* RT complete_prepared POSTs /complete with executionLeaseId ->          *)
(* host.complete -> HH runCompletion -> executeCompletion, which claims    *)
(* the entry only if state = "admitted" (HH:1192-1214) and, with          *)
(* ClaimRejectsReleasing, only if no release was ever decided for it      *)
(* (HH:1194). Before that fix a release already in flight did not stop    *)
(* the claim (finding A). A missing or refused entry fails the turn with  *)
(* "Execution access admission is invalid or expired" before any provider *)
(* call; Rust sees an error response.                                     *)
Claim(t) ==
  /\ app = "up" /\ rpc[t] = "attempt"
  /\ IF hl[t] = "admitted" /\ ~hClosed /\ (ClaimRejectsReleasing => ~hReq[t])
     THEN /\ hl' = [hl EXCEPT ![t] = "claimed"]
          /\ hTimer' = [hTimer EXCEPT ![t] = FALSE]
          /\ nat' = [nat EXCEPT ![t] = "running"]
          /\ rpc' = [rpc EXCEPT ![t] = "waiting"]
     ELSE /\ rpc' = [rpc EXCEPT ![t] = "result"]
          /\ UNCHANGED <<hl, hTimer, nat>>
  /\ UNCHANGED <<rLife, att, quar, acked, wake, wBusy, jLife, jsHeld, rt,
                 pClosed, hRel, hReq, hOwn, abort, hClosed, app, restarts>>

(* The native turn ends (HH:1260 `settledOrForceStopped(native, ...)`     *)
(* resolves or rejects). With HostReleasesOnSettle, executeCompletion's    *)
(* finally moves the entry its completion claimed to settled and starts    *)
(* its release at once (HH:1273-1277, HH settleExecutionAccess), before    *)
(* the response reaches Rust. Before the fix it moved it to               *)
(* awaiting-terminal with no timer and waited for                          *)
(* Rust's DELETE. ForceStop settles a turn the same way (SettleTurn).     *)
SettleTurn(t) ==
  /\ IF hl[t] = "claimed"
     THEN IF HostReleasesOnSettle
          THEN /\ hl' = [hl EXCEPT ![t] = "settled"]
               /\ hRel' = [hRel EXCEPT ![t] = TRUE]
               /\ hTimer' = [hTimer EXCEPT ![t] = FALSE]
          ELSE /\ hl' = [hl EXCEPT ![t] = "awaiting"]
               /\ UNCHANGED <<hRel, hTimer>>
     ELSE UNCHANGED <<hl, hRel, hTimer>>
  /\ rpc' = [rpc EXCEPT ![t] = IF rpc[t] = "waiting" THEN "result" ELSE rpc[t]]
  /\ UNCHANGED <<rLife, att, quar, acked, wake, wBusy, jLife, jsHeld, rt,
                 pClosed, hReq, hOwn, abort, hClosed, app, restarts>>

NatEnd(t) ==
  /\ nat[t] = "running"
  /\ nat' = [nat EXCEPT ![t] = "done"]
  /\ SettleTurn(t)

(* The per-turn force-stop (HH runCompletion, armForceStop): a completion  *)
(* whose cancel signal fired arms one two-minute timer. If its native turn *)
(* still runs when it fires, the harness ends that one turn: Codex kills   *)
(* the turn's own app-server process group, and Prime disposes the turn's  *)
(* own session. executeCompletion (settledOrForceStopped) waits at most    *)
(* ten more seconds, reports a settled cancellation, and settles the       *)
(* claimed access exactly as NatEnd does. Only t changes, so a sibling is  *)
(* never touched.                                                          *)
(* Abstractions: the kill or disposal always ends the native work (the     *)
(* code's best effort), and the harness declares supportsForceStop. Turns  *)
(* here are on separate threads; turns sharing a thread (a root and its    *)
(* invoked children) are covered by the harness-host tests.                *)
ForceStop(t) ==
  /\ ForceStopsCancelledTurn
  /\ abort[t] /\ nat[t] = "running"
  /\ nat' = [nat EXCEPT ![t] = "forced"]
  /\ SettleTurn(t)

(* Rust stops waiting while the harness is still running: the approval    *)
(* reconciliation failure path cancels, waits 2 s, and breaks with Err     *)
(* (EX:529-555), or the /complete HTTP request fails (RT:935-969; no      *)
(* request timeout). The cancel (HH cancel) or the dropped request         *)
(* (HH:1916) aborts the completion, but the native turn unwinds on its     *)
(* own schedule. With ForceStopsCancelledTurn, a turn that ignores the     *)
(* cancellation is force-stopped (ForceStop).                              *)
GiveUp(t) ==
  /\ RustCanAbandon /\ app = "up"
  /\ rpc[t] = "waiting" /\ nat[t] = "running"
  /\ rpc' = [rpc EXCEPT ![t] = "result"]
  /\ abort' = [abort EXCEPT ![t] = TRUE]
  /\ UNCHANGED <<rLife, att, quar, acked, wake, wBusy, jLife, jsHeld, rt,
                 pClosed, hl, hRel, hTimer, hReq, hOwn, nat, hClosed, app,
                 restarts>>

(* The user's Stop. Rust's wait loop sees stop_requested (EX:511-528) and  *)
(* dispatch_product_stop stops the graph current, then cancels the         *)
(* completion (RT cancel_invoked_completion -> HH:1853-1862 -> HH cancel), *)
(* which aborts it. Unlike GiveUp, Rust keeps waiting on /complete, so the *)
(* turn's end, natural or forced, is what hands Rust its result            *)
(* (SettleTurn). A turn that ignores the cancellation is force-stopped     *)
(* (ForceStop). Abstraction: a Stop before the claim, which never starts   *)
(* the native turn, is not modeled.                                        *)
Cancel(t) ==
  /\ UserCanStop /\ app = "up"
  /\ rpc[t] = "waiting" /\ nat[t] = "running" /\ ~abort[t]
  /\ abort' = [abort EXCEPT ![t] = TRUE]
  /\ UNCHANGED <<rLife, att, quar, acked, rpc, wake, wBusy, jLife, jsHeld, rt,
                 pClosed, hl, hRel, hTimer, hReq, hOwn, nat, hClosed, app,
                 restarts>>

(* Rust persists the terminal attempt (fail EX:612-638, 844-869, accept   *)
(* EX:655-678) and then releases (release_terminal_admission             *)
(* EX:1158-1173). On a persistence or canonical-read failure it calls     *)
(* record_reconciliation_pending (EX:1126-1156), which fails only the      *)
(* interaction and leaves the attempt 'running' (INT:898-927), or just    *)
(* logs. A submitted-input interaction in that state is "quarantined".     *)
(* An approval the provider aborts, expires or cancels mid-turn fails or  *)
(* stops the interaction first (q = "decided", no fault needed), so the    *)
(* later write fails the same way. With PersistFailureEndsWait the task    *)
(* then ends its wait (end_native_wait, EX:1070-1124): a decided attempt   *)
(* ends with its interaction's outcome; a quarantined one stays undecided  *)
(* ("ended"). Either way its lease is released. Before the fix the task    *)
(* returned without a release, and the attempt stayed running.            *)
Persist(t, ok) ==
  /\ app = "up" /\ rpc[t] = "result"
  /\ IF ok
     THEN /\ att' = [att EXCEPT ![t] = IF att[t] = "running" THEN "terminal" ELSE att[t]]
          /\ rpc' = [rpc EXCEPT ![t] = "release"]
          /\ UNCHANGED quar
     ELSE /\ rpc' = [rpc EXCEPT ![t] = IF PersistFailureEndsWait THEN "release" ELSE "done"]
          /\ \E q \in {"ordinary", "submitted", "decided"} :
               /\ PersistCanFail \/ q = "decided"
               /\ quar' = [quar EXCEPT ![t] = IF q = "decided" THEN quar[t] ELSE q]
               /\ att' = [att EXCEPT ![t] =
                            IF ~PersistFailureEndsWait \/ att[t] /= "running" THEN att[t]
                            ELSE IF q = "decided" THEN "terminal" ELSE "ended"]
  /\ UNCHANGED <<rLife, acked, wake, wBusy, jLife, jsHeld, rt, pClosed,
                 hostVars, nat, hClosed, app, restarts>>

(* release_terminal_admission -> reconcile_terminal_execution_lease        *)
(* (AS:455-500): read debt (Debt above), DELETE the lease,                 *)
(* acknowledge. On failure it wakes the one reconciler (EX:1169-1172).     *)
(* Abstraction: the DELETE waits out a release already in flight           *)
(* (HH:1061 `??=`).                                                        *)
InlineRelease(t) ==
  /\ app = "up" /\ rpc[t] = "release" /\ ~hRel[t]
  /\ rpc' = [rpc EXCEPT ![t] = "done"]
  /\ IF Debt(t)
     THEN /\ OwnerRelease(t)
          /\ acked' = [acked EXCEPT ![t] = ~OwnerReleaseFails(t)]
          /\ wake' = (wake \/ OwnerReleaseFails(t))
     ELSE UNCHANGED <<jsHeld, rLife, jLife, rt, hl, hTimer, hReq, hOwn, abort,
                      acked, wake>>
  /\ UNCHANGED <<att, quar, wBusy, pClosed, hRel, nat, hClosed, app, restarts>>

-----------------------------------------------------------------------------
(* The single lease-debt reconciler (AS:502-575). It wakes on a Notify    *)
(* permit, serially retries every unreconciled terminal lease with capped  *)
(* backoff, and returns to idle when the debt is clear.                    *)
WorkerWake ==
  /\ app = "up" /\ wake /\ ~wBusy
  /\ wake' = FALSE /\ wBusy' = TRUE
  /\ UNCHANGED <<rLife, att, quar, acked, rpc, jLife, jsHeld, rt, pClosed,
                 hostVars, nat, hClosed, app, restarts>>

WorkerTry(t) ==
  /\ app = "up" /\ wBusy /\ Debt(t) /\ ~hRel[t]
  /\ OwnerRelease(t)
  /\ acked' = [acked EXCEPT ![t] = ~OwnerReleaseFails(t)]
  /\ UNCHANGED <<att, quar, rpc, wake, wBusy, pClosed, hRel, nat, hClosed, app,
                 restarts>>

WorkerIdle ==
  /\ app = "up" /\ wBusy /\ \A t \in Turns : ~Debt(t)
  /\ wBusy' = FALSE
  /\ UNCHANGED <<rLife, att, quar, acked, rpc, wake, jLife, jsHeld, rt, pClosed,
                 hostVars, nat, hClosed, app, restarts>>

-----------------------------------------------------------------------------
(* Host release timers (HH releaseAfter). The admission timer fires only  *)
(* if AdmissionTimeout (the claim came 30 s late) or no claim is coming.   *)
(* A retry timer re-armed after a failed release always fires.            *)
(* With HostReleasesOnSettle a timer that finds the entry claimed or       *)
(* released does nothing; otherwise it marks releaseRequested and starts   *)
(* the release. Before the fix it released any entry. The release is       *)
(* async, and the claim may run before it resolves.                        *)
TimerFire(t) ==
  /\ hTimer[t] /\ ~hRel[t] /\ hl[t] /= "none"
  /\ \/ hl[t] /= "admitted"
     \/ AdmissionTimeout
     \/ rpc[t] \notin {"admitted", "attempt"}
  /\ hTimer' = [hTimer EXCEPT ![t] = FALSE]
  /\ LET noop == HostReleasesOnSettle /\ hl[t] \in {"claimed", "released"}
     IN /\ hRel' = [hRel EXCEPT ![t] = ~noop]
        /\ hReq' = [hReq EXCEPT ![t] = hReq[t] \/ ~noop]
  /\ UNCHANGED <<rLife, att, quar, acked, rpc, wake, wBusy, jLife, jsHeld, rt,
                 pClosed, hl, hOwn, abort, nat, hClosed, app, restarts>>

(* A host-initiated release promise (timer or settle) resolves. It         *)
(* acknowledges only if the owner has already released the entry.         *)
ReleaseDone(t) ==
  /\ hRel[t]
  /\ hRel' = [hRel EXCEPT ![t] = FALSE]
  /\ PdsSettle(t, TRUE, hOwn[t])
  /\ AfterRelease(t, hOwn[t])
  /\ UNCHANGED <<att, quar, acked, rpc, wake, wBusy, pClosed, hReq, hOwn, abort,
                 nat, hClosed, app, restarts>>

(* Access released before its owner's release is kept for the owner's     *)
(* acknowledgement for ten minutes, then forgotten (HH                    *)
(* finishReleasedExecution, expireUnacknowledged). Abstraction:            *)
(* close-time releases, which arm no such timer, may be forgotten too.     *)
ForgetReleased(t) ==
  /\ HostReleasesOnSettle /\ hl[t] = "released" /\ ~hOwn[t]
  /\ hl' = [hl EXCEPT ![t] = "none"]
  /\ UNCHANGED <<rLife, att, quar, acked, rpc, wake, wBusy, jLife, jsHeld, rt,
                 pClosed, hRel, hTimer, hReq, hOwn, abort, nat, hClosed, app,
                 restarts>>

-----------------------------------------------------------------------------
(* User actions.                                                          *)

(* PDS remove: save removal_pending (CAT:201-205: guards only             *)
(* the default family and provider, not running attempts), then finalize   *)
(* at once if the JS lease count is zero. A refused finalize leaves P      *)
(* removal_pending (it threw before AckRetriesFinalize, but the save had   *)
(* committed); the UI cannot call remove() again.                          *)
Remove ==
  /\ app = "up" /\ jLife = "active"
  /\ IF Count = 0 /\ FinalizeOk
     THEN Tombstone
     ELSE /\ rLife' = "removal_pending" /\ jLife' = "removal_pending"
          /\ UNCHANGED rt
  /\ UNCHANGED <<att, quar, acked, rpc, wake, wBusy, jsHeld, pClosed, hostVars,
                 nat, hClosed, app, restarts>>

(* Reading a quarantined submitted input settles it                        *)
(* (THR reconcile_quarantined_interaction) with                           *)
(* INT finalize_quarantined_submitted_input_failure or                     *)
(* recover_interaction_accepted, both of which terminalize the attempt,   *)
(* whether or not the end of the wait was recorded. An ended attempt's    *)
(* lease was already released, so no new debt forms.                       *)
(* Two readers call it: the thread view (THR refresh_accepted_outputs)    *)
(* and an invoke action's destination (THR:1103-1115).                     *)
(* Neither releases the lease; with QuarantineSettleWakesReconciler the    *)
(* settle wakes the reconciler, which owns the new lease debt.             *)
ReadQuarantined(t) ==
  /\ app = "up" /\ quar[t] = "submitted" /\ att[t] \in {"running", "ended"}
  /\ att' = [att EXCEPT ![t] = "terminal"]
  /\ quar' = [quar EXCEPT ![t] = "no"]
  /\ wake' = (wake \/ QuarantineSettleWakesReconciler)
  /\ UNCHANGED <<rLife, acked, rpc, wBusy, jLife, jsHeld, rt, pClosed,
                 hostVars, nat, hClosed, app, restarts>>

-----------------------------------------------------------------------------
(* Quit (IDX:372-400): productServer.close() first, so every Rust task and *)
(* the reconciler die; then provider composition close and GraphComplete   *)
(* runtime close run in parallel.                                          *)
ShutdownBegin ==
  /\ app = "up"
  /\ app' = "rustDown"
  /\ rpc' = [t \in Turns |-> IF rpc[t] = "idle" THEN "idle" ELSE "done"]
  /\ wake' = FALSE /\ wBusy' = FALSE
  /\ UNCHANGED <<rLife, att, quar, acked, jLife, jsHeld, rt, pClosed, hostVars,
                 nat, hClosed, restarts>>

(* Harness host close (HH beginClose, closeInternal): sets closed and     *)
(* aborts active completions; waits at most 5 s per session; then         *)
(* releases "admitted" and, with HostReleasesOnSettle, "settled" entries   *)
(* without acknowledging them (HH:1468-1481). Claimed entries stay held    *)
(* until their native turn ends.                                           *)
HostCloseStart ==
  /\ app = "rustDown" /\ ~hClosed
  /\ hClosed' = TRUE
  /\ abort' = [t \in Turns |-> abort[t] \/ nat[t] = "running"]
  /\ UNCHANGED <<rLife, att, quar, acked, rpc, wake, wBusy, jLife, jsHeld, rt,
                 pClosed, hl, hRel, hTimer, hReq, hOwn, nat, app, restarts>>

HostCloseRelease(t) ==
  /\ hClosed /\ ~hRel[t]
  /\ hl[t] \in (IF HostReleasesOnSettle THEN {"admitted", "settled"} ELSE {"admitted"})
  /\ PdsSettle(t, TRUE, FALSE)
  /\ hReq' = [hReq EXCEPT ![t] = TRUE]
  /\ hTimer' = [hTimer EXCEPT ![t] = FALSE]
  /\ hl' = [hl EXCEPT ![t] =
              IF RelThrows(t, TRUE) THEN hl[t]
              ELSE IF HostReleasesOnSettle THEN "released" ELSE "none"]
  /\ UNCHANGED <<att, quar, acked, rpc, wake, wBusy, pClosed, hRel, hOwn, abort,
                 nat, hClosed, app, restarts>>

(* PDS close() closes every runtime, ignoring leases.                      *)
PdsClose ==
  /\ app = "rustDown" /\ ~pClosed
  /\ pClosed' = TRUE
  /\ rt' = IF rt = "open" THEN "closed" ELSE rt
  /\ UNCHANGED <<rLife, att, quar, acked, rpc, wake, wBusy, jLife, jsHeld,
                 hostVars, nat, hClosed, app, restarts>>

ShutdownDone ==
  /\ app = "rustDown" /\ hClosed /\ pClosed
  /\ app' = "down"
  /\ UNCHANGED <<rLife, att, quar, acked, rpc, wake, wBusy, jLife, jsHeld, rt,
                 pClosed, hostVars, nat, hClosed, restarts>>

(* Restart. Rust open: startup reconciliation may quarantine an           *)
(* interrupted submitted input on a retryable error (AS:720-740, INT     *)
(* quarantine_interrupted_submitted_input); then                           *)
(* recover_interrupted_interactions (AS:793, INT:44-105)                   *)
(* fails every undecided attempt EXCEPT quarantined submitted inputs. With *)
(* RestartEndsWaits it records the end of the wait on those kept attempts,*)
(* their process exited with the app. The reconciler is scheduled          *)
(* (AS:814-815). Then provider composition start (PC:86-90, IDX:558) runs *)
(* PDS reconcileStartup, which finalizes every removal_pending             *)
(* definition. A refused finalize threw and quit the app before the window *)
(* opened (IDX:618, 629-633); with AckRetriesFinalize it returns false and *)
(* P stays removal_pending. A finalize that fails otherwise (cf) quits the *)
(* app too, unless StartupIsolatesProviders records it and starts; P then  *)
(* stays removal_pending until the next start. All harness and PDS memory *)
(* is fresh: a later owner release finds no host entry and takes the       *)
(* unknown-release path (OwnerRelease).                                    *)
Restart(Q, cf) ==
  /\ app \in {"down", "startFailed"} /\ restarts < MaxRestarts
  /\ Q \subseteq {t \in Turns : att[t] = "running" /\ quar[t] = "no"}
  /\ StartupQuarantine \/ Q = {}
  /\ StartupCleanupCanFail \/ ~cf
  /\ LET undecided(t) == att[t] \in {"running", "ended"}
         keep(t) == undecided(t) /\ (quar[t] = "submitted" \/ t \in Q)
         att2 == [t \in Turns |->
                    IF undecided(t) /\ ~keep(t) THEN "terminal"
                    ELSE IF keep(t) /\ RestartEndsWaits THEN "ended"
                    ELSE att[t]]
         running2 == \E t \in Turns : att2[t] = "running"
         attempted == rLife = "removal_pending" /\ ~running2
         cleanupFails == attempted /\ cf
         fail == \/ rLife = "removal_pending" /\ running2 /\ ~AckRetriesFinalize
                 \/ cleanupFails /\ ~StartupIsolatesProviders
         life2 == IF attempted /\ ~cleanupFails THEN "tombstoned" ELSE rLife
     IN /\ att' = att2
        /\ quar' = [t \in Turns |-> IF keep(t) THEN "submitted" ELSE
                                    IF att2[t] = "running" THEN quar[t] ELSE "no"]
        /\ rLife' = life2 /\ jLife' = life2
        /\ app' = IF fail THEN "startFailed" ELSE "up"
        /\ rt' = IF ~fail /\ life2 = "active" THEN "open" ELSE "none"
  /\ wake' = TRUE /\ wBusy' = FALSE
  /\ jsHeld' = [t \in Turns |-> FALSE]
  /\ hl' = [t \in Turns |-> "none"]
  /\ hRel' = [t \in Turns |-> FALSE]
  /\ hTimer' = [t \in Turns |-> FALSE]
  /\ hReq' = [t \in Turns |-> FALSE]
  /\ hOwn' = [t \in Turns |-> FALSE]
  /\ abort' = [t \in Turns |-> FALSE]
  /\ nat' = [t \in Turns |-> "none"]
  /\ hClosed' = FALSE /\ pClosed' = FALSE
  /\ restarts' = restarts + 1
  /\ UNCHANGED <<acked, rpc>>

-----------------------------------------------------------------------------
Next ==
  \/ \E t \in Turns :
       \/ Admit(t) \/ Begin(t) \/ Claim(t) \/ NatEnd(t) \/ GiveUp(t)
       \/ Cancel(t) \/ ForceStop(t)
       \/ \E ok \in BOOLEAN : Persist(t, ok)
       \/ InlineRelease(t) \/ WorkerTry(t)
       \/ TimerFire(t) \/ ReleaseDone(t) \/ HostCloseRelease(t)
       \/ ForgetReleased(t) \/ ReadQuarantined(t)
  \/ WorkerWake \/ WorkerIdle \/ Remove
  \/ ShutdownBegin \/ HostCloseStart \/ PdsClose \/ ShutdownDone
  \/ \E Q \in SUBSET Turns, cf \in BOOLEAN : Restart(Q, cf)

(* Fairness: the code guarantees the Rust task, host timers and release   *)
(* promises, the reconciler, and a begun shutdown keep running. User       *)
(* actions (Admit, Remove, Stop, reading a quarantined input, quit,       *)
(* restart) and the Rust give-up are not fair. NatEnd is fair unless      *)
(* HarnessCanHang. ForceStop is driven by the host's timer, so it is fair. *)
Fairness ==
  /\ \A t \in Turns :
       /\ WF_vars(Begin(t)) /\ WF_vars(Claim(t))
       /\ WF_vars(\E ok \in BOOLEAN : Persist(t, ok))
       /\ WF_vars(InlineRelease(t))
       /\ WF_vars(TimerFire(t)) /\ WF_vars(ReleaseDone(t))
       /\ WF_vars(HostCloseRelease(t)) /\ WF_vars(ForgetReleased(t))
       /\ (~HarnessCanHang => WF_vars(NatEnd(t)))
       /\ WF_vars(ForceStop(t))
  /\ WF_vars(WorkerWake) /\ WF_vars(\E t \in Turns : WorkerTry(t))
  /\ WF_vars(WorkerIdle)
  /\ WF_vars(HostCloseStart) /\ WF_vars(PdsClose) /\ WF_vars(ShutdownDone)

Spec == Init /\ [][Next]_vars
FairSpec == Spec /\ Fairness

-----------------------------------------------------------------------------
(* Invariants.                                                            *)

TypeOK ==
  /\ rLife \in Lives /\ jLife \in Lives
  /\ att \in [Turns -> {"none", "running", "ended", "terminal"}]
  /\ quar \in [Turns -> {"no", "ordinary", "submitted"}]
  /\ acked \in [Turns -> BOOLEAN]
  /\ rpc \in [Turns -> {"idle", "admitted", "attempt", "waiting", "result",
                        "release", "done"}]
  /\ wake \in BOOLEAN /\ wBusy \in BOOLEAN
  /\ jsHeld \in [Turns -> BOOLEAN]
  /\ rt \in {"none", "open", "closed"}
  /\ hl \in [Turns -> {"none", "admitted", "claimed", "settled", "released",
                       "awaiting"}]
  /\ hRel \in [Turns -> BOOLEAN] /\ hTimer \in [Turns -> BOOLEAN]
  /\ hReq \in [Turns -> BOOLEAN] /\ hOwn \in [Turns -> BOOLEAN]
  /\ abort \in [Turns -> BOOLEAN]
  /\ nat \in [Turns -> {"none", "running", "done", "forced"}]
  /\ app \in {"up", "rustDown", "down", "startFailed"}
  /\ restarts \in 0..MaxRestarts

\* ARCH architecture.md (removal drains before tombstoning): a runtime is
\* never closed while a lease on it is held. Shutdown is excluded.
RuntimeOpenWhileLeased ==
  app = "up" => \A t \in Turns : jsHeld[t] => rt = "open"

\* The key promise: provider access is never released while the native turn
\* using it runs. An action property, so it constrains the release itself.
AccessKeptWhileTurnRuns ==
  [][\A t \in Turns :
       (jsHeld[t] /\ nat[t] = "running" /\ nat'[t] = "running") => jsHeld'[t]]_vars

\* Stronger: a native turn runs only under held access, which also rules out
\* a claim of access that was already released. Shutdown is excluded.
LeaseHeldWhileTurnRuns ==
  app = "up" => \A t \in Turns : nat[t] = "running" => jsHeld[t]

\* Consequence: the runtime is never closed under a turn still running on
\* it. Shutdown is excluded.
RuntimeOpenWhileTurnRuns ==
  app = "up" => \A t \in Turns : nat[t] = "running" => rt = "open"

\* Same, including shutdown (informational: IDX:392-396 closes the PDS and
\* the harness host in parallel).
RuntimeOpenWhileTurnRunsAlways ==
  \A t \in Turns : nat[t] = "running" => rt = "open"

\* CODE HH:1087: no host timer targets the access of a running turn. (Before
\* HostReleasesOnSettle this read "only an admitted lease carries a timer":
\* the host now retries a settled release on its own timer by design.)
NoTimerOnClaimedAccess ==
  \A t \in Turns : hTimer[t] => hl[t] /= "claimed"

\* PROV-004 (per-turn force-stop): only a cancelled turn is ever
\* force-stopped, so a turn nobody cancelled, such as a healthy sibling, is
\* never stopped.
OnlyCancelledTurnsForceStopped ==
  \A t \in Turns : nat[t] = "forced" => abort[t]

\* PROV-003 (restart finishes a removal) + startup isolation (PDS reconcileStartup):
\* the app always starts.
StartupSucceeds == app /= "startFailed"

-----------------------------------------------------------------------------
(* Liveness. Each is conditioned on the app staying up, because quitting   *)
(* and restarting are user actions and PROV-003 asks for no restart.       *)

Quiet == \A t \in Turns : nat[t] /= "running"

\* PROV-003: once nothing is actually running, removal_pending becomes
\* tombstoned without a restart.
RemovalCompletes ==
  (rLife = "removal_pending" /\ Quiet /\ app = "up")
    ~> (rLife = "tombstoned" \/ app /= "up")

\* DRAFT PROV-003: once nothing runs and no attempt is left running,
\* removal_pending becomes tombstoned without a restart. This separates the
\* finalize retry from attempts that stay running (findings C and E).
DrainedRemovalCompletes ==
  (rLife = "removal_pending" /\ Quiet /\ ~RustRunning /\ app = "up")
    ~> (rLife = "tombstoned" \/ app /= "up")

\* DRAFT PROV-003 + PROV-004 with a hung harness: removal completes even if
\* a native turn never ends (PROV-004's "Stop turns and remove", not built).
RemovalCompletesEvenIfHung ==
  (rLife = "removal_pending" /\ app = "up")
    ~> (rLife = "tombstoned" \/ app /= "up")

\* Brief: no lease leak. Every PDS lease is eventually released.
LeaseEventuallyReleased ==
  \A t \in Turns : (jsHeld[t] /\ app = "up") ~> (~jsHeld[t] \/ app /= "up")

\* PROV-003 (the durable record is the drain authority): once a turn's
\* native work has ended, its attempt eventually stops holding P. It becomes
\* terminal, or the end of the wait is recorded while its outcome awaits
\* reconciliation. A running attempt blocks the tombstone (CAT:206-218).
AttemptEndsAfterTurn ==
  \A t \in Turns :
    (att[t] = "running" /\ nat[t] \in {"done", "forced"} /\ app = "up")
      ~> (att[t] \in {"terminal", "ended"} \/ app /= "up")

\* PROV-004: a cancelled turn's access is eventually released, even if its
\* native turn ignores the cancellation (through the per-turn force-stop).
CancelledAccessEventuallyReleased ==
  \A t \in Turns :
    (abort[t] /\ jsHeld[t] /\ app = "up") ~> (~jsHeld[t] \/ app /= "up")

\* ARCH architecture.md (one lease-debt reconciliation worker): every
\* terminal lease debt is eventually reconciled.
DebtEventuallyReconciled ==
  \A t \in Turns : (Debt(t) /\ app = "up") ~> (~Debt(t) \/ app /= "up")

\* Model-level check that a failed start cannot heal itself: once startup
\* fails, every later restart fails too (nothing can run the thread view
\* that would terminalize the quarantined attempt, since no window opens).
StartFailedIsPermanent == [](app = "startFailed" => [](app = "startFailed"))

=============================================================================
