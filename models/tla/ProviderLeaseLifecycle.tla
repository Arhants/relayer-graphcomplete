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
          CancelPublishCanFail,     \* fault: a settling reconnect's signed-out publish fails
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
          AdoptChecksBaseline,      \* it adopts only one step past a baseline it read, and
                                    \* never after a sign-out superseded it
          CancelSignsOut,           \* a cancelled or failed reconnect commits signed-out with
                                    \* the next generation, as sign-out does
          CancelKeepsUnrecordedLogin, \* when that publish fails, or during shutdown, it keeps
                                    \* the login and runtime instead of wiping them
          AdoptTracksLostWrites     \* a lifecycle write whose answer was lost, even before
                                    \* the reconnect, makes any advance unproven until an
                                    \* answered write advances the generation

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
  wipedCommit, \* ghost: a reconnect the app server committed was settled and wiped
  cancelLeftReady, \* ghost: a settled reconnect wiped the login while Rust read P ready
  rq,       \* the catalog refresh in flight: [on, g, res]
  late,     \* a sign-out request whose answer was lost, still in flight: [on, g]
  uncertain, \* PDS unansweredLifecycleWrites has P
  nrecon,   \* ghost: reconnects started so far (bounded by MaxGen)
  overlapReadyNoLogin \* ghost: a refresh that overlapped a reconnect published ready
                      \* while the home held no login

vars == <<life, gen, jsGen, ready, auth, rmap, rtState, pend, turn, leaseRt,
          underLease, closing, closed, badAdopt, wipedCommit, cancelLeftReady, rq,
          late, uncertain, nrecon, overlapReadyNoLogin>>

Rts == 1..MaxRt
NoPend == [on |-> FALSE, rt |-> 0, g |-> 0, created |-> FALSE, known |-> FALSE,
           superseded |-> FALSE, doubtful |-> FALSE]
NoRq == [on |-> FALSE, g |-> 0, res |-> "none", n |-> 0]
NoLate == [on |-> FALSE, g |-> 0]

Init ==
  /\ life = "active" /\ gen = 1 /\ jsGen = 1 /\ ready = TRUE /\ auth = TRUE
  /\ rmap = 1 /\ rtState = [r \in Rts |-> IF r = 1 THEN "open" ELSE "unused"]
  /\ pend = NoPend /\ turn = "none" /\ leaseRt = 0 /\ underLease = FALSE
  /\ closing = FALSE /\ closed = FALSE /\ badAdopt = FALSE /\ wipedCommit = FALSE
  /\ cancelLeftReady = FALSE /\ rq = NoRq /\ late = NoLate /\ uncertain = FALSE
  /\ nrecon = 0 /\ overlapReadyNoLogin = FALSE

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
  /\ UNCHANGED <<badAdopt, wipedCommit, cancelLeftReady, rq, late, uncertain>>
  /\ UNCHANGED <<nrecon, overlapReadyNoLogin>>

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
  /\ UNCHANGED <<badAdopt, wipedCommit, cancelLeftReady, rq, late, uncertain>>
  /\ UNCHANGED <<nrecon, overlapReadyNoLogin>>

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
  /\ UNCHANGED <<badAdopt, wipedCommit, cancelLeftReady, rq, late, uncertain>>
  /\ UNCHANGED <<nrecon, overlapReadyNoLogin>>

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
  /\ UNCHANGED <<badAdopt, wipedCommit, cancelLeftReady, rq, late, uncertain>>
  /\ UNCHANGED <<nrecon, overlapReadyNoLogin>>

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
        /\ uncertain' = FALSE /\ UNCHANGED late
     \/ /\ SignOutPublishCanFail                 \* fails before it commits
        /\ UNCHANGED <<gen, jsGen, ready, late>>
        /\ pend' = IF pend.on THEN [pend EXCEPT !.doubtful = TRUE] ELSE pend
        /\ uncertain' = TRUE
     \/ /\ SignOutPublishCanFail                 \* commits, but its answer is lost
        /\ gen' = gen + 1 /\ ready' = FALSE /\ UNCHANGED <<jsGen, late>>
        /\ pend' = IF pend.on THEN [pend EXCEPT !.doubtful = TRUE] ELSE pend
        /\ uncertain' = TRUE
     \/ /\ SignOutPublishCanFail /\ ~late.on     \* answer lost; commits later (LateCommit)
        /\ UNCHANGED <<gen, jsGen, ready>>
        /\ late' = [on |-> TRUE, g |-> jsGen]
        /\ pend' = IF pend.on THEN [pend EXCEPT !.doubtful = TRUE] ELSE pend
        /\ uncertain' = TRUE
  /\ IF rmap = 0 THEN LET r == FreshRt IN rmap' = r /\ rtState' = [rtState EXCEPT ![r] = "open"]
     ELSE UNCHANGED <<rmap, rtState>>
  /\ UNCHANGED <<life, turn, leaseRt, underLease, closing, closed>>
  /\ UNCHANGED <<badAdopt, wipedCommit, cancelLeftReady, rq>>
  /\ UNCHANGED <<nrecon, overlapReadyNoLogin>>

\* The lost sign-out request reaches the app server's write. CAT applies it only
\* at the current generation; otherwise it is refused, and nobody hears.
LateCommit ==
  /\ late.on
  /\ late' = NoLate
  /\ IF late.g = gen /\ life = "active"
     THEN gen' = gen + 1 /\ ready' = FALSE
     ELSE UNCHANGED <<gen, ready>>
  /\ UNCHANGED <<life, jsGen, auth, rmap, rtState, pend, turn, leaseRt, underLease,
                 closing, closed, badAdopt, wipedCommit, cancelLeftReady, rq, uncertain>>
  /\ UNCHANGED <<nrecon, overlapReadyNoLogin>>

\* --- PDS #reconnect, second serialized step. Refused while a lease is held.
\* Offered only while P reads signed out (provider-ui.js), so auth = FALSE.
Reconnect ==
  /\ QueueFree /\ life = "active" /\ turn /= "held" /\ ~pend.on /\ ~closing /\ ~auth
  /\ gen < MaxGen /\ (rmap /= 0 \/ CanCreate)
  /\ LET created == rmap = 0
         r == IF created THEN FreshRt ELSE rmap
     IN /\ rmap' = r /\ rtState' = [rtState EXCEPT ![r] = "open"]
        \* resyncConnectionGeneration reads the baseline; if that read fails, the
        \* known generation stands.
        /\ \E known \in IF ReconnectAnswerCanBeLost THEN BOOLEAN ELSE {TRUE} :
             /\ jsGen' = IF known THEN gen ELSE jsGen
             /\ pend' = [on |-> TRUE, rt |-> r, g |-> jsGen', created |-> created,
                         known |-> known, superseded |-> FALSE,
                         doubtful |-> AdoptTracksLostWrites /\ uncertain]
  /\ UNCHANGED <<life, gen, ready, auth, turn, leaseRt, underLease, closing, closed>>
  /\ UNCHANGED <<badAdopt, wipedCommit, cancelLeftReady, rq, late, uncertain>>
  /\ nrecon < MaxGen /\ nrecon' = nrecon + 1 /\ UNCHANGED overlapReadyNoLogin

\* --- The user finishes the browser sign-in.
SignIn ==
  /\ pend.on /\ ~auth
  /\ auth' = TRUE
  /\ UNCHANGED <<life, gen, jsGen, ready, rmap, rtState, pend, turn, leaseRt,
                 underLease, closing, closed>>
  /\ UNCHANGED <<badAdopt, wipedCommit, cancelLeftReady, rq, late, uncertain>>
  /\ UNCHANGED <<nrecon, overlapReadyNoLogin>>

\* --- PDS #cancelPendingConnection, reconnect branch. g0, j0 and r0 are the
\* generation, the known generation and readiness after the calling action's
\* own step. The cancel closes the runtime and wipes the home. A reconnect
\* that reused the live runtime starts a fresh one in its place (F4). With
\* the fix, a runtime a lease holds is never closed or wiped; only the entry
\* goes. With CancelSignsOut, it first commits signed-out with the next
\* generation, relearning a stale one once, as sign-out does. u0 is whether a
\* lifecycle write is unanswered before that publish; an answered one clears it. That publish
\* can fail like sign-out's, and it is skipped once close() began. With
\* CancelKeepsUnrecordedLogin, an unrecorded cancel then keeps the login and
\* the reconnect's runtime, as an unknown reconnect outcome does.
CancelEffect(g0, j0, r0, u0) ==
  /\ pend' = NoPend
  /\ LET Wipe ==
         /\ auth' = FALSE
         /\ LET r0t == pend.rt
                closedMap == [rtState EXCEPT ![r0t] = "closed"]
            IN IF ~pend.created /\ ~closing /\ life = "active" /\ \E r \in Rts : closedMap[r] = "unused"
               THEN LET r == CHOOSE x \in Rts : closedMap[x] = "unused"
                    IN rmap' = r /\ rtState' = [closedMap EXCEPT ![r] = "open"]
               ELSE /\ rmap' = IF rmap = r0t THEN 0 ELSE rmap
                    /\ rtState' = closedMap
         /\ Harm(pend.rt, TRUE)
         \* The ghost counts a wipe that leaves the app server reading P ready.
         /\ cancelLeftReady' = (cancelLeftReady \/ ready')
       \* The login and the reconnect's runtime stay the provider's own.
       Keep == /\ rmap' = pend.rt /\ UNCHANGED <<auth, rtState, underLease, cancelLeftReady>>
     IN IF CancelSparesLease /\ turn = "held"
        THEN /\ gen' = g0 /\ jsGen' = j0 /\ ready' = r0
             /\ uncertain' = u0
             /\ UNCHANGED <<auth, rmap, rtState, underLease, cancelLeftReady>>
        ELSE
          \/ /\ CancelSignsOut /\ ~closing          \* signed-out recorded
             /\ gen' = g0 + 1 /\ jsGen' = g0 + 1 /\ ready' = FALSE
             /\ uncertain' = FALSE
             /\ Wipe
          \/ /\ ~CancelSignsOut \/ closing \/ CancelPublishCanFail   \* not recorded
             /\ gen' = g0 /\ jsGen' = j0 /\ ready' = r0
             \* A publish attempted without an answer leaves a write in doubt; this model
             \* makes that failure happen before the commit.
             /\ uncertain' = (u0 \/ (CancelSignsOut /\ ~closing))
             /\ IF CancelSignsOut /\ CancelKeepsUnrecordedLogin THEN Keep ELSE Wipe

\* The user cancels, the window is destroyed (BRW-005), or the poll gives up.
Cancel ==
  /\ QueueFree /\ pend.on
  /\ CancelEffect(gen, jsGen, ready, uncertain)
  /\ UNCHANGED <<life, turn, leaseRt, closing, closed, badAdopt, wipedCommit, rq, late>>
  /\ UNCHANGED <<nrecon, overlapReadyNoLogin>>

\* --- PDS completeConnection for a reconnect: the publish commits the catalog
\* and the next generation together.
CompleteOk ==
  /\ QueueFree /\ pend.on /\ auth /\ pend.g = gen /\ gen < MaxGen
  /\ gen' = gen + 1 /\ jsGen' = gen + 1 /\ ready' = TRUE
  /\ pend' = NoPend /\ rmap' = pend.rt /\ uncertain' = FALSE
  /\ UNCHANGED <<life, auth, rtState, turn, leaseRt, underLease, closing, closed>>
  /\ UNCHANGED <<badAdopt, wipedCommit, cancelLeftReady, rq, late>>
  /\ UNCHANGED <<nrecon, overlapReadyNoLogin>>

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
  /\ UNCHANGED <<auth, rtState, underLease, cancelLeftReady>>

CompleteNoAnswer ==
  /\ ReconnectAnswerCanBeLost
  /\ QueueFree /\ pend.on /\ auth /\ gen < MaxGen
  /\ LET committed == pend.g = gen
         g2 == IF committed THEN gen + 1 ELSE gen
         r2 == ready \/ committed
         adopt == IF AdoptChecksBaseline
                  THEN ~pend.superseded /\ ~pend.doubtful /\ pend.known /\ g2 = pend.g + 1
                  ELSE g2 > pend.g
         \* The reconnect's own publish went unanswered (PDS unansweredLifecycleWrites).
         settle == /\ CancelEffect(g2, jsGen, r2, TRUE) /\ UNCHANGED badAdopt
                   /\ wipedCommit' = (wipedCommit \/ committed)
         keep(j) == /\ KeepReconnect /\ gen' = g2 /\ ready' = r2 /\ jsGen' = j
                    /\ uncertain' = TRUE
     IN IF ~LostReconnectAdopted \/ (AdoptChecksBaseline /\ pend.superseded)
        THEN settle
        ELSE \/ keep(jsGen) /\ UNCHANGED <<badAdopt, wipedCommit>>   \* the read fails
             \/ IF g2 <= pend.g
                THEN settle
                ELSE /\ keep(g2) /\ UNCHANGED wipedCommit
                     /\ badAdopt' = (badAdopt \/ (adopt /\ ~committed))
  /\ UNCHANGED <<life, turn, leaseRt, closing, closed, rq, late>>
  /\ UNCHANGED <<nrecon, overlapReadyNoLogin>>

\* A refused (superseded) reconnect relearns the generation, then settles.
CompleteRefused ==
  /\ QueueFree /\ pend.on /\ auth /\ pend.g /= gen
  /\ CancelEffect(gen, gen, ready, uncertain)
  /\ UNCHANGED <<life, turn, leaseRt, closing, closed, badAdopt, wipedCommit, rq, late>>
  /\ UNCHANGED <<nrecon, overlapReadyNoLogin>>

\* --- MCS refresh (not serialized), in three steps. It resolves the
\* generation when it starts; with the fix, none while a reconnect is pending
\* (PDS refreshGeneration via PC), so it does not start. It then reads the
\* account through the registered adapter: a reconnect that reused the live
\* runtime signs in through that adapter, while one that created its runtime
\* never replaced the recovery adapter, which reports unavailable. Last, MCS
\* drops the result if the generation it resolves now differs (null while a
\* reconnect is pending), and CAT refuses a stale one, which the refresh
\* relearns. close() aborts it.
RefreshStart ==
  /\ ~rq.on /\ life = "active" /\ rmap /= 0 /\ rtState[rmap] = "open" /\ ~closing
  /\ RefreshSkipsPendingReconnect => ~pend.on
  /\ rq' = [on |-> TRUE, g |-> jsGen, res |-> "none", n |-> nrecon]
  /\ UNCHANGED <<nrecon, overlapReadyNoLogin>>
  /\ UNCHANGED <<life, gen, jsGen, ready, auth, rmap, rtState, pend, turn, leaseRt,
                 underLease, closing, closed, badAdopt, wipedCommit, cancelLeftReady,
                 late, uncertain>>

RefreshRead ==
  /\ rq.on /\ rq.res = "none"
  /\ rq' = [rq EXCEPT !.res = IF auth /\ ~(pend.on /\ pend.created) THEN "ready" ELSE "notready"]
  /\ UNCHANGED <<life, gen, jsGen, ready, auth, rmap, rtState, pend, turn, leaseRt,
                 underLease, closing, closed, badAdopt, wipedCommit, cancelLeftReady,
                 late, uncertain>>
  /\ UNCHANGED <<nrecon, overlapReadyNoLogin>>

RefreshPublish ==
  /\ rq.on /\ rq.res /= "none"
  /\ rq' = NoRq
  /\ IF \/ closing \/ life /= "active"
        \/ (RefreshSkipsPendingReconnect /\ pend.on) \/ jsGen /= rq.g
     THEN UNCHANGED <<ready, jsGen>>
     ELSE IF rq.g = gen THEN ready' = (rq.res = "ready") /\ UNCHANGED jsGen
     ELSE jsGen' = gen /\ UNCHANGED ready
  /\ UNCHANGED <<life, gen, auth, rmap, rtState, pend, turn, leaseRt, underLease,
                 closing, closed, badAdopt, wipedCommit, cancelLeftReady, late, uncertain>>
  /\ UNCHANGED nrecon
  /\ overlapReadyNoLogin' = (overlapReadyNoLogin \/ (ready' /\ ~ready /\ ~auth /\ rq.n /= nrecon))

\* --- PDS remove. removal_pending drops the pending reconnect's entry only.
Remove ==
  /\ QueueFree /\ life = "active" /\ ~closed /\ gen < MaxGen
  /\ pend' = NoPend
  /\ IF turn /= "held"
       THEN Finalize /\ UNCHANGED jsGen
       ELSE /\ life' = "removal_pending" /\ gen' = gen + 1
            /\ UNCHANGED <<ready, auth, rmap, rtState, jsGen>>
  /\ UNCHANGED <<turn, leaseRt, underLease, closing, closed>>
  /\ UNCHANGED <<badAdopt, wipedCommit, cancelLeftReady, rq, late, uncertain>>
  /\ UNCHANGED <<nrecon, overlapReadyNoLogin>>

\* --- PDS close(): waits for lifecycle tasks, not for the queue. It closes the
\* runtimes in this.runtimes and pendingConnections, not one still starting.
Close ==
  /\ ~closing
  /\ closing' = TRUE
  /\ UNCHANGED <<life, gen, jsGen, ready, auth, rmap, rtState, pend, turn, leaseRt,
                 underLease, closed>>
  /\ UNCHANGED <<badAdopt, wipedCommit, cancelLeftReady, rq, late, uncertain>>
  /\ UNCHANGED <<nrecon, overlapReadyNoLogin>>

CloseRuntimes ==
  /\ closing /\ ~closed
  /\ closed' = TRUE
  /\ rtState' = [r \in Rts |-> IF rtState[r] = "open" THEN "closed" ELSE rtState[r]]
  /\ rmap' = 0 /\ pend' = NoPend
  /\ underLease' = (underLease \/ turn = "held")   \* shutdown: the host is closing too
  /\ UNCHANGED <<life, gen, jsGen, ready, auth, turn, leaseRt, closing>>
  /\ UNCHANGED <<badAdopt, wipedCommit, cancelLeftReady, rq, late, uncertain>>
  /\ UNCHANGED <<nrecon, overlapReadyNoLogin>>

Next ==
  \/ RustAdmit \/ Acquire \/ AcquireRegistered \/ Release \/ Logout
  \/ Reconnect \/ SignIn \/ Cancel \/ CompleteOk \/ CompleteNoAnswer
  \/ CompleteRefused \/ RefreshStart \/ RefreshRead \/ RefreshPublish
  \/ Remove \/ Close \/ CloseRuntimes \/ LateCommit

Spec == Init /\ [][Next]_vars
\* The host releases access when the native turn ends.
FairSpec == Spec /\ WF_vars(Release) /\ WF_vars(Acquire) /\ WF_vars(AcquireRegistered)

TypeOK ==
  /\ life \in {"active", "removal_pending", "tombstoned"}
  /\ gen \in 1..(MaxGen + 3) /\ jsGen \in 1..(MaxGen + 3)
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

\* PROV-002: a settled reconnect never leaves the app server reading P ready
\* over the home it wiped: it records signed out first, and keeps the login
\* when it cannot. This holds even after a sign-out whose publish failed.
CancelRecordsSignedOut == ~cancelLeftReady

\* PROV-002 ("User actions supersede automatic ones"): no automatic refresh
\* stands for the sign-in of a pending reconnect. Checked with the sign-out
\* fault off, since a failed sign-out leaves P ready by itself.
PendingReconnectNotReady == pend.on => ~ready

\* PROV-002: a refresh that overlapped a reconnect never makes the app server
\* read P ready while the home holds no login, with every fault on. (A refresh
\* not overlapping one can, after a sign-out whose publish failed: the known
\* limit.)
OverlappingRefreshNeverReadiesWipedLogin == ~overlapReadyNoLogin

\* PROV-003: removal finishes without a restart once nothing runs.
RemovalCompletes == (life = "removal_pending") ~> (life = "tombstoned")
=============================================================================
