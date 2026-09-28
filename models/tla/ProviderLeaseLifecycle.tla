------------------------ MODULE ProviderLeaseLifecycle ------------------------
(***************************************************************************)
(* One managed-login provider P where the provider lifecycle (sign-out,   *)
(* reconnect, cancel, complete, remove, close) meets one execution lease,  *)
(* the catalog refresh and the connection generation.                     *)
(*                                                                         *)
(*   PDS = desktop/main/providers/provider-definition-service.mjs          *)
(*   PC  = desktop/main/providers/provider-composition.mjs                 *)
(*   MCS = desktop/main/models/model-catalog-service.mjs                   *)
(*   RTB = desktop/main/services/graphcomplete-runtime.mjs (lease broker)  *)
(*   CAT = crates/relayer-app-server/src/storage/sqlite/catalog.rs         *)
(*                                                                         *)
(* Abstractions. The provider queue (#serialized) is a lock. A serialized *)
(* operation is one atomic step, except a lease that starts a runtime:    *)
(* it holds the queue across #runtimeFor's awaits (turn = "creating"),    *)
(* which close() does not wait for. The provider home (CODEX_HOME,        *)
(* CLAUDE_CONFIG_DIR) is one boolean `auth`: it holds a login.            *)
(* removeRuntimeState wipes it. The app server's readiness for P is one   *)
(* boolean `ready`: connected with eligible models. One turn; Rust admits *)
(* it only while P reads ready (PROV-006). Its lease is acquireExecution  *)
(* plus the broker's executionAccess, which needs a login.                *)
(***************************************************************************)
EXTENDS Naturals, FiniteSets

CONSTANTS MaxRt,          \* runtime objects that may be created
          MaxGen,         \* bound on the app server's connection generation
          SignOutPublishCanFail,    \* fault: sign-out's publish fails and is only logged
          ReconnectAnswerCanBeLost, \* fault: a reconnect's publish gets no answer, whether or
                                    \* not it committed, and reading the generation (at the
                                    \* reconnect's start or back after the publish) may fail
          \* Fixes, all landed. Each -reverted check turns one off.
          LeaseWaitsForReconnect,   \* acquireExecution refuses while a reconnect is pending
          CancelSparesLease,        \* a settling reconnect never closes or wipes a leased runtime
          ShutdownRefusesLeases,    \* acquireExecution refuses once close() began, and a
                                    \* runtime that finishes starting after it is closed
          RefreshSkipsPendingReconnect, \* no refresh runs or publishes during a reconnect
          LostReconnectAdopted,     \* a reconnect whose answer was lost reads the generation
                                    \* back, and keeps the login unless it was refused
          AdoptChecksBaseline       \* it adopts only one step past a baseline it read, and
                                    \* never after a sign-out superseded it

VARIABLES
  life,     \* active | removal_pending | tombstoned        (app server row)
  gen,      \* app server connection generation             (CAT)
  jsGen,    \* generation desktop main knows                (PDS connectionGeneration)
  ready,    \* app server says P is connected and ready
  auth,     \* provider home holds a login
  rmap,     \* runtime in this.runtimes, 0 = none
  rtState,  \* runtime -> unused | starting | open | closed
  pend,     \* pending reconnect: [on, rt, g, created, known, superseded]
  turn,     \* none | admitted | creating | held  (Rust admitted; JS lease held)
  leaseRt,  \* the runtime the turn is starting or holds
  underLease, \* a held lease's runtime was closed or its home wiped
  closing, closed,
  badAdopt,  \* ghost: a reconnect the app server did not commit was adopted
  wipedCommit \* ghost: a reconnect the app server committed was settled and wiped

vars == <<life, gen, jsGen, ready, auth, rmap, rtState, pend, turn, leaseRt,
          underLease, closing, closed, badAdopt, wipedCommit>>

Rts == 1..MaxRt
NoPend == [on |-> FALSE, rt |-> 0, g |-> 0, created |-> FALSE, known |-> FALSE,
           superseded |-> FALSE, doubtful |-> FALSE]

Init ==
  /\ life = "active" /\ gen = 1 /\ jsGen = 1 /\ ready = TRUE /\ auth = TRUE
  /\ rmap = 1 /\ rtState = [r \in Rts |-> IF r = 1 THEN "open" ELSE "unused"]
  /\ pend = NoPend /\ turn = "none" /\ leaseRt = 0 /\ underLease = FALSE
  /\ closing = FALSE /\ closed = FALSE /\ badAdopt = FALSE /\ wipedCommit = FALSE

FreshRt == CHOOSE r \in Rts : rtState[r] = "unused"
CanCreate == \E r \in Rts : rtState[r] = "unused"
\* A lease starting its runtime holds the provider queue.
QueueFree == turn /= "creating"

\* Closing runtime r, or wiping the home, while the held lease uses it.
Harm(r, wipe) == underLease' = (underLease \/ (turn = "held" /\ (leaseRt = r \/ wipe)))
\* (Only CancelEffect wipes; Finalize runs with no lease held.)

\* --- Rust admits the turn while it reads ready (PROV-006, service admission).
RustAdmit ==
  /\ turn = "none" /\ ready /\ life = "active" /\ ~closed
  /\ turn' = "admitted"
  /\ UNCHANGED <<life, gen, jsGen, ready, auth, rmap, rtState, pend, leaseRt,
                 underLease, closing, closed>>
  /\ UNCHANGED <<badAdopt, wipedCommit>>

\* --- The harness asks the broker (RTB acquire) -> PDS acquireExecution. With
\* a registered runtime the lease is granted at once, and the broker then asks
\* executionAccess, which needs a login. Otherwise #runtimeFor starts one.
Acquire ==
  /\ turn = "admitted" /\ QueueFree
  /\ IF \/ life /= "active"
        \/ (LeaseWaitsForReconnect /\ pend.on)
        \/ (ShutdownRefusesLeases /\ closing)
     THEN /\ turn' = "none" /\ UNCHANGED <<rmap, rtState, leaseRt>>
     ELSE IF rmap = 0 THEN
        /\ CanCreate
        /\ LET r == FreshRt IN
           /\ rtState' = [rtState EXCEPT ![r] = "starting"]
           /\ turn' = "creating" /\ leaseRt' = r
           /\ UNCHANGED rmap
     ELSE
        /\ IF auth /\ rtState[rmap] = "open" THEN turn' = "held" /\ leaseRt' = rmap
           ELSE turn' = "none" /\ leaseRt' = 0
        /\ UNCHANGED <<rmap, rtState>>
  /\ UNCHANGED <<life, gen, jsGen, ready, auth, pend, underLease, closing, closed>>
  /\ UNCHANGED <<badAdopt, wipedCommit>>

\* --- #runtimeFor registers the runtime after onRuntimeReady. With the fix, a
\* runtime that finishes starting after close() began is closed instead.
AcquireRegistered ==
  /\ turn = "creating"
  /\ IF ShutdownRefusesLeases /\ closing
     THEN /\ rtState' = [rtState EXCEPT ![leaseRt] = "closed"]
          /\ turn' = "none" /\ leaseRt' = 0
          /\ UNCHANGED rmap
     ELSE /\ rmap' = leaseRt /\ rtState' = [rtState EXCEPT ![leaseRt] = "open"]
          /\ IF auth THEN turn' = "held" /\ UNCHANGED leaseRt
             ELSE turn' = "none" /\ leaseRt' = 0
  /\ UNCHANGED <<life, gen, jsGen, ready, auth, pend, underLease, closing, closed>>
  /\ UNCHANGED <<badAdopt, wipedCommit>>

\* --- PDS #finalizeRemoval (the store accepts: the attempt is terminal).
Finalize ==
  /\ life' = "tombstoned" /\ gen' = gen + 1 /\ ready' = FALSE /\ auth' = FALSE
  /\ rmap' = 0
  /\ rtState' = IF rmap /= 0 THEN [rtState EXCEPT ![rmap] = "closed"] ELSE rtState

\* --- The turn ends; the host settles and releases; release drains a removal.
Release ==
  /\ turn = "held"
  /\ turn' = "none" /\ leaseRt' = 0
  /\ IF life = "removal_pending" THEN Finalize
     ELSE UNCHANGED <<life, gen, ready, auth, rmap, rtState>>
  /\ UNCHANGED <<jsGen, pend, underLease, closing, closed>>
  /\ UNCHANGED <<badAdopt, wipedCommit>>

\* --- PDS logout. Refused while a lease is held. Publishes signed-out with the
\* next generation; a failed publish is only logged. Settings offers Sign out
\* only while P reads connected (provider-ui.js), but the service also accepts
\* it during a pending reconnect. An answered sign-out marks that reconnect
\* superseded; an unanswered one, committed or not, marks it doubtful.
Logout ==
  /\ QueueFree /\ life = "active" /\ turn /= "held" /\ ~closed /\ gen < MaxGen
  /\ auth \/ pend.on
  /\ rmap /= 0 \/ CanCreate
  /\ auth' = FALSE
  /\ \/ /\ gen' = gen + 1 /\ jsGen' = gen + 1 /\ ready' = FALSE
        /\ pend' = IF pend.on THEN [pend EXCEPT !.superseded = TRUE] ELSE pend
     \/ /\ SignOutPublishCanFail                 \* fails before it commits
        /\ UNCHANGED <<gen, jsGen, ready>>
        /\ pend' = IF pend.on THEN [pend EXCEPT !.doubtful = TRUE] ELSE pend
     \/ /\ SignOutPublishCanFail                 \* commits, but its answer is lost
        /\ gen' = gen + 1 /\ ready' = FALSE /\ UNCHANGED jsGen
        /\ pend' = IF pend.on THEN [pend EXCEPT !.doubtful = TRUE] ELSE pend
  /\ IF rmap = 0 THEN LET r == FreshRt IN rmap' = r /\ rtState' = [rtState EXCEPT ![r] = "open"]
     ELSE UNCHANGED <<rmap, rtState>>
  /\ UNCHANGED <<life, turn, leaseRt, underLease, closing, closed>>
  /\ UNCHANGED <<badAdopt, wipedCommit>>

\* --- PDS #reconnect, second serialized step. Refused while a lease is held.
\* Offered only while P reads signed out (provider-ui.js), so auth = FALSE.
Reconnect ==
  /\ QueueFree /\ life = "active" /\ turn /= "held" /\ ~pend.on /\ ~closing /\ ~auth
  /\ rmap /= 0 \/ CanCreate
  /\ LET created == rmap = 0
         r == IF created THEN FreshRt ELSE rmap
     IN /\ rmap' = r /\ rtState' = [rtState EXCEPT ![r] = "open"]
        \* resyncConnectionGeneration reads the baseline; if that read fails, the
        \* known generation stands.
        /\ \E known \in IF ReconnectAnswerCanBeLost THEN BOOLEAN ELSE {TRUE} :
             /\ jsGen' = IF known THEN gen ELSE jsGen
             /\ pend' = [on |-> TRUE, rt |-> r, g |-> jsGen', created |-> created,
                         known |-> known, superseded |-> FALSE, doubtful |-> FALSE]
  /\ UNCHANGED <<life, gen, ready, auth, turn, leaseRt, underLease, closing, closed>>
  /\ UNCHANGED <<badAdopt, wipedCommit>>

\* --- The user finishes the browser sign-in.
SignIn ==
  /\ pend.on /\ ~auth
  /\ auth' = TRUE
  /\ UNCHANGED <<life, gen, jsGen, ready, rmap, rtState, pend, turn, leaseRt,
                 underLease, closing, closed>>
  /\ UNCHANGED <<badAdopt, wipedCommit>>

\* --- PDS #cancelPendingConnection, reconnect branch. It closes the runtime
\* and wipes the home. A reconnect that reused the live runtime starts a
\* fresh one in its place (F4). With the fix, a runtime a lease holds is
\* never closed or wiped; only the entry goes.
CancelEffect ==
  /\ pend' = NoPend
  /\ IF CancelSparesLease /\ turn = "held"
     THEN UNCHANGED <<auth, rmap, rtState, underLease>>
     ELSE
       /\ auth' = FALSE
       /\ LET r0 == pend.rt
              closedMap == [rtState EXCEPT ![r0] = "closed"]
          IN IF ~pend.created /\ ~closing /\ life = "active" /\ \E r \in Rts : closedMap[r] = "unused"
             THEN LET r == CHOOSE x \in Rts : closedMap[x] = "unused"
                  IN rmap' = r /\ rtState' = [closedMap EXCEPT ![r] = "open"]
             ELSE /\ rmap' = IF rmap = r0 THEN 0 ELSE rmap
                  /\ rtState' = closedMap
       /\ Harm(pend.rt, TRUE)

\* The user cancels, the window is destroyed (BRW-005), or the poll gives up.
Cancel ==
  /\ QueueFree /\ pend.on
  /\ CancelEffect
  /\ UNCHANGED <<life, gen, jsGen, ready, turn, leaseRt, closing, closed>>
  /\ UNCHANGED <<badAdopt, wipedCommit>>

\* --- PDS completeConnection for a reconnect: the publish commits the catalog
\* and the next generation together.
CompleteOk ==
  /\ QueueFree /\ pend.on /\ auth /\ pend.g = gen /\ gen < MaxGen
  /\ gen' = gen + 1 /\ jsGen' = gen + 1 /\ ready' = TRUE
  /\ pend' = NoPend /\ rmap' = pend.rt
  /\ UNCHANGED <<life, auth, rtState, turn, leaseRt, underLease, closing, closed>>
  /\ UNCHANGED <<badAdopt, wipedCommit>>

\* The reconnect's publish gets no answer. The app server committed it only if
\* its generation was current. Without the fix the uncoded error settles and
\* cancels. With it (#reconnectOutcome): a reconnect a sign-out superseded is
\* refused. Otherwise the generation is read back. Unmoved, the publish never
\* committed and the reconnect settles. One step past a baseline it read, the
\* reconnect committed and is adopted. Any other advance, or a failed read, is
\* unknown: the reconnect's runtime and login are kept, and the next refresh
\* settles the state.
KeepReconnect ==
  /\ pend' = NoPend /\ rmap' = pend.rt
  /\ UNCHANGED <<auth, rtState, underLease>>

CompleteNoAnswer ==
  /\ ReconnectAnswerCanBeLost
  /\ QueueFree /\ pend.on /\ auth /\ gen < MaxGen
  /\ LET committed == pend.g = gen
         g2 == IF committed THEN gen + 1 ELSE gen
         adopt == IF AdoptChecksBaseline
                  THEN ~pend.superseded /\ ~pend.doubtful /\ pend.known /\ g2 = pend.g + 1
                  ELSE g2 > pend.g
         settle == /\ CancelEffect /\ UNCHANGED <<jsGen, badAdopt>>
                   /\ wipedCommit' = (wipedCommit \/ committed)
     IN /\ gen' = g2
        /\ ready' = (ready \/ committed)
        /\ IF ~LostReconnectAdopted \/ (AdoptChecksBaseline /\ pend.superseded)
           THEN settle
           ELSE \/ KeepReconnect /\ UNCHANGED <<jsGen, badAdopt, wipedCommit>> \* the read fails
                \/ IF g2 <= pend.g
                   THEN settle
                   ELSE /\ KeepReconnect /\ jsGen' = g2 /\ UNCHANGED wipedCommit
                        /\ badAdopt' = (badAdopt \/ (adopt /\ ~committed))
  /\ UNCHANGED <<life, turn, leaseRt, closing, closed>>

\* A refused (superseded) reconnect relearns the generation, then settles.
CompleteRefused ==
  /\ QueueFree /\ pend.on /\ auth /\ pend.g /= gen
  /\ jsGen' = gen
  /\ CancelEffect
  /\ UNCHANGED <<life, gen, ready, turn, leaseRt, closing, closed>>
  /\ UNCHANGED <<badAdopt, wipedCommit>>

\* --- MCS refresh (not serialized): discovers through the registered adapter
\* and publishes at the generation it resolved; CAT refuses a stale one, and
\* the refresh relearns it. A reconnect that reused the live runtime signs in
\* through the adapter the refresh uses. One that created its runtime never
\* replaced the recovery adapter, which reports unavailable. With the fix, a
\* refresh resolves no generation while a reconnect is pending (PDS
\* refreshGeneration via PC), so it neither runs nor publishes.
Refresh ==
  /\ life = "active" /\ rmap /= 0 /\ rtState[rmap] = "open" /\ ~closing
  /\ RefreshSkipsPendingReconnect => ~pend.on
  /\ IF jsGen = gen THEN ready' = (auth /\ ~(pend.on /\ pend.created)) /\ UNCHANGED jsGen
     ELSE jsGen' = gen /\ UNCHANGED ready
  /\ UNCHANGED <<life, gen, auth, rmap, rtState, pend, turn, leaseRt, underLease,
                 closing, closed>>
  /\ UNCHANGED <<badAdopt, wipedCommit>>

\* --- PDS remove. removal_pending drops the pending reconnect's entry only.
Remove ==
  /\ QueueFree /\ life = "active" /\ ~closed /\ gen < MaxGen
  /\ pend' = NoPend
  /\ IF turn /= "held"
       THEN Finalize /\ UNCHANGED jsGen
       ELSE /\ life' = "removal_pending" /\ gen' = gen + 1
            /\ UNCHANGED <<ready, auth, rmap, rtState, jsGen>>
  /\ UNCHANGED <<turn, leaseRt, underLease, closing, closed>>
  /\ UNCHANGED <<badAdopt, wipedCommit>>

\* --- PDS close(): waits for lifecycle tasks, not for the queue. It closes the
\* runtimes in this.runtimes and pendingConnections, not one still starting.
Close ==
  /\ ~closing
  /\ closing' = TRUE
  /\ UNCHANGED <<life, gen, jsGen, ready, auth, rmap, rtState, pend, turn, leaseRt,
                 underLease, closed>>
  /\ UNCHANGED <<badAdopt, wipedCommit>>

CloseRuntimes ==
  /\ closing /\ ~closed
  /\ closed' = TRUE
  /\ rtState' = [r \in Rts |-> IF rtState[r] = "open" THEN "closed" ELSE rtState[r]]
  /\ rmap' = 0 /\ pend' = NoPend
  /\ underLease' = (underLease \/ turn = "held")   \* shutdown: the host is closing too
  /\ UNCHANGED <<life, gen, jsGen, ready, auth, turn, leaseRt, closing>>
  /\ UNCHANGED <<badAdopt, wipedCommit>>

Next ==
  \/ RustAdmit \/ Acquire \/ AcquireRegistered \/ Release \/ Logout
  \/ Reconnect \/ SignIn \/ Cancel \/ CompleteOk \/ CompleteNoAnswer
  \/ CompleteRefused \/ Refresh \/ Remove \/ Close \/ CloseRuntimes

Spec == Init /\ [][Next]_vars
\* The host releases access when the native turn ends.
FairSpec == Spec /\ WF_vars(Release) /\ WF_vars(Acquire) /\ WF_vars(AcquireRegistered)

TypeOK ==
  /\ life \in {"active", "removal_pending", "tombstoned"}
  /\ gen \in 1..(MaxGen + 2) /\ jsGen \in 1..(MaxGen + 2)
  /\ ready \in BOOLEAN /\ auth \in BOOLEAN
  /\ rmap \in 0..MaxRt /\ rtState \in [Rts -> {"unused", "starting", "open", "closed"}]
  /\ turn \in {"none", "admitted", "creating", "held"} /\ leaseRt \in 0..MaxRt

\* PROV-004: "Remove, sign-out, and reconnect therefore never run under live
\* native work that was not force-stopped." There is no force-stop in this
\* model; shutdown is excluded because the host closes its turns.
PROV004_NoCloseUnderLease == underLease => closing

\* close() is the last owner of the runtimes: once it has finished, none is open.
CloseLeavesNoOpenRuntime == closed => \A r \in Rts : rtState[r] /= "open"

\* PROV-002 ("User actions supersede automatic ones") and PROV-006: the app
\* server never reads an active P ready while its home holds no login. A
\* failed sign-out publish breaks this by itself (known limit), so the checks
\* of this invariant turn that fault off.
ReadyMeansSignedIn == life = "active" => (ready => auth)

\* PRD: "If the reconnect advanced it, Relayer keeps the reconnect." Only a
\* reconnect the app server committed is adopted as connected.
AdoptsOnlyCommittedReconnect == ~badAdopt

\* The login of a reconnect the app server committed is never wiped: Rust
\* would read P connected with no login (the P4 finding).
CommittedReconnectKeepsLogin == ~wipedCommit

\* PROV-003: removal finishes without a restart once nothing runs.
RemovalCompletes == (life = "removal_pending") ~> (life = "tombstoned")
=============================================================================
