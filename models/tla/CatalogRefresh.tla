--------------------------- MODULE CatalogRefresh ----------------------------
(***************************************************************************)
(* The model-catalog refresh queue interleaved with provider lifecycle,    *)
(* managed-family tombstone/reactivate, and the default provider/family.  *)
(*                                                                         *)
(* Source of truth (every action cites the code it abstracts):            *)
(*   MCS = desktop/main/models/model-catalog-service.mjs                   *)
(*   PC  = desktop/main/providers/provider-composition.mjs                 *)
(*   PDS = desktop/main/providers/provider-definition-service.mjs          *)
(*   MSA = desktop/main/providers/implementations/                        *)
(*         managed-subscription-adapter.mjs (discover)                    *)
(*   SVC = crates/relayer-app-server/src/product/service.rs                *)
(*   CAT = crates/relayer-app-server/src/storage/sqlite/catalog.rs         *)
(*                                                                         *)
(* Scope. Two providers. "P" is an existing managed-login provider; "Q"   *)
(* starts absent and may be connected. Families: "mP" and "mQ" (policy-   *)
(* managed system families, one policy version each) and "C" (the user's  *)
(* custom family, members from P and Q).                                  *)
(*                                                                         *)
(* The catalog queue (MCS refreshQueues) is modeled exactly: one FIFO per *)
(* provider, a refresh resolves its adapter when it starts (MCS:120),     *)
(* only the head entry runs, and a pre-inference request joins the tail   *)
(* (MCS:107-109). The provider-definition queue (PDS #serialized) is a lock *)
(* "pdsHold". Lifecycle operations are atomic apart from the awaits that  *)
(* interleave with the catalog queue (before PR 4, logout awaited its own *)
(* refresh and connect registered its adapter before it committed).       *)
(*                                                                         *)
(* Ghost flags record the first step that breaks a promise, so each      *)
(* promise is an invariant over one flag.                                  *)
(*                                                                         *)
(* One constant per landed or candidate fix (see models/tla/README.md):   *)
(*   DefaultProviderPairsFamily: choosing a default provider also selects *)
(*     its managed family (PROV-008). Landed.                             *)
(*   ConnectionGeneration: a refresh resolves its adapter and the         *)
(*     provider's connection generation when it runs; logout, reconnect   *)
(*     completion and removal advance the generation in their own Rust    *)
(*     transaction; Rust drops a publish from an older generation. Logout *)
(*     commits its signed-out state and does not wait for its refresh     *)
(*     (PROV-002). Landed.                                                *)
(*   ReconnectKeepsAdapter: a cancelled or failed reconnect leaves the    *)
(*     provider a catalog adapter, and recovery refuses while a reconnect *)
(*     is pending (F4, L1). Landed.                                       *)
(*   AdapterAfterCommit: connect registers the catalog adapter only after *)
(*     the definition commits (PROV-007). Landed.                         *)
(*   RefreshSkipsPendingReconnect: a refresh resolves no generation while *)
(*     a reconnect is pending (PDS refreshGeneration), so it neither runs *)
(*     nor publishes until the reconnect settles (PROV-002). Landed.      *)
(***************************************************************************)
EXTENDS Naturals, Sequences, FiniteSets

CONSTANTS MaxQ,        \* entries per provider queue
          MaxEvents,   \* bound on logout / reconnect-start / remove
          AllowPre,    \* model the pre-inference trigger
          AllowClose,  \* model close()
          WithQ,       \* Q may be connected
          UserOps,     \* the user may change defaults / toggle custom
          MaxFlips,    \* bound on upstream eligibility changes
          InitAdapters, \* P's adapter after startup activation: real, stub
          Ops,         \* lifecycle operations explored
          InitDefFams, \* initial default family choices explored
          DefaultProviderPairsFamily, \* fix: a provider choice moves the family
          ConnectionGeneration,       \* fix: results carry their generation
          ReconnectKeepsAdapter,      \* fix: a cancelled reconnect keeps an adapter
          AdapterAfterCommit,         \* fix: connect registers after its commit
          RefreshSkipsPendingReconnect \* fix: no refresh during a pending reconnect

Provs == {"P", "Q"}
Fams == {"mP", "mQ", "C"}
M(p) == IF p = "P" THEN "mP" ELSE "mQ"
Members(f) == CASE f = "mP" -> {"P"} [] f = "mQ" -> {"Q"} [] OTHER -> {"P", "Q"}
Results == {"none", "models", "noelig", "disc", "unavail"}

VARIABLES
  \* --- desktop main, provider service and upstream account ---
  life,      \* p -> absent | active | tombstoned (definition, JS + Rust)
  acct,      \* p -> conn | disc: upstream account state the runtime reads
  elig,      \* p -> BOOLEAN: upstream offers models eligible for execution
  adapter,   \* p -> none | real | stub: MCS this.adapters entry
  hasRt,     \* p -> PDS this.runtimes has an entry
  pending,   \* p -> a reconnect is pending (PDS pendingConnections)
  pendNew,   \* p -> that reconnect created its own runtime (none was live)
  pendGen,   \* p -> the connection generation that reconnect started with
  gen,       \* p -> model_providers.connection_generation (Rust)
  pdsHold,   \* none | P | Q (logout awaiting its refresh) | conn (connect)
  events,    \* lifecycle events so far (bound)
  flips,     \* upstream eligibility changes so far (bound)
  \* --- desktop main, model catalog service ---
  q,         \* p -> Seq(Entry)
  closed,    \* MCS close() ran
  \* --- app-server SQLite ---
  conn,      \* p -> model_providers.connected
  models,    \* p -> the provider's eligible models are available
  fam,       \* f -> none | active | tomb (enabled = active for managed)
  cEn,       \* custom family C enabled
  defFam,    \* product_model_preferences.default_family_id (or "none")
  defProv,   \* product_model_preferences.default_provider_id
  defMod,    \* the user has explicitly chosen a default
  \* --- ghost flags ---
  fStale,    \* PROV-002: a result started before a lifecycle event had effect
  fStaleX,   \* ... and that effect contradicts the current generation
  fStaleL,   \* ... and nothing is queued behind it (it is the last word)
  fOldAd,    \* PROV-002: a result from a replaced adapter had effect
  fOldAdX,   \* ... and that effect contradicts the current adapter
  fUnsafe,   \* PRD: an eligible result older than a zero-eligible one populated
  fDefault,  \* PROV-008: a refresh changed a user-chosen default
  fAdd,      \* PRD: a refresh moved the default provider off another provider
  fJoin      \* pre-inference joined a refresh that had already discovered

vars == <<life, acct, elig, adapter, hasRt, pending, pendNew, pendGen, gen,
          pdsHold, events, flips, q,
          closed, conn, models, fam, cEn, defFam, defProv, defMod, fStale,
          fStaleX, fStaleL, fOldAd, fOldAdX, fUnsafe, fDefault, fAdd, fJoin>>
pdsVars == <<life, acct, elig, adapter, hasRt, pending, pendNew, pendGen, gen,
             pdsHold, events, flips>>
rustVars == <<conn, models, fam, cEn, defFam, defProv, defMod>>
flagVars == <<fStale, fStaleX, fStaleL, fOldAd, fOldAdX, fUnsafe, fDefault, fAdd, fJoin>>

(* One refresh entry (MCS:113). rsn: auto = startup/background/settings-  *)
(* open (no signal, not explicit); explicit; pre = pre-inference (has a   *)
(* signal); change = provider-change from logout. ad: the adapter it runs *)
(* through: captured at request time before PR 4, or resolved when it    *)
(* starts with ConnectionGeneration. g: the connection generation it      *)
(* started with (0 until it starts). pc: queued (not started), recover (stub *)
(* explicit discover waiting on the PDS queue), pub (discovered, publish  *)
(* next). w: abortable waiters; pin: a waiter with no signal exists.      *)
(* hold: logout awaits this entry inside the PDS queue (only with          *)
(* ConnectionGeneration off). bh: its recover                              *)
(* call queued behind a PDS hold. stale/oldAd/dead/sup: ghost marks.      *)
Entry(r, a, pin, w) ==
  [rsn |-> r, ad |-> a, g |-> 0, pc |-> "queued", res |-> "none", stale |-> FALSE,
   oldAd |-> FALSE, dead |-> FALSE, sup |-> FALSE, ab |-> FALSE, w |-> w,
   pin |-> pin, hold |-> FALSE, bh |-> FALSE]

MaxGen == 1 + 2 * MaxEvents

EntryT == [rsn : {"auto", "explicit", "pre", "change"}, ad : {"real", "stub"},
           g : 0..MaxGen,
           pc : {"queued", "recover", "pub"}, res : Results,
           stale : BOOLEAN, oldAd : BOOLEAN, dead : BOOLEAN, sup : BOOLEAN,
           ab : BOOLEAN, w : 0..2, pin : BOOLEAN, hold : BOOLEAN,
           bh : BOOLEAN]

TypeOK ==
  /\ life \in [Provs -> {"absent", "active", "tombstoned"}]
  /\ acct \in [Provs -> {"conn", "disc"}]
  /\ elig \in [Provs -> BOOLEAN]
  /\ adapter \in [Provs -> {"none", "real", "stub"}]
  /\ hasRt \in [Provs -> BOOLEAN]
  /\ pending \in [Provs -> BOOLEAN]
  /\ pendNew \in [Provs -> BOOLEAN]
  /\ pendGen \in [Provs -> 0..MaxGen]
  /\ gen \in [Provs -> 1..MaxGen]
  /\ pdsHold \in {"none", "conn"} \cup Provs
  /\ events \in 0..MaxEvents /\ flips \in 0..MaxFlips
  /\ \A p \in Provs : Len(q[p]) <= MaxQ /\ \A i \in 1..Len(q[p]) : q[p][i] \in EntryT
  /\ closed \in BOOLEAN
  /\ conn \in [Provs -> BOOLEAN] /\ models \in [Provs -> BOOLEAN]
  /\ fam \in [Fams -> {"none", "active", "tomb"}] /\ cEn \in BOOLEAN
  /\ defFam \in Fams \cup {"none"} /\ defProv \in Provs /\ defMod \in BOOLEAN
  /\ {fStale, fStaleX, fStaleL, fOldAd, fOldAdX, fUnsafe, fDefault, fAdd, fJoin} \subseteq BOOLEAN

-----------------------------------------------------------------------------
(* Rust resolution (validate_model_selection_on, CAT:~1634): provider    *)
(* active and connected, model available, family enabled.                *)
FamEnabled(f) == fam[f] = "active" /\ (f = "C" => cEn)
MemberOK(m) == life[m] = "active" /\ conn[m] /\ models[m]
Resolvable(f) == FamEnabled(f) /\ \E m \in Members(f) : MemberOK(m)
SendOK == defFam /= "none" /\ Resolvable(defFam)
DefaultTomb == defFam \in Fams /\ fam[defFam] = "tomb"

\* Upstream result a real adapter reads (MSA:39-79): account(), then the
\* model list. Rust derives zero-eligible (SVC:699-708).
Upstream(p) == IF acct[p] = "conn" THEN (IF elig[p] THEN "models" ELSE "noelig")
               ELSE "disc"

\* What a refresh requested now would publish: the current generation.
CurTruth(p) == IF adapter[p] = "stub" THEN "unavail" ELSE Upstream(p)
\* Results with the same Rust effect (disconnected and unavailable both
\* clear connected and leave the family alone).
Cls(r) == CASE r = "models" -> "models" [] r = "noelig" -> "noelig" [] OTHER -> "off"

MarkStale(s) == [i \in 1..Len(s) |-> IF s[i].pc /= "queued"
                                      THEN [s[i] EXCEPT !.stale = TRUE] ELSE s[i]]
\* An entry is bound to a runtime if it captured the adapter at request
\* time, or had already started.
Bound(e) == ~ConnectionGeneration \/ e.pc /= "queued"
\* A result from a replaced adapter. Today every entry captured its adapter
\* at request time, so replacing the adapter marks every entry. With
\* ConnectionGeneration the mark is not used: RustPublish instead checks
\* the adapter the result ran through against the one registered now.
MarkOld(s)   == [i \in 1..Len(s) |-> IF ~ConnectionGeneration
                                      THEN [s[i] EXCEPT !.oldAd = TRUE] ELSE s[i]]
MarkDead(s)  == [i \in 1..Len(s) |-> IF s[i].ad = "real" /\ Bound(s[i])
                                      THEN [s[i] EXCEPT !.dead = TRUE] ELSE s[i]]
\* The adapter the head entry runs through, and whether it may start at all:
\* with ConnectionGeneration it resolves the adapter and generation now and
\* settles with no effect if either is gone (MCS refresh).
RunAd(p, e) == IF ConnectionGeneration THEN adapter[p] ELSE e.ad
Start(p, e, pc, res) ==
  [e EXCEPT !.ad = RunAd(p, e), !.g = gen[p], !.pc = pc, !.res = res]
MarkSup(s)   == [i \in 1..Len(s) |-> IF s[i].pc = "pub" /\ s[i].res = "models"
                                      THEN [s[i] EXCEPT !.sup = TRUE] ELSE s[i]]
ClearBh(s)   == [i \in 1..Len(s) |-> [s[i] EXCEPT !.bh = FALSE]]

\* The PDS queue is free and no recover call is queued ahead (FIFO).
PdsFree == /\ pdsHold = "none"
           /\ \A p \in Provs : \A i \in 1..Len(q[p]) :
                 ~(q[p][i].pc = "recover" /\ ~q[p][i].bh)

\* Settle the head entry (MCS:158-161). If logout awaited it, the PDS
\* queue is released (logout returns; before PR 4 only).
Dequeue(p, s) ==
  LET h == Head(s).hold
  IN /\ q' = [x \in Provs |-> LET t == IF x = p THEN Tail(s) ELSE q[x]
                              IN IF h THEN ClearBh(t) ELSE t]
     /\ pdsHold' = IF h THEN "none" ELSE pdsHold

(* publish_provider_catalog (SVC:619-663, CAT:683-767), one BEGIN        *)
(* IMMEDIATE transaction. Non-active providers are rejected (SVC:~638,   *)
(* CAT:~698-704), and with ConnectionGeneration so is a result from an   *)
(* older generation (the caller checks g first). A connected snapshot with eligible models replaces the *)
(* managed family (replace_system_family CAT:2417-2537), reactivating    *)
(* the same family id (CAT:~2478) and moving an unset or managed default *)
(* (CAT:2526-2535). Zero eligible tombstones the managed family          *)
(* (CAT:756-764). A disconnected or unavailable snapshot has no managed  *)
(* policy (SVC:~672), so it updates only the provider row and models.    *)
(* isRefresh: the publish came from the catalog queue (not reconnect).   *)
RustPublish(p, r, e, isRefresh) ==
  IF life[p] /= "active"
  THEN UNCHANGED <<rustVars, flagVars>>
  ELSE
    LET nconn == [conn EXCEPT ![p] = r \in {"models", "noelig"}]
        nmod  == [models EXCEPT ![p] = (r = "models")]
        nfam  == CASE r = "models" -> [fam EXCEPT ![M(p)] = "active"]
                   [] r = "noelig" /\ fam[M(p)] = "active" ->
                        [fam EXCEPT ![M(p)] = "tomb"]
                   [] OTHER -> fam
        move  == /\ r = "models"
                 /\ \/ defFam = M(p)
                    \/ /\ defFam = "none"
                       /\ \/ defProv = p
                          \/ ~(life[defProv] = "active" /\ conn[defProv])
        ndf   == IF move THEN M(p) ELSE defFam
        ndp   == IF move THEN p ELSE defProv
        eff   == nconn /= conn \/ nmod /= models \/ nfam /= fam
                 \/ ndf /= defFam \/ ndp /= defProv
        \* A stub's "could not be activated" landing over a registered real
        \* adapter (F3). A same-generation replacement mid-flight, a cancelled
        \* reconnect whose restore failed, leaves a real result over the stub;
        \* PROV-002 allows that, since the account and generation are unchanged.
        oldHit == IF ConnectionGeneration
                  THEN isRefresh /\ e.ad = "stub" /\ adapter[p] = "real"
                  ELSE e.oldAd
    IN /\ conn' = nconn /\ models' = nmod /\ fam' = nfam
       /\ defFam' = ndf /\ defProv' = ndp
       /\ UNCHANGED <<cEn, defMod, fJoin>>
       /\ fStale' = (fStale \/ (e.stale /\ eff))
       /\ fStaleX' = (fStaleX \/ (e.stale /\ eff /\ Cls(r) /= Cls(CurTruth(p))))
       /\ fStaleL' = (fStaleL \/ (e.stale /\ eff /\ Cls(r) /= Cls(CurTruth(p))
                                  /\ isRefresh /\ Len(q[p]) = 1))
       /\ fOldAd' = (fOldAd \/ (oldHit /\ eff))
       /\ fOldAdX' = (fOldAdX \/ (oldHit /\ eff /\ Cls(r) /= Cls(CurTruth(p))))
       /\ fUnsafe' = (fUnsafe \/ (e.sup /\ r = "models"))
       \* The user's choice is a provider and family chosen together. A default
       \* with no family is not one: defaults_modified is also set by a
       \* harness-only save (CAT:583-681), and every provider or family save
       \* now sets a family. Filling an unset family, with its provider, is
       \* therefore not counted as changing the user's choice.
       /\ fDefault' = (fDefault \/ (isRefresh /\ defMod /\ defFam /= "none"
                                    /\ (ndp /= defProv \/ ndf /= defFam)))
       /\ fAdd' = (fAdd \/ (isRefresh /\ ndp /= defProv))

NoMark == [stale |-> FALSE, oldAd |-> FALSE, sup |-> FALSE, ad |-> "real"]

-----------------------------------------------------------------------------
(* Catalog service triggers.                                              *)

\* refresh() with a non-pre-inference reason always appends a new entry
\* chained after the current tail (MCS:111-164). Requires a registered
\* adapter (MCS:104). auto = startup (PC:89, MCS:173-179), background
\* timer (MCS:181-192), settings-open (register-ipc.mjs:151); explicit =
\* register-ipc.mjs:152. None of these callers passes a signal.
Request(p, r) ==
  /\ ~closed /\ adapter[p] /= "none" /\ Len(q[p]) < MaxQ
  /\ q' = [q EXCEPT ![p] = Append(@, Entry(r, adapter[p], TRUE, 0))]
  /\ UNCHANGED <<pdsVars, closed, rustVars, flagVars>>

\* Pre-inference (MCS:108-109, model-catalog-refresh-server.mjs:127-131):
\* joins the tail if it is not aborted, whatever stage it has reached.
RequestPre(p) ==
  /\ AllowPre /\ ~closed /\ adapter[p] /= "none"
  /\ LET s == q[p] IN
     IF s /= << >> /\ ~s[Len(s)].ab
     THEN /\ s[Len(s)].w < 2
          /\ q' = [q EXCEPT ![p][Len(s)].w = @ + 1]
          /\ fJoin' = (fJoin \/ s[Len(s)].pc = "pub")
          /\ UNCHANGED <<fStale, fStaleX, fStaleL, fOldAd, fOldAdX, fUnsafe, fDefault, fAdd>>
     ELSE /\ Len(s) < MaxQ
          /\ q' = [q EXCEPT ![p] = Append(@, Entry("pre", adapter[p], FALSE, 1))]
          /\ UNCHANGED flagVars
  /\ UNCHANGED <<pdsVars, closed, rustVars>>

\* A waiter's signal aborts (HTTP timeout, MCS:24-35). The last abortable
\* waiter of an entry with no unabortable waiter aborts it (MCS:29-31).
WaiterAbort(p, i) ==
  /\ i \in 1..Len(q[p]) /\ q[p][i].w > 0
  /\ q' = [q EXCEPT ![p][i].w = @ - 1,
                    ![p][i].ab = (@ \/ (q[p][i].w = 1 /\ ~q[p][i].pin))]
  /\ UNCHANGED <<pdsVars, closed, rustVars, flagVars>>

-----------------------------------------------------------------------------
(* The head entry runs (MCS:114-157).                                     *)

\* throwIfAborted before discovery (MCS:116): settles with no effect.
SkipAborted(p) ==
  /\ q[p] /= << >> /\ Head(q[p]).pc = "queued" /\ Head(q[p]).ab
  /\ Dequeue(p, q[p])
  /\ UNCHANGED <<life, acct, elig, adapter, hasRt, pending, pendNew, pendGen, gen,
                 events, flips, closed, rustVars, flagVars>>

\* With ConnectionGeneration, a refresh whose provider has no adapter or is
\* no longer active when it starts settles with no effect (MCS refresh).
SkipGone(p) ==
  /\ ConnectionGeneration
  /\ q[p] /= << >> /\ Head(q[p]).pc = "queued" /\ ~Head(q[p]).ab
  /\ (adapter[p] = "none" \/ life[p] /= "active" \/ (RefreshSkipsPendingReconnect /\ pending[p]))
  /\ Dequeue(p, q[p])
  /\ UNCHANGED <<life, acct, elig, adapter, hasRt, pending, pendNew, pendGen, gen,
                 events, flips, closed, rustVars, flagVars>>
Runnable(p) == ~ConnectionGeneration
               \/ (adapter[p] /= "none" /\ life[p] = "active" /\ ~(RefreshSkipsPendingReconnect /\ pending[p]))

\* Discovery through a captured real adapter reads the current upstream
\* (MSA:39-79). A runtime closed since capture only fails (DiscoverFail).
DiscoverReal(p) ==
  /\ q[p] /= << >>
  /\ LET e == Head(q[p]) IN
     /\ e.pc = "queued" /\ ~e.ab /\ Runnable(p) /\ RunAd(p, e) = "real" /\ ~e.dead
     /\ LET r == Upstream(p)
            s1 == [q[p] EXCEPT ![1] = Start(p, e, "pub", r)]
            s2 == IF r = "noelig"
                  THEN <<s1[1]>> \o MarkSup(Tail(s1)) ELSE s1
        IN q' = [q EXCEPT ![p] = s2]
  /\ UNCHANGED <<pdsVars, closed, rustVars, flagVars>>

\* The unavailable stub (PC:59-80) answers a non-explicit refresh with an
\* unavailable snapshot at once.
DiscoverStub(p) ==
  /\ q[p] /= << >>
  /\ LET e == Head(q[p]) IN
     /\ e.pc = "queued" /\ ~e.ab /\ Runnable(p) /\ RunAd(p, e) = "stub"
     /\ e.rsn /= "explicit"
     /\ q' = [q EXCEPT ![p][1] = Start(p, e, "pub", "unavail")]
  /\ UNCHANGED <<pdsVars, closed, rustVars, flagVars>>

\* An explicit refresh through the stub calls recoverUnavailable (PC:71),
\* whose first step is PDS #serialized (PDS:852). It queues behind any
\* current holder of the PDS queue.
StubRecoverCall(p) ==
  /\ q[p] /= << >>
  /\ LET e == Head(q[p]) IN
     /\ e.pc = "queued" /\ ~e.ab /\ Runnable(p) /\ RunAd(p, e) = "stub"
     /\ e.rsn = "explicit"
     /\ q' = [q EXCEPT ![p][1] = [Start(p, e, "recover", "none")
                                     EXCEPT !.bh = (pdsHold /= "none")]]
  /\ UNCHANGED <<pdsVars, closed, rustVars, flagVars>>

\* recoverUnavailable runs (PDS:851-876): #runtimeFor creates and
\* registers the real runtime (PDS:823-843, onRuntimeReady PC:53-56) and
\* discovers through it. On failure the stub returns an unavailable
\* snapshot (PC:72-78); on abort it rethrows (PC:73). Today a pending
\* reconnect's runtime is already in this.runtimes, so recovery discovers
\* through it without registering it (L1). With ReconnectKeepsAdapter,
\* recovery refuses while a reconnect is pending.
RecoverRun(p, ok) ==
  /\ q[p] /= << >>
  /\ LET e == Head(q[p]) IN
     /\ e.pc = "recover" /\ (~e.bh \/ pdsHold = "none")
     /\ IF e.ab
        THEN /\ Dequeue(p, q[p])
             /\ UNCHANGED <<adapter, hasRt>>
        ELSE IF ok /\ life[p] = "active" /\ ~closed
                /\ ~(ReconnectKeepsAdapter /\ pending[p])
        THEN LET reg == ~hasRt[p]
                 s1 == IF reg THEN <<Head(q[p])>> \o MarkOld(Tail(q[p])) ELSE q[p]
                 r == Upstream(p)
             IN /\ adapter' = IF reg THEN [adapter EXCEPT ![p] = "real"] ELSE adapter
                /\ hasRt' = [hasRt EXCEPT ![p] = TRUE]
                /\ q' = [q EXCEPT ![p] = [s1 EXCEPT ![1].pc = "pub", ![1].res = r,
                                                    ![1].ad = "real"]]
                /\ UNCHANGED pdsHold
        ELSE /\ q' = [q EXCEPT ![p][1].pc = "pub", ![p][1].res = "unavail"]
             /\ UNCHANGED <<adapter, hasRt, pdsHold>>
  /\ UNCHANGED <<life, acct, elig, pending, pendNew, pendGen, gen, events, flips,
                 closed, rustVars, flagVars>>

\* Discovery throws (retries exhausted, closed runtime): diagnostics only
\* (MCS:129-136).
DiscoverFail(p) ==
  /\ q[p] /= << >> /\ Head(q[p]).pc = "queued" /\ ~Head(q[p]).ab
  /\ Runnable(p) /\ RunAd(p, Head(q[p])) = "real"
  /\ Dequeue(p, q[p])
  /\ UNCHANGED <<life, acct, elig, adapter, hasRt, pending, pendNew, pendGen, gen,
                 events, flips, closed, rustVars, flagVars>>

\* throwIfAborted after discovery (MCS:138), then publishSnapshot
\* (MCS:139-155, relayer-app-server.mjs:303-322). An explicit refresh first
\* runs evaluateCatalogReadiness (PC:30-36), which throws for a non-active
\* definition; Rust rejects that case anyway.
Publish(p) ==
  /\ q[p] /= << >>
  /\ LET e == Head(q[p]) IN
     /\ e.pc = "pub"
     \* MCS drops a result whose generation changed, or resolves none while a
     \* reconnect is pending, before it publishes.
     /\ IF e.ab \/ (ConnectionGeneration /\ e.g /= gen[p]) \/ (RefreshSkipsPendingReconnect /\ pending[p])
        THEN UNCHANGED <<rustVars, flagVars>>
        ELSE RustPublish(p, e.res, e, TRUE)
  /\ Dequeue(p, q[p])
  /\ UNCHANGED <<life, acct, elig, adapter, hasRt, pending, pendNew, pendGen, gen,
                 events, flips, closed>>

-----------------------------------------------------------------------------
(* Provider lifecycle (abstract; the other model owns connect internals). *)

\* logout (PDS:667-722): #runtimeFor registers a runtime if none exists,
\* the account is logged out, then onRuntimeChanged -> providerChanged
\* (PC:58) appends a refresh. Today logout AWAITS that refresh inside the
\* PDS queue. With ConnectionGeneration it first publishes its signed-out
\* state with the next generation (SVC publish_provider_catalog, event
\* signed-out), and the refresh runs behind the queue, unawaited.
\* ok: the signed-out publish committed. If it failed, the generation did
\* not advance, so nothing in flight was superseded (it is only logged).
Logout(p, ok) ==
  /\ "logout" \in Ops /\ ~closed /\ PdsFree /\ events < MaxEvents
  /\ life[p] = "active" /\ Len(q[p]) < MaxQ
  /\ ConnectionGeneration \/ ok
  /\ LET reg == ~hasRt[p]
         ad  == IF reg THEN "real" ELSE adapter[p]
         s0  == IF reg THEN MarkOld(q[p]) ELSE q[p]
         s1  == IF ok THEN MarkStale(s0) ELSE s0
         ent == [Entry("change", ad, TRUE, 0) EXCEPT !.hold = ~ConnectionGeneration]
     IN /\ adapter' = [adapter EXCEPT ![p] = ad]
        /\ hasRt' = [hasRt EXCEPT ![p] = TRUE]
        /\ IF ad = "none"   \* refresh throws "Unknown model provider"; logged
           THEN q' = [q EXCEPT ![p] = s1] /\ pdsHold' = "none"
           ELSE /\ q' = [q EXCEPT ![p] = Append(s1, ent)]
                /\ pdsHold' = IF ConnectionGeneration THEN "none" ELSE p
  /\ acct' = [acct EXCEPT ![p] = "disc"]
  /\ events' = events + 1
  /\ IF ConnectionGeneration /\ ok
     THEN /\ gen' = [gen EXCEPT ![p] = @ + 1]
          /\ RustPublish(p, "disc", NoMark, FALSE)
     ELSE UNCHANGED <<gen, rustVars, flagVars>>
  /\ UNCHANGED <<life, elig, pending, pendNew, pendGen, flips, closed>>

\* reconnect (PDS:729-793): creates a runtime if none (unregistered) and
\* leaves a pending connection.
ReconnectStart(p) ==
  /\ "reconnect" \in Ops /\ ~closed /\ PdsFree /\ events < MaxEvents
  /\ life[p] = "active" /\ ~pending[p]
  /\ pending' = [pending EXCEPT ![p] = TRUE]
  /\ pendNew' = [pendNew EXCEPT ![p] = ~hasRt[p]]
  /\ pendGen' = [pendGen EXCEPT ![p] = gen[p]]
  /\ hasRt' = [hasRt EXCEPT ![p] = TRUE]
  /\ events' = events + 1
  /\ UNCHANGED <<life, acct, elig, adapter, gen, pdsHold, flips, q, closed, rustVars,
                 flagVars>>

\* completeConnection for a reconnect (PDS:472-552): account connected,
\* discover in the PDS, onRuntimeReady, then publishCatalog DIRECTLY
\* (PDS:544-548), not through the catalog queue. The connection generation
\* changes here. With ConnectionGeneration the publish carries the
\* generation the reconnect started with and advances it; Rust refuses a
\* reconnect a later lifecycle event superseded, which then settles as a
\* failed reconnect (ReconnectCancel).
ReconnectComplete(p) ==
  /\ ~closed /\ PdsFree /\ pending[p] /\ life[p] = "active"
  /\ ConnectionGeneration => pendGen[p] = gen[p]
  /\ gen' = IF ConnectionGeneration THEN [gen EXCEPT ![p] = @ + 1] ELSE gen
  /\ LET r   == IF elig[p] THEN "models" ELSE "noelig"
         reg == adapter[p] /= "real"
         s1  == MarkStale(IF reg THEN MarkOld(q[p]) ELSE q[p])
         s2  == IF r = "noelig" THEN MarkSup(s1) ELSE s1
     IN /\ q' = [q EXCEPT ![p] = s2]
        /\ RustPublish(p, r, NoMark, FALSE)
  /\ acct' = [acct EXCEPT ![p] = "conn"]
  /\ adapter' = [adapter EXCEPT ![p] = "real"]
  /\ pending' = [pending EXCEPT ![p] = FALSE]
  /\ UNCHANGED <<life, elig, hasRt, pendNew, pendGen, pdsHold, events, flips, closed>>

\* A failed or cancelled reconnect (#cancelPendingConnection PDS:598-635):
\* today it closes the runtime and unregisters the catalog adapter. With
\* ReconnectKeepsAdapter it closes the reconnect's runtime and restores an
\* adapter: a reconnect that created its runtime never replaced the
\* recovery adapter, and one that reused the live runtime registers a
\* fresh runtime in its place.
\* ok: the fresh runtime started. If it could not, the recovery adapter
\* stands in, as after a failed startup activation.
ReconnectCancel(p, ok) ==
  /\ PdsFree /\ pending[p]
  /\ ReconnectKeepsAdapter \/ ok
  /\ pending' = [pending EXCEPT ![p] = FALSE]
  /\ IF ReconnectKeepsAdapter
     THEN IF pendNew[p]
          THEN /\ hasRt' = [hasRt EXCEPT ![p] = FALSE]
               /\ UNCHANGED <<adapter, q>>
          ELSE /\ adapter' = [adapter EXCEPT ![p] = IF ok THEN "real" ELSE "stub"]
               /\ hasRt' = [hasRt EXCEPT ![p] = ok]
               /\ q' = [q EXCEPT ![p] = MarkDead(MarkOld(@))]
     ELSE /\ adapter' = [adapter EXCEPT ![p] = "none"]
          /\ hasRt' = [hasRt EXCEPT ![p] = FALSE]
          /\ q' = [q EXCEPT ![p] = MarkDead(MarkOld(@))]
  /\ UNCHANGED <<life, acct, elig, pendNew, pendGen, gen, pdsHold, events, flips,
                 closed, rustVars, flagVars>>

\* remove (PDS:891-931) with guard_provider_removal (CAT:2656-2706) and
\* tombstone_managed_provider_families (CAT:185-188). No running turns in
\* this model, so removal_pending finalizes at once: the runtime closes and
\* the adapter is unregistered (PC:57).
RemoveGuard(p) ==
  /\ defProv /= p
  /\ IF defFam = "none" THEN TRUE
     ELSE FamEnabled(defFam) /\ \E m \in Members(defFam) \ {p} : MemberOK(m)
Remove(p) ==
  /\ "remove" \in Ops /\ ~closed /\ PdsFree /\ events < MaxEvents
  /\ life[p] = "active" /\ RemoveGuard(p)
  /\ life' = [life EXCEPT ![p] = "tombstoned"]
  /\ gen' = IF ConnectionGeneration THEN [gen EXCEPT ![p] = @ + 1] ELSE gen
  /\ fam' = IF fam[M(p)] = "active" THEN [fam EXCEPT ![M(p)] = "tomb"] ELSE fam
  /\ adapter' = [adapter EXCEPT ![p] = "none"]
  /\ hasRt' = [hasRt EXCEPT ![p] = FALSE]
  /\ pending' = [pending EXCEPT ![p] = FALSE]
  /\ q' = [q EXCEPT ![p] = MarkDead(MarkOld(MarkStale(@)))]
  /\ events' = events + 1
  /\ UNCHANGED <<acct, elig, pendNew, pendGen, pdsHold, flips, closed, conn, models,
                 cEn, defFam, defProv, defMod, flagVars>>

\* connect (PDS:256-367), abstract: inside one PDS operation the runtime
\* is created, then the definition and catalog commit atomically
\* (createWithCatalog, CAT:~230-270, reconcile default = false). Today the
\* catalog adapter was registered before that commit; with
\* AdapterAfterCommit it is registered only once the commit succeeded.
ConnectRegister(p) ==
  /\ WithQ /\ ~closed /\ PdsFree /\ life[p] = "absent" /\ adapter[p] = "none"
  /\ ~hasRt[p]
  /\ adapter' = IF AdapterAfterCommit THEN adapter ELSE [adapter EXCEPT ![p] = "real"]
  /\ hasRt' = [hasRt EXCEPT ![p] = TRUE]
  /\ pdsHold' = "conn"
  /\ UNCHANGED <<life, acct, elig, pending, pendNew, pendGen, gen, events, flips, q,
                 closed, rustVars, flagVars>>

ConnectCommit(p) ==
  /\ pdsHold = "conn" /\ life[p] = "absent" /\ hasRt[p]
  /\ life' = [life EXCEPT ![p] = "active"]
  /\ adapter' = [adapter EXCEPT ![p] = "real"]
  /\ acct' = [acct EXCEPT ![p] = "conn"]
  /\ conn' = [conn EXCEPT ![p] = TRUE]
  /\ models' = [models EXCEPT ![p] = elig[p]]
  /\ fam' = IF elig[p] THEN [fam EXCEPT ![M(p)] = "active"] ELSE fam
  /\ pdsHold' = "none"
  /\ q' = [x \in Provs |-> ClearBh(q[x])]
  /\ UNCHANGED <<elig, hasRt, pending, pendNew, pendGen, gen, events, flips, closed,
                 cEn, defFam, defProv, defMod, flagVars>>

ConnectFail(p) ==
  /\ pdsHold = "conn" /\ life[p] = "absent" /\ hasRt[p]
  /\ adapter' = [adapter EXCEPT ![p] = "none"]
  /\ hasRt' = [hasRt EXCEPT ![p] = FALSE]
  /\ pdsHold' = "none"
  /\ q' = [x \in Provs |-> IF x = p THEN MarkDead(MarkOld(ClearBh(q[x])))
                           ELSE ClearBh(q[x])]
  /\ UNCHANGED <<life, acct, elig, pending, pendNew, pendGen, gen, events, flips,
                 closed, rustVars, flagVars>>

-----------------------------------------------------------------------------
(* User settings (Rust).                                                  *)

\* update_model_settings_defaults with providerId only (CAT:583-681;
\* model-family-settings.js:540-577). With the fix, paired_default_on
\* (CAT:2101-2165) selects the provider's enabled managed family in the same
\* transaction and refuses a provider without one. The family must then
\* resolve under a harness, which default_harness_for_family_on (CAT:2060-2092)
\* moves when needed; the model has no harness, so Resolvable stands for
\* "some harness can run it" (CAT:656-669). Without the fix, only the
\* provider was stored.
SetDefaultProvider(p) ==
  /\ UserOps /\ life[p] = "active" /\ conn[p] /\ defProv /= p
  /\ IF DefaultProviderPairsFamily
     THEN Resolvable(M(p)) /\ defFam' = M(p)
     ELSE UNCHANGED defFam
  /\ defProv' = p /\ defMod' = TRUE
  /\ UNCHANGED <<pdsVars, elig, q, closed, conn, models, fam, cEn, flagVars>>

\* update_model_settings_defaults with familyId (resolvable), or
\* complete_provider_onboarding (CAT:926-1074). The pair is chosen together:
\* onboarding requires a resolvable member from p (CAT:1575-1632), and a
\* managed family chosen alone brings its own provider (CAT:2101-2165).
\* The Settings UI never saves a family alone.
SetDefaultFamily(f, p) ==
  /\ UserOps /\ Resolvable(f) /\ p \in Members(f) /\ MemberOK(p)
  /\ <<defFam, defProv>> /= <<f, p>>
  /\ defFam' = f /\ defProv' = p /\ defMod' = TRUE
  /\ UNCHANGED <<pdsVars, elig, q, closed, conn, models, fam, cEn, flagVars>>

\* update_model_family (CAT:803-846) refuses to disable the default.
ToggleCustom ==
  /\ UserOps /\ fam["C"] = "active" /\ (cEn => defFam /= "C")
  /\ cEn' = ~cEn
  /\ UNCHANGED <<pdsVars, elig, q, closed, conn, models, fam, defFam,
                 defProv, defMod, flagVars>>

\* The provider's upstream model list changes.
FlipElig(p) ==
  /\ flips < MaxFlips /\ flips' = flips + 1
  /\ elig' = [elig EXCEPT ![p] = ~@]
  /\ UNCHANGED <<life, acct, adapter, hasRt, pending, pendNew, pendGen, gen, pdsHold, events, q,
                 closed, rustVars, flagVars>>

\* close() (MCS:194-200): aborts every entry.
Close ==
  /\ AllowClose /\ ~closed
  /\ closed' = TRUE
  /\ q' = [p \in Provs |-> [i \in 1..Len(q[p]) |-> [q[p][i] EXCEPT !.ab = TRUE]]]
  /\ UNCHANGED <<pdsVars, elig, rustVars, flagVars>>

-----------------------------------------------------------------------------
Init ==
  /\ life = [p \in Provs |-> IF p = "P" THEN "active" ELSE "absent"]
  /\ acct = [p \in Provs |-> IF p = "P" THEN "conn" ELSE "disc"]
  /\ elig = [p \in Provs |-> TRUE]
  \* Startup activation (PDS:878-889) either registered P's runtime or,
  \* on failure, the unavailable stub (PC:59-80).
  /\ adapter \in {[p \in Provs |-> IF p = "P" THEN a ELSE "none"] : a \in InitAdapters}
  /\ hasRt = [p \in Provs |-> adapter[p] = "real"]
  /\ pending = [p \in Provs |-> FALSE]
  /\ pendNew = [p \in Provs |-> FALSE]
  /\ pendGen = [p \in Provs |-> 0]
  /\ gen = [p \in Provs |-> 1]
  /\ pdsHold = "none" /\ events = 0 /\ flips = 0
  /\ q = [p \in Provs |-> << >>] /\ closed = FALSE
  /\ conn = [p \in Provs |-> p = "P"] /\ models = [p \in Provs |-> p = "P"]
  /\ fam = [f \in Fams |-> IF f = "mQ" THEN "none" ELSE "active"] /\ cEn = TRUE
  \* default_family_id is NULL until onboarding or a reconciliation sets it
  \* (migration 0013). A user-chosen default with a NULL family is legacy
  \* data: the provider-only settings save left it NULL before the fix.
  /\ \E t \in {<<"mP", "P", TRUE>>, <<"C", "P", TRUE>>,
               <<"none", "P", FALSE>>, <<"none", "P", TRUE>>} :
       t[1] \in InitDefFams /\ defFam = t[1] /\ defProv = t[2] /\ defMod = t[3]
  /\ fStale = FALSE /\ fOldAd = FALSE /\ fUnsafe = FALSE
  /\ fStaleX = FALSE /\ fStaleL = FALSE /\ fOldAdX = FALSE
  /\ fDefault = FALSE /\ fAdd = FALSE /\ fJoin = FALSE

Next ==
  \/ \E p \in Provs :
       \/ Request(p, "auto") \/ Request(p, "explicit") \/ RequestPre(p)
       \/ \E i \in 1..MaxQ : WaiterAbort(p, i)
       \/ SkipAborted(p) \/ SkipGone(p) \/ DiscoverReal(p) \/ DiscoverStub(p)
       \/ StubRecoverCall(p) \/ \E ok \in BOOLEAN : RecoverRun(p, ok)
       \/ DiscoverFail(p) \/ Publish(p)
       \/ \E ok \in BOOLEAN : Logout(p, ok)
       \/ ReconnectStart(p) \/ ReconnectComplete(p)
       \/ \E ok \in BOOLEAN : ReconnectCancel(p, ok)
       \/ Remove(p)
       \/ ConnectRegister(p) \/ ConnectCommit(p) \/ ConnectFail(p)
       \/ SetDefaultProvider(p) \/ FlipElig(p)
       \/ \E f \in Fams : SetDefaultFamily(f, p)
  \/ ToggleCustom \/ Close

\* Fairness: the queue steps the code always runs once reachable (promise
\* continuations), strong fairness on successful discovery (a provider
\* that stays healthy eventually answers), and the background timer
\* (MCS:181-192) as weak fairness on an auto request.
Fairness ==
  /\ \A p \in Provs :
       /\ WF_vars(SkipAborted(p)) /\ WF_vars(SkipGone(p)) /\ WF_vars(DiscoverStub(p))
       /\ WF_vars(StubRecoverCall(p)) /\ WF_vars(\E ok \in BOOLEAN : RecoverRun(p, ok))
       /\ WF_vars(Publish(p)) /\ SF_vars(DiscoverReal(p))
       /\ WF_vars(Request(p, "auto"))
       /\ WF_vars(ConnectCommit(p) \/ ConnectFail(p))

Spec == Init /\ [][Next]_vars
FairSpec == Spec /\ Fairness

-----------------------------------------------------------------------------
(* Properties.                                                            *)

\* PROV-002: a result started before logout/reconnect/remove has no
\* family, default, or catalog effect.
NoStaleEffect == ~fStale
\* Narrower: the stale effect contradicts what the current generation
\* would publish (the stale result is not merely redundant).
NoContradictingStaleEffect == ~fStaleX
\* Narrower still: the contradicting stale result is the last publish for
\* the provider (no refresh queued behind it corrects it).
NoPersistingStaleEffect == ~fStaleL
\* PROV-002: a result produced through an adapter that was replaced or
\* unregistered after the refresh started has no effect. Today a refresh
\* captures its adapter when requested, so replacing it while queued counts.
NoReplacedAdapterEffect == ~fOldAd
NoContradictingReplacedAdapterEffect == ~fOldAdX
\* PRD (prd:780): zero eligible "cannot silently populate an unsafe family":
\* an eligible result older than a newer zero-eligible discovery never
\* reactivates the managed family.
NoUnsafePopulate == ~fUnsafe
\* PROV-008: a refresh never changes the user's default provider or family.
RefreshKeepsUserDefault == ~fDefault
\* PROV-008: the default provider is the provider of a managed default family.
DefaultIsPaired == defFam \in {"mP", "mQ"} => defFam = M(defProv)
\* PRD (prd:780): adding a provider preserves the existing default provider
\* and family; a refresh never moves the default onto its own provider.
RefreshKeepsOtherDefault == ~fAdd
\* DRAFT: a pre-inference request never gets a result older than its
\* request when it joins an in-flight refresh.
PreInferenceFresh == ~fJoin
\* DRAFT (tombstoned default, not yet in the PRD): it blocks Send.
TombDefaultBlocksSend == DefaultTomb => ~SendOK
\* CODE (replace_system_family comment CAT:2526-2527, prd:780): only this
\* provider's managed family and an unset/managed default change; the
\* custom family is never touched by a catalog publish.
OnlyOwnFamily ==
  [][\A p \in Provs :
       (/\ q[p] /= << >> /\ Head(q[p]).pc = "pub"
        /\ Publish(p))
         => /\ \A f \in Fams \ {M(p)} : fam'[f] = fam[f]
            /\ cEn' = cEn]_vars

\* DRAFT (tombstoned default) liveness: it restores once its provider
\* is healthy and its refresh machinery is registered. A provider whose
\* reconnect is still pending has not settled: no refresh runs for it.
Healthy(ad) == /\ life["P"] = "active" /\ acct["P"] = "conn" /\ elig["P"]
               /\ ~closed /\ adapter["P"] \in ad
               /\ ~(RefreshSkipsPendingReconnect /\ pending["P"])
TombP == defFam = "mP" /\ fam["mP"] = "tomb"
DefaultRestores ==
  (TombP /\ Healthy({"real"})) ~> (~TombP \/ ~Healthy({"real"}))
\* Same, without assuming the adapter is the real runtime.
DefaultRestoresAnyAdapter ==
  (TombP /\ Healthy({"real", "stub", "none"}))
    ~> (~TombP \/ ~Healthy({"real", "stub", "none"}))
\* CODE: logout returns (it holds the PDS queue while it awaits).
LogoutReturns == (pdsHold \in Provs) ~> (pdsHold = "none")
\* CODE: close() settles every refresh (MCS:199).
CloseDrains == closed ~> (\A p \in Provs : q[p] = << >>)
\* F4: an active provider always has a catalog adapter, so a refresh can
\* run for it (the recovery adapter counts).
ActiveProviderHasAdapter ==
  \A p \in Provs : (life[p] = "active" /\ ~closed) => adapter[p] /= "none"
\* PROV-007: a provider has a catalog adapter only once its definition is
\* persisted, so nothing refreshes or publishes for a provider before then.
AdapterOnlyForDefinition == \A p \in Provs : adapter[p] /= "none" => life[p] /= "absent"
=============================================================================
