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
(* One provider P. Each turn t is one Rust interaction execution task with *)
(* at most one attempt and one execution lease, on its own thread (so its  *)
(* own harness session). The harness host runs in Electron main, so       *)
(* harness -> broker -> PDS calls are in-process; Rust reaches the harness *)
(* over HTTP (RT:1067-1215). The PDS #serialized queue makes each PDS      *)
(* operation below one atomic step (acquire, release+finalize,             *)
(* acknowledge+finalize, remove).                                          *)
(***************************************************************************)
EXTENDS Naturals, FiniteSets

CONSTANTS
  Turns,              \* concurrent turns on provider P
  MaxRestarts,        \* bound on app restarts
  \* --- faults ---
  AdmissionTimeout,   \* HH:853/918 30 s admission timer may fire before the claim
  RustCanAbandon,     \* Rust stops waiting on /complete while the harness still runs
  PersistCanFail,     \* Rust terminal persistence fails (record_reconciliation_pending)
  StartupQuarantine,  \* startup reconciliation quarantines an interrupted submitted input
  HarnessCanHang,     \* a native turn may ignore cancellation (no fairness on NatEnd)
  \* --- fixes (TRUE once landed) ---
  HostReleasesOnSettle,  \* HH:1186-1188, 973-982: the host releases access as soon as
                         \* the native turn ends and keeps the entry until the owner's
                         \* release; an owner release of a running turn cancels it
                         \* instead (HH:958-965)
  ClaimRejectsReleasing, \* HH:1115: no claim once a release was decided
                         \* (releaseRequested, set at HH:966, 1012, 1359)
  AckRetriesFinalize,    \* PDS:760-783: a finalize the store refuses as
                         \* drain-incomplete returns false instead of throwing
                         \* (RAS:392); the owner's acknowledgement
                         \* (HH:1003-1006 -> PDS:633-635) retries it
  QuarantineSettleWakesReconciler \* THR:1185-1197: settling a quarantined
                         \* interaction wakes the lease reconciler

Lives == {"active", "removal_pending", "tombstoned"}

VARIABLES
  \* --- durable Rust SQLite (survives restart) ---
  rLife,     \* model_providers.lifecycle_state for P
  att,       \* t -> none | running | terminal   (interaction_attempts.outcome)
  quar,      \* t -> no | ordinary | submitted  ("Canonical reconciliation pending")
  acked,     \* t -> execution_lease_reconciled_at IS NOT NULL
  \* --- Rust in-memory ---
  rpc,       \* t -> Rust execution task program counter
  wake,      \* reconciler Notify permit (AS:504-536)
  wBusy,     \* reconciler worker is scanning debt (AS:541-580)
  \* --- Electron main: provider definition service ---
  jLife,     \* this.definitions[P].lifecycleState
  jsHeld,    \* t -> PDS lease for t counted in activeExecutions (PDS:608-637)
  rt,        \* P's runtime in this.runtimes: none | open | closed
  pClosed,   \* PDS close() ran
  \* --- Electron main: harness host ---
  hl,        \* t -> pendingExecutionAccess entry state:
             \*      none | admitted | claimed | settled | released | awaiting
             \*      (awaiting is the state before HostReleasesOnSettle)
  hRel,      \* t -> a host-initiated release promise is in flight
  hTimer,    \* t -> a release timer is armed (HH:1008-1020)
  hReq,      \* t -> releaseRequested: a release was decided
  hOwn,      \* t -> ownerReleased: the owner's release arrived
  abort,     \* t -> the completion's AbortController has fired
  nat,       \* t -> native harness turn using the provider runtime
  hClosed,   \* harness host closed flag (HH:1305)
  \* --- process ---
  app,       \* up | rustDown | down | startFailed
  restarts

vars == <<rLife, att, quar, acked, rpc, wake, wBusy, jLife, jsHeld, rt,
          pClosed, hl, hRel, hTimer, hReq, hOwn, abort, nat, hClosed, app,
          restarts>>
hostVars == <<hl, hRel, hTimer, hReq, hOwn, abort>>

Count == Cardinality({u \in Turns : jsHeld[u]})
RustRunning == \E u \in Turns : att[u] = "running"
Debt(t) == att[t] = "terminal" /\ ~acked[t]      \* AT:311-345

Init ==
  /\ rLife = "active" /\ jLife = "active"
  /\ att = [t \in Turns |-> "none"]
  /\ quar = [t \in Turns |-> "no"]
  /\ acked = [t \in Turns |-> FALSE]
  /\ rpc = [t \in Turns |-> "idle"]
  /\ wake = TRUE /\ wBusy = FALSE            \* AS:814-815 schedules at open
  /\ jsHeld = [t \in Turns |-> FALSE]
  /\ rt = "open" /\ pClosed = FALSE          \* PC:81-83 activate()
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
(* #finalizeRemoval (PDS:760-783): definitionStore.save PUTs the tombstone *)
(* to Rust, and sync_provider_definitions rejects it with                  *)
(* provider_execution_drain_incomplete while any attempt on P is           *)
(* outcome='running' (CAT:190-199). Only after the tombstone commits is    *)
(* the runtime closed. With AckRetriesFinalize the refusal returns false   *)
(* and P stays removal_pending; before it, the refusal was thrown.         *)
FinalizeOk == app = "up" /\ ~RustRunning
Tombstone ==
  /\ rLife' = "tombstoned" /\ jLife' = "tombstoned"
  /\ rt' = IF rt = "open" THEN "closed" ELSE rt

(* A PDS release (PDS:621-630, via releaseHeldExecutionAccess HH:2731 and  *)
(* the broker's onceRelease RTB:173-185) sets released=true, drops the     *)
(* count, and then finalizes if the count is zero and P is removal_pending *)
(* (#finalizeDrainedRemoval, PDS:748-753). A retried release is a no-op.   *)
(* An acknowledgement (PDS:633-635) runs the same drained-removal finalize *)
(* again; before AckRetriesFinalize the lease had no acknowledge and the   *)
(* host's `acknowledge?.()` did nothing.                                   *)
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

(* After a release promise resolves (HH:984-1000): the entry becomes       *)
(* "released" and, if the owner already released it, is acknowledged and  *)
(* forgotten (HH:978-980, 1014-1016). A failed release clears the promise  *)
(* and re-arms a 30 s retry unless the host is closed (HH:994-998). Before *)
(* HostReleasesOnSettle, a release deleted the entry at once.              *)
AfterRelease(t, ack) ==
  IF RelThrows(t, TRUE)
  THEN /\ hTimer' = [hTimer EXCEPT ![t] = ~hClosed]
       /\ UNCHANGED hl
  ELSE /\ hl' = [hl EXCEPT ![t] =
                   IF ~HostReleasesOnSettle \/ ack THEN "none" ELSE "released"]
       /\ hTimer' = [hTimer EXCEPT ![t] = FALSE]

(* The owner's release: Rust's DELETE (RT:1198-1213) -> HH:1699-1700 ->    *)
(* releaseProviderExecution (HH:958-971). An unknown lease answers 200     *)
(* released:false, which Rust treats as success (AS:455-500). With         *)
(* HostReleasesOnSettle a claimed entry is not released: the owner         *)
(* abandons the completion (HH:963, abandon set by the claimer at          *)
(* HH:1130, 800) and gets true at once; the host releases the access when  *)
(* the native turn ends and acknowledges it then (HH:978-980). Any other   *)
(* entry is released if needed (an admitted one first marks                *)
(* releaseRequested, HH:966), acknowledged and deleted; a failed release   *)
(* or acknowledgement is thrown back to Rust, whose worker retries. Before *)
(* the fix it released any entry, including a running turn's.              *)
Abandons(t) == HostReleasesOnSettle /\ hl[t] = "claimed"
OwnerRel(t) == hl[t] \in {"admitted", "settled", "claimed", "awaiting"}
OwnerReleaseFails(t) == hl[t] /= "none" /\ ~Abandons(t) /\ RelThrows(t, OwnerRel(t))

OwnerRelease(t) ==
  IF hl[t] = "none"
  THEN UNCHANGED <<jsHeld, rLife, jLife, rt, hl, hTimer, hReq, hOwn, abort>>
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
(* Rust execution task (EX:180-1048).                                     *)

(* Rust resolves the plan against SQLite (provider active), then POSTs     *)
(* execution-leases (RT:1067-1140) -> admitModelPlanExecution (HH:866-946) *)
(* -> broker.acquire (RTB:187-230) -> acquireExecution (PDS:608-637),      *)
(* which checks only the JS lifecycle; #runtimeFor opens a runtime if none *)
(* is registered. The host arms the 30 s admission timer (HH:918).         *)
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

(* begin_interaction_attempt (AT:116, EX:309-380) re-resolves the plan in  *)
(* one SQLite transaction and inserts outcome='running' with the lease id. *)
(* If P is no longer admissible, EX:355-380 records a terminal admission-  *)
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

(* complete_prepared POSTs /complete with executionLeaseId (RT:846-930)   *)
(* -> host.complete -> runCompletion (HH:745-830) -> executeCompletion,   *)
(* which claims the entry only if state = "admitted" (HH:1113-1133) and,  *)
(* with ClaimRejectsReleasing, only if no release was ever decided for it *)
(* (HH:1115). Before that fix a release already in flight did not stop    *)
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

(* The native turn ends (HH:1178 `await native` resolves or rejects). With *)
(* HostReleasesOnSettle, executeCompletion's finally moves the entry its   *)
(* completion claimed to settled and starts its release at once            *)
(* (HH:1186-1188, 973-982), before the response reaches Rust. Before the   *)
(* fix it moved it to awaiting-terminal with no timer and waited for       *)
(* Rust's DELETE.                                                          *)
NatEnd(t) ==
  /\ nat[t] = "running"
  /\ nat' = [nat EXCEPT ![t] = "done"]
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

(* Rust stops waiting while the harness is still running: the approval    *)
(* reconciliation failure path cancels, waits 2 s, and breaks with Err     *)
(* (EX:510-536), or the /complete HTTP request fails (RT:900-930; no      *)
(* request timeout). The cancel (HH:1273-1285) or the dropped request      *)
(* (HH:1766) aborts the completion, but the native turn unwinds on its     *)
(* own schedule. Nothing forces it to stop: a per-turn force-stop is not   *)
(* built.                                                                  *)
GiveUp(t) ==
  /\ RustCanAbandon /\ app = "up"
  /\ rpc[t] = "waiting" /\ nat[t] = "running"
  /\ rpc' = [rpc EXCEPT ![t] = "result"]
  /\ abort' = [abort EXCEPT ![t] = TRUE]
  /\ UNCHANGED <<rLife, att, quar, acked, wake, wBusy, jLife, jsHeld, rt,
                 pClosed, hl, hRel, hTimer, hReq, hOwn, nat, hClosed, app,
                 restarts>>

(* Rust persists the terminal attempt (fail EX:595-619, accept EX:640-659) *)
(* and then releases (release_terminal_admission EX:1083-1098). On a       *)
(* persistence or canonical-read failure it calls                          *)
(* record_reconciliation_pending (EX:1051-1081), which fails only the      *)
(* interaction and leaves the attempt 'running' (INT:884-903), or just    *)
(* logs; either way it returns without a release. A submitted-input        *)
(* interaction in that state is "quarantined".                             *)
Persist(t, ok) ==
  /\ app = "up" /\ rpc[t] = "result"
  /\ IF ok
     THEN /\ att' = [att EXCEPT ![t] = IF att[t] = "running" THEN "terminal" ELSE att[t]]
          /\ rpc' = [rpc EXCEPT ![t] = "release"]
          /\ UNCHANGED quar
     ELSE /\ PersistCanFail
          /\ rpc' = [rpc EXCEPT ![t] = "done"]
          /\ \E q \in {"ordinary", "submitted"} : quar' = [quar EXCEPT ![t] = q]
          /\ UNCHANGED att
  /\ UNCHANGED <<rLife, acked, wake, wBusy, jLife, jsHeld, rt, pClosed,
                 hostVars, nat, hClosed, app, restarts>>

(* release_terminal_admission -> reconcile_terminal_execution_lease        *)
(* (AS:455-500): read debt (terminal attempts only), DELETE the lease,     *)
(* acknowledge. On failure it wakes the one reconciler (EX:1094-1097).     *)
(* Abstraction: the DELETE waits out a release already in flight           *)
(* (HH:989 `??=`).                                                         *)
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
(* The single lease-debt reconciler (AS:502-580). It wakes on a Notify    *)
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
(* Host release timers (releaseAfter, HH:1008-1020). The admission timer   *)
(* fires only if AdmissionTimeout (the claim came 30 s late) or no claim   *)
(* is coming. A retry timer re-armed after a failed release always fires.  *)
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

-----------------------------------------------------------------------------
(* User actions.                                                          *)

(* remove (PDS:725-746): save removal_pending (CAT:176-187: guards only    *)
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
(* (reconcile_quarantined_interaction, THR:1185-1197) with                 *)
(* finalize_quarantined_submitted_input_failure (INT:169-200) or           *)
(* recover_interaction_accepted, both of which terminalize the attempt.   *)
(* Two readers call it: the thread view (refresh_accepted_outputs,         *)
(* THR:1109-1140) and an invoke action's destination (THR:1067-1074).      *)
(* Neither releases the lease; with QuarantineSettleWakesReconciler the    *)
(* settle wakes the reconciler, which owns the new lease debt.             *)
ReadQuarantined(t) ==
  /\ app = "up" /\ quar[t] = "submitted" /\ att[t] = "running"
  /\ att' = [att EXCEPT ![t] = "terminal"]
  /\ quar' = [quar EXCEPT ![t] = "no"]
  /\ wake' = (wake \/ QuarantineSettleWakesReconciler)
  /\ UNCHANGED <<rLife, acked, rpc, wBusy, jLife, jsHeld, rt, pClosed,
                 hostVars, nat, hClosed, app, restarts>>

-----------------------------------------------------------------------------
(* Quit (IDX:366-393): productServer.close() first, so every Rust task and *)
(* the reconciler die; then provider composition close and GraphComplete   *)
(* runtime close run in parallel.                                          *)
ShutdownBegin ==
  /\ app = "up"
  /\ app' = "rustDown"
  /\ rpc' = [t \in Turns |-> IF rpc[t] = "idle" THEN "idle" ELSE "done"]
  /\ wake' = FALSE /\ wBusy' = FALSE
  /\ UNCHANGED <<rLife, att, quar, acked, jLife, jsHeld, rt, pClosed, hostVars,
                 nat, hClosed, restarts>>

(* Harness host close (HH:1303-1368): sets closed and aborts active        *)
(* completions; waits at most 5 s per session; then releases "admitted"   *)
(* and, with HostReleasesOnSettle, "settled" entries without              *)
(* acknowledging them (HH:1356-1367). Claimed entries stay held until     *)
(* their native turn ends.                                                 *)
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

(* PDS close() (PDS:805-819) closes every runtime, ignoring leases.       *)
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
(* interrupted submitted input on a retryable error (AS:720-740,          *)
(* INT:141-163); then recover_interrupted_interactions (AS:793, INT:44-88) *)
(* fails every running attempt EXCEPT quarantined submitted inputs; the    *)
(* reconciler is scheduled (AS:814-815). Then provider composition start   *)
(* (PC:81-83, IDX:554) runs reconcileStartup (PDS:785-803), which          *)
(* finalizes every removal_pending definition. A refused finalize threw    *)
(* and quit the app before the window opened (IDX:597, 608-611); with     *)
(* AckRetriesFinalize it returns false and P stays removal_pending. All    *)
(* harness and PDS memory is fresh, so no host entry is left to           *)
(* acknowledge a later release.                                            *)
Restart(Q) ==
  /\ app \in {"down", "startFailed"} /\ restarts < MaxRestarts
  /\ Q \subseteq {t \in Turns : att[t] = "running" /\ quar[t] = "no"}
  /\ StartupQuarantine \/ Q = {}
  /\ LET keep(t) == att[t] = "running" /\ (quar[t] = "submitted" \/ t \in Q)
         att2 == [t \in Turns |->
                    IF att[t] = "running" /\ ~keep(t) THEN "terminal" ELSE att[t]]
         running2 == \E t \in Turns : att2[t] = "running"
         fail == rLife = "removal_pending" /\ running2 /\ ~AckRetriesFinalize
         life2 == IF rLife = "removal_pending" /\ ~running2 THEN "tombstoned" ELSE rLife
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
       \/ \E ok \in BOOLEAN : Persist(t, ok)
       \/ InlineRelease(t) \/ WorkerTry(t)
       \/ TimerFire(t) \/ ReleaseDone(t) \/ HostCloseRelease(t)
       \/ ReadQuarantined(t)
  \/ WorkerWake \/ WorkerIdle \/ Remove
  \/ ShutdownBegin \/ HostCloseStart \/ PdsClose \/ ShutdownDone
  \/ \E Q \in SUBSET Turns : Restart(Q)

(* Fairness: the code guarantees the Rust task, host timers and release   *)
(* promises, the reconciler, and a begun shutdown keep running. User       *)
(* actions (Admit, Remove, reading a quarantined input, quit, restart) and *)
(* the Rust give-up are not fair. NatEnd is fair unless HarnessCanHang.    *)
Fairness ==
  /\ \A t \in Turns :
       /\ WF_vars(Begin(t)) /\ WF_vars(Claim(t))
       /\ WF_vars(\E ok \in BOOLEAN : Persist(t, ok))
       /\ WF_vars(InlineRelease(t))
       /\ WF_vars(TimerFire(t)) /\ WF_vars(ReleaseDone(t))
       /\ WF_vars(HostCloseRelease(t))
       /\ (~HarnessCanHang => WF_vars(NatEnd(t)))
  /\ WF_vars(WorkerWake) /\ WF_vars(\E t \in Turns : WorkerTry(t))
  /\ WF_vars(WorkerIdle)
  /\ WF_vars(HostCloseStart) /\ WF_vars(PdsClose) /\ WF_vars(ShutdownDone)

Spec == Init /\ [][Next]_vars
FairSpec == Spec /\ Fairness

-----------------------------------------------------------------------------
(* Invariants.                                                            *)

TypeOK ==
  /\ rLife \in Lives /\ jLife \in Lives
  /\ att \in [Turns -> {"none", "running", "terminal"}]
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
  /\ nat \in [Turns -> {"none", "running", "done"}]
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

\* Same, including shutdown (informational: IDX:386-390 closes the PDS and
\* the harness host in parallel).
RuntimeOpenWhileTurnRunsAlways ==
  \A t \in Turns : nat[t] = "running" => rt = "open"

\* CODE HH:1011: no host timer targets the access of a running turn. (Before
\* HostReleasesOnSettle this read "only an admitted lease carries a timer":
\* the host now retries a settled release on its own timer by design.)
NoTimerOnClaimedAccess ==
  \A t \in Turns : hTimer[t] => hl[t] /= "claimed"

\* DRAFT PROV-003 (restart finishes a removal) + CODE PC:81-83 (startup
\* assumes reconcileStartup succeeds): the app always starts.
StartupSucceeds == app /= "startFailed"

-----------------------------------------------------------------------------
(* Liveness. Each is conditioned on the app staying up, because quitting   *)
(* and restarting are user actions and PROV-003 asks for no restart.       *)

Quiet == \A t \in Turns : nat[t] /= "running"

\* DRAFT PROV-003: once nothing is actually running, removal_pending becomes
\* tombstoned without a restart.
RemovalCompletes ==
  (rLife = "removal_pending" /\ Quiet /\ app = "up")
    ~> (rLife = "tombstoned" \/ app /= "up")

\* DRAFT PROV-003 + PROV-004 with a hung harness: removal completes even if
\* a native turn never ends (PROV-004's "Stop turns and remove", not built).
RemovalCompletesEvenIfHung ==
  (rLife = "removal_pending" /\ app = "up")
    ~> (rLife = "tombstoned" \/ app /= "up")

\* Brief: no lease leak. Every PDS lease is eventually released.
LeaseEventuallyReleased ==
  \A t \in Turns : (jsHeld[t] /\ app = "up") ~> (~jsHeld[t] \/ app /= "up")

\* DRAFT PROV-003 (the durable record is the drain authority): once a turn's
\* native work has ended, its attempt eventually becomes terminal. A running
\* attempt blocks the tombstone (CAT:190-199).
AttemptSettlesAfterTurn ==
  \A t \in Turns :
    (att[t] = "running" /\ nat[t] = "done" /\ app = "up")
      ~> (att[t] = "terminal" \/ app /= "up")

\* A cancelled turn's access is eventually released, even if its native
\* turn ignores the cancellation.
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
