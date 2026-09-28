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
(* provider, a refresh captures its adapter at request time (MCS:89),     *)
(* only the head entry runs, and a pre-inference request joins the tail   *)
(* (MCS:93-95). The provider-definition queue (PDS #serialized) is a lock *)
(* "pdsHold". Lifecycle operations are atomic apart from the awaits that  *)
(* interleave with the catalog queue (logout awaits its own refresh,      *)
(* connect registers its adapter before it commits).                      *)
(*                                                                         *)
(* Ghost flags record the first step that breaks a promise, so each      *)
(* promise is an invariant over one flag.                                  *)
(*                                                                         *)
(* One constant per landed or candidate fix (see models/tla/README.md):   *)
(*   DefaultProviderPairsFamily: choosing a default provider also selects *)
(*     its managed family (PROV-008). Landed.                             *)
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
          DefaultProviderPairsFamily \* fix: a provider choice moves the family

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

vars == <<life, acct, elig, adapter, hasRt, pending, pdsHold, events, flips, q,
          closed, conn, models, fam, cEn, defFam, defProv, defMod, fStale,
          fStaleX, fStaleL, fOldAd, fOldAdX, fUnsafe, fDefault, fAdd, fJoin>>
pdsVars == <<life, acct, elig, adapter, hasRt, pending, pdsHold, events, flips>>
rustVars == <<conn, models, fam, cEn, defFam, defProv, defMod>>
flagVars == <<fStale, fStaleX, fStaleL, fOldAd, fOldAdX, fUnsafe, fDefault, fAdd, fJoin>>

(* One refresh entry (MCS:99). rsn: auto = startup/background/settings-  *)
(* open (no signal, not explicit); explicit; pre = pre-inference (has a   *)
(* signal); change = provider-change from logout. ad: adapter captured at *)
(* request time (MCS:89). pc: queued (not started), recover (stub         *)
(* explicit discover waiting on the PDS queue), pub (discovered, publish  *)
(* next). w: abortable waiters; pin: a waiter with no signal exists.      *)
(* hold: logout awaits this entry inside the PDS queue. bh: its recover   *)
(* call queued behind a PDS hold. stale/oldAd/dead/sup: ghost marks.      *)
Entry(r, a, pin, w) ==
  [rsn |-> r, ad |-> a, pc |-> "queued", res |-> "none", stale |-> FALSE,
   oldAd |-> FALSE, dead |-> FALSE, sup |-> FALSE, ab |-> FALSE, w |-> w,
   pin |-> pin, hold |-> FALSE, bh |-> FALSE]

EntryT == [rsn : {"auto", "explicit", "pre", "change"}, ad : {"real", "stub"},
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
  /\ pdsHold \in {"none", "conn"} \cup Provs
  /\ events \in 0..MaxEvents /\ flips \in 0..MaxFlips
  /\ \A p \in Provs : Len(q[p]) <= MaxQ /\ \A i \in 1..Len(q[p]) : q[p][i] \in EntryT
  /\ closed \in BOOLEAN
  /\ conn \in [Provs -> BOOLEAN] /\ models \in [Provs -> BOOLEAN]
  /\ fam \in [Fams -> {"none", "active", "tomb"}] /\ cEn \in BOOLEAN
  /\ defFam \in Fams \cup {"none"} /\ defProv \in Provs /\ defMod \in BOOLEAN
  /\ {fStale, fStaleX, fStaleL, fOldAd, fOldAdX, fUnsafe, fDefault, fAdd, fJoin} \subseteq BOOLEAN

-----------------------------------------------------------------------------
(* Rust resolution (validate_model_selection_on, CAT:~1636): provider    *)
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
MarkOld(s)   == [i \in 1..Len(s) |-> [s[i] EXCEPT !.oldAd = TRUE]]
MarkDead(s)  == [i \in 1..Len(s) |-> IF s[i].ad = "real"
                                      THEN [s[i] EXCEPT !.dead = TRUE] ELSE s[i]]
MarkSup(s)   == [i \in 1..Len(s) |-> IF s[i].pc = "pub" /\ s[i].res = "models"
                                      THEN [s[i] EXCEPT !.sup = TRUE] ELSE s[i]]
ClearBh(s)   == [i \in 1..Len(s) |-> [s[i] EXCEPT !.bh = FALSE]]

\* The PDS queue is free and no recover call is queued ahead (FIFO).
PdsFree == /\ pdsHold = "none"
           /\ \A p \in Provs : \A i \in 1..Len(q[p]) :
                 ~(q[p][i].pc = "recover" /\ ~q[p][i].bh)

\* Settle the head entry (MCS:125-128). If logout awaited it, the PDS
\* queue is released (PDS:534 returns).
Dequeue(p, s) ==
  LET h == Head(s).hold
  IN /\ q' = [x \in Provs |-> LET t == IF x = p THEN Tail(s) ELSE q[x]
                              IN IF h THEN ClearBh(t) ELSE t]
     /\ pdsHold' = IF h THEN "none" ELSE pdsHold

(* publish_provider_catalog (SVC:619-663, CAT:685-769), one BEGIN        *)
(* IMMEDIATE transaction. Non-active providers are rejected (SVC:~638,   *)
(* CAT:~700-706). A connected snapshot with eligible models replaces the *)
(* managed family (replace_system_family CAT:2398-2516), reactivating    *)
(* the same family id (CAT:~2458) and moving an unset or managed default *)
(* (CAT:2504-2513). Zero eligible tombstones the managed family          *)
(* (CAT:758-766). A disconnected or unavailable snapshot has no managed  *)
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
    IN /\ conn' = nconn /\ models' = nmod /\ fam' = nfam
       /\ defFam' = ndf /\ defProv' = ndp
       /\ UNCHANGED <<cEn, defMod, fJoin>>
       /\ fStale' = (fStale \/ (e.stale /\ eff))
       /\ fStaleX' = (fStaleX \/ (e.stale /\ eff /\ Cls(r) /= Cls(CurTruth(p))))
       /\ fStaleL' = (fStaleL \/ (e.stale /\ eff /\ Cls(r) /= Cls(CurTruth(p))
                                  /\ isRefresh /\ Len(q[p]) = 1))
       /\ fOldAd' = (fOldAd \/ (e.oldAd /\ eff))
       /\ fOldAdX' = (fOldAdX \/ (e.oldAd /\ eff /\ Cls(r) /= Cls(CurTruth(p))))
       /\ fUnsafe' = (fUnsafe \/ (e.sup /\ r = "models"))
       \* Filling an unset family (NULL) for the unchanged default provider
       \* is not counted as changing the user's choice.
       /\ fDefault' = (fDefault \/ (isRefresh /\ defMod
                                    /\ (ndp /= defProv
                                        \/ (defFam /= "none" /\ ndf /= defFam))))
       /\ fAdd' = (fAdd \/ (isRefresh /\ ndp /= defProv))

NoMark == [stale |-> FALSE, oldAd |-> FALSE, sup |-> FALSE]

-----------------------------------------------------------------------------
(* Catalog service triggers.                                              *)

\* refresh() with a non-pre-inference reason always appends a new entry
\* chained after the current tail (MCS:97-131). Requires a registered
\* adapter (MCS:89-90). auto = startup (PC:84, MCS:140-146), background
\* timer (MCS:148-159), settings-open (register-ipc.mjs:151); explicit =
\* register-ipc.mjs:152. None of these callers passes a signal.
Request(p, r) ==
  /\ ~closed /\ adapter[p] /= "none" /\ Len(q[p]) < MaxQ
  /\ q' = [q EXCEPT ![p] = Append(@, Entry(r, adapter[p], TRUE, 0))]
  /\ UNCHANGED <<pdsVars, closed, rustVars, flagVars>>

\* Pre-inference (MCS:94-95, model-catalog-refresh-server.mjs:127-131):
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

\* A waiter's signal aborts (HTTP timeout, MCS:22-33). The last abortable
\* waiter of an entry with no unabortable waiter aborts it (MCS:27-29).
WaiterAbort(p, i) ==
  /\ i \in 1..Len(q[p]) /\ q[p][i].w > 0
  /\ q' = [q EXCEPT ![p][i].w = @ - 1,
                    ![p][i].ab = (@ \/ (q[p][i].w = 1 /\ ~q[p][i].pin))]
  /\ UNCHANGED <<pdsVars, closed, rustVars, flagVars>>

-----------------------------------------------------------------------------
(* The head entry runs (MCS:100-124).                                     *)

\* throwIfAborted before discovery (MCS:102): settles with no effect.
SkipAborted(p) ==
  /\ q[p] /= << >> /\ Head(q[p]).pc = "queued" /\ Head(q[p]).ab
  /\ Dequeue(p, q[p])
  /\ UNCHANGED <<life, acct, elig, adapter, hasRt, pending, events, flips, closed,
                 rustVars, flagVars>>

\* Discovery through a captured real adapter reads the current upstream
\* (MSA:39-79). A runtime closed since capture only fails (DiscoverFail).
DiscoverReal(p) ==
  /\ q[p] /= << >>
  /\ LET e == Head(q[p]) IN
     /\ e.pc = "queued" /\ ~e.ab /\ e.ad = "real" /\ ~e.dead
     /\ LET r == Upstream(p)
            s1 == [q[p] EXCEPT ![1].pc = "pub", ![1].res = r]
            s2 == IF r = "noelig"
                  THEN <<s1[1]>> \o MarkSup(Tail(s1)) ELSE s1
        IN q' = [q EXCEPT ![p] = s2]
  /\ UNCHANGED <<pdsVars, closed, rustVars, flagVars>>

\* The unavailable stub (PC:54-75) answers a non-explicit refresh with an
\* unavailable snapshot at once.
DiscoverStub(p) ==
  /\ q[p] /= << >>
  /\ LET e == Head(q[p]) IN
     /\ e.pc = "queued" /\ ~e.ab /\ e.ad = "stub" /\ e.rsn /= "explicit"
     /\ q' = [q EXCEPT ![p][1].pc = "pub", ![p][1].res = "unavail"]
  /\ UNCHANGED <<pdsVars, closed, rustVars, flagVars>>

\* An explicit refresh through the stub calls recoverUnavailable (PC:66),
\* whose first step is PDS #serialized (PDS:665). It queues behind any
\* current holder of the PDS queue.
StubRecoverCall(p) ==
  /\ q[p] /= << >>
  /\ LET e == Head(q[p]) IN
     /\ e.pc = "queued" /\ ~e.ab /\ e.ad = "stub" /\ e.rsn = "explicit"
     /\ q' = [q EXCEPT ![p][1].pc = "recover", ![p][1].bh = (pdsHold /= "none")]
  /\ UNCHANGED <<pdsVars, closed, rustVars, flagVars>>

\* recoverUnavailable runs (PDS:664-686): #runtimeFor creates and
\* registers the real runtime (PDS:636-656, onRuntimeReady PC:48-51) and
\* discovers through it. On failure the stub returns an unavailable
\* snapshot (PC:67-73); on abort it rethrows (PC:68).
RecoverRun(p, ok) ==
  /\ q[p] /= << >>
  /\ LET e == Head(q[p]) IN
     /\ e.pc = "recover" /\ (~e.bh \/ pdsHold = "none")
     /\ IF e.ab
        THEN /\ Dequeue(p, q[p])
             /\ UNCHANGED <<adapter, hasRt>>
        ELSE IF ok /\ life[p] = "active" /\ ~closed
        THEN LET reg == ~hasRt[p]
                 s1 == IF reg THEN <<Head(q[p])>> \o MarkOld(Tail(q[p])) ELSE q[p]
                 r == Upstream(p)
             IN /\ adapter' = IF reg THEN [adapter EXCEPT ![p] = "real"] ELSE adapter
                /\ hasRt' = [hasRt EXCEPT ![p] = TRUE]
                /\ q' = [q EXCEPT ![p] = [s1 EXCEPT ![1].pc = "pub", ![1].res = r]]
                /\ UNCHANGED pdsHold
        ELSE /\ q' = [q EXCEPT ![p][1].pc = "pub", ![p][1].res = "unavail"]
             /\ UNCHANGED <<adapter, hasRt, pdsHold>>
  /\ UNCHANGED <<life, acct, elig, pending, events, flips, closed, rustVars, flagVars>>

\* Discovery throws (retries exhausted, closed runtime): diagnostics only
\* (MCS:109-116).
DiscoverFail(p) ==
  /\ q[p] /= << >> /\ Head(q[p]).pc = "queued" /\ ~Head(q[p]).ab
  /\ Head(q[p]).ad = "real"
  /\ Dequeue(p, q[p])
  /\ UNCHANGED <<life, acct, elig, adapter, hasRt, pending, events, flips, closed,
                 rustVars, flagVars>>

\* throwIfAborted after discovery (MCS:118), then publishSnapshot
\* (MCS:119-122, relayer-app-server.mjs:303-322). An explicit refresh first
\* runs evaluateCatalogReadiness (PC:25-31), which throws for a non-active
\* definition; Rust rejects that case anyway.
Publish(p) ==
  /\ q[p] /= << >>
  /\ LET e == Head(q[p]) IN
     /\ e.pc = "pub"
     /\ IF e.ab THEN UNCHANGED <<rustVars, flagVars>>
        ELSE RustPublish(p, e.res, e, TRUE)
  /\ Dequeue(p, q[p])
  /\ UNCHANGED <<life, acct, elig, adapter, hasRt, pending, events, flips, closed>>

-----------------------------------------------------------------------------
(* Provider lifecycle (abstract; the other model owns connect internals). *)

\* logout (PDS:513-545): #runtimeFor registers a runtime if none exists,
\* the account is logged out, then onRuntimeChanged -> providerChanged
\* (PC:53) appends a refresh that logout AWAITS inside the PDS queue.
Logout(p) ==
  /\ "logout" \in Ops /\ ~closed /\ PdsFree /\ events < MaxEvents
  /\ life[p] = "active" /\ Len(q[p]) < MaxQ
  /\ LET reg == ~hasRt[p]
         ad  == IF reg THEN "real" ELSE adapter[p]
         s1  == MarkStale(IF reg THEN MarkOld(q[p]) ELSE q[p])
         ent == [Entry("change", ad, TRUE, 0) EXCEPT !.hold = TRUE]
     IN /\ adapter' = [adapter EXCEPT ![p] = ad]
        /\ hasRt' = [hasRt EXCEPT ![p] = TRUE]
        /\ IF ad = "none"   \* refresh throws "Unknown model provider"; logged
           THEN q' = [q EXCEPT ![p] = s1] /\ pdsHold' = "none"
           ELSE q' = [q EXCEPT ![p] = Append(s1, ent)] /\ pdsHold' = p
  /\ acct' = [acct EXCEPT ![p] = "disc"]
  /\ events' = events + 1
  /\ UNCHANGED <<life, elig, pending, flips, closed, rustVars, flagVars>>

\* reconnect (PDS:552-606): creates a runtime if none (unregistered) and
\* leaves a pending connection.
ReconnectStart(p) ==
  /\ "reconnect" \in Ops /\ ~closed /\ PdsFree /\ events < MaxEvents
  /\ life[p] = "active" /\ ~pending[p]
  /\ pending' = [pending EXCEPT ![p] = TRUE]
  /\ hasRt' = [hasRt EXCEPT ![p] = TRUE]
  /\ events' = events + 1
  /\ UNCHANGED <<life, acct, elig, adapter, pdsHold, flips, q, closed, rustVars,
                 flagVars>>

\* completeConnection for a reconnect (PDS:340-417): account connected,
\* discover in the PDS, onRuntimeReady, then publishCatalog DIRECTLY
\* (PDS:412), not through the catalog queue. The connection generation
\* changes here.
ReconnectComplete(p) ==
  /\ ~closed /\ PdsFree /\ pending[p] /\ life[p] = "active"
  /\ LET r   == IF elig[p] THEN "models" ELSE "noelig"
         reg == adapter[p] /= "real"
         s1  == MarkStale(IF reg THEN MarkOld(q[p]) ELSE q[p])
         s2  == IF r = "noelig" THEN MarkSup(s1) ELSE s1
     IN /\ q' = [q EXCEPT ![p] = s2]
        /\ RustPublish(p, r, NoMark, FALSE)
  /\ acct' = [acct EXCEPT ![p] = "conn"]
  /\ adapter' = [adapter EXCEPT ![p] = "real"]
  /\ pending' = [pending EXCEPT ![p] = FALSE]
  /\ UNCHANGED <<life, elig, hasRt, pdsHold, events, flips, closed>>

\* A failed or cancelled reconnect (#cancelPendingConnection PDS:462-481):
\* closes the runtime and unregisters the catalog adapter.
ReconnectCancel(p) ==
  /\ PdsFree /\ pending[p]
  /\ pending' = [pending EXCEPT ![p] = FALSE]
  /\ adapter' = [adapter EXCEPT ![p] = "none"]
  /\ hasRt' = [hasRt EXCEPT ![p] = FALSE]
  /\ q' = [q EXCEPT ![p] = MarkDead(MarkOld(@))]
  /\ UNCHANGED <<life, acct, elig, pdsHold, events, flips, closed, rustVars, flagVars>>

\* remove (PDS:721-761) with guard_provider_removal (CAT:2635-2685) and
\* tombstone_managed_provider_families (CAT:185-188). No running turns in
\* this model, so removal_pending finalizes at once: the runtime closes and
\* the adapter is unregistered (PC:52).
RemoveGuard(p) ==
  /\ defProv /= p
  /\ IF defFam = "none" THEN TRUE
     ELSE FamEnabled(defFam) /\ \E m \in Members(defFam) \ {p} : MemberOK(m)
Remove(p) ==
  /\ "remove" \in Ops /\ ~closed /\ PdsFree /\ events < MaxEvents
  /\ life[p] = "active" /\ RemoveGuard(p)
  /\ life' = [life EXCEPT ![p] = "tombstoned"]
  /\ fam' = IF fam[M(p)] = "active" THEN [fam EXCEPT ![M(p)] = "tomb"] ELSE fam
  /\ adapter' = [adapter EXCEPT ![p] = "none"]
  /\ hasRt' = [hasRt EXCEPT ![p] = FALSE]
  /\ pending' = [pending EXCEPT ![p] = FALSE]
  /\ q' = [q EXCEPT ![p] = MarkDead(MarkOld(MarkStale(@)))]
  /\ events' = events + 1
  /\ UNCHANGED <<acct, elig, pdsHold, flips, closed, conn, models, cEn, defFam,
                 defProv, defMod, flagVars>>

\* connect (PDS:196-316), abstract: inside one PDS operation the adapter
\* is registered (PDS:276) before the definition and catalog commit
\* atomically (createWithCatalog, CAT:~230-270, reconcile default = false).
ConnectRegister(p) ==
  /\ WithQ /\ ~closed /\ PdsFree /\ life[p] = "absent" /\ adapter[p] = "none"
  /\ adapter' = [adapter EXCEPT ![p] = "real"]
  /\ hasRt' = [hasRt EXCEPT ![p] = TRUE]
  /\ pdsHold' = "conn"
  /\ UNCHANGED <<life, acct, elig, pending, events, flips, q, closed, rustVars,
                 flagVars>>

ConnectCommit(p) ==
  /\ pdsHold = "conn" /\ life[p] = "absent" /\ adapter[p] = "real"
  /\ life' = [life EXCEPT ![p] = "active"]
  /\ acct' = [acct EXCEPT ![p] = "conn"]
  /\ conn' = [conn EXCEPT ![p] = TRUE]
  /\ models' = [models EXCEPT ![p] = elig[p]]
  /\ fam' = IF elig[p] THEN [fam EXCEPT ![M(p)] = "active"] ELSE fam
  /\ pdsHold' = "none"
  /\ q' = [x \in Provs |-> ClearBh(q[x])]
  /\ UNCHANGED <<elig, adapter, hasRt, pending, events, flips, closed, cEn, defFam,
                 defProv, defMod, flagVars>>

ConnectFail(p) ==
  /\ pdsHold = "conn" /\ life[p] = "absent" /\ adapter[p] = "real"
  /\ adapter' = [adapter EXCEPT ![p] = "none"]
  /\ hasRt' = [hasRt EXCEPT ![p] = FALSE]
  /\ pdsHold' = "none"
  /\ q' = [x \in Provs |-> IF x = p THEN MarkDead(MarkOld(ClearBh(q[x])))
                           ELSE ClearBh(q[x])]
  /\ UNCHANGED <<life, acct, elig, pending, events, flips, closed, rustVars, flagVars>>

-----------------------------------------------------------------------------
(* User settings (Rust).                                                  *)

\* update_model_settings_defaults with providerId only (CAT:583-683;
\* model-family-settings.js:536-572). With the fix, paired_default_on
\* (CAT:2102-2146) selects the provider's enabled managed family in the same
\* transaction and refuses a provider without one. The family must then
\* resolve under a harness, which default_harness_for_family_on (CAT:2062-2095)
\* moves when needed; the model has no harness, so Resolvable stands for
\* "some harness can run it" (CAT:658-672). Without the fix, only the
\* provider was stored.
SetDefaultProvider(p) ==
  /\ UserOps /\ life[p] = "active" /\ conn[p] /\ defProv /= p
  /\ IF DefaultProviderPairsFamily
     THEN Resolvable(M(p)) /\ defFam' = M(p)
     ELSE UNCHANGED defFam
  /\ defProv' = p /\ defMod' = TRUE
  /\ UNCHANGED <<pdsVars, elig, q, closed, conn, models, fam, cEn, flagVars>>

\* update_model_settings_defaults with familyId (resolvable), or
\* complete_provider_onboarding (CAT:928-1074). The pair is chosen together:
\* onboarding requires a resolvable member from p (CAT:1577-1634), and a
\* managed family chosen alone brings its own provider (CAT:2102-2146).
\* The Settings UI never saves a family alone.
SetDefaultFamily(f, p) ==
  /\ UserOps /\ Resolvable(f) /\ p \in Members(f) /\ MemberOK(p)
  /\ <<defFam, defProv>> /= <<f, p>>
  /\ defFam' = f /\ defProv' = p /\ defMod' = TRUE
  /\ UNCHANGED <<pdsVars, elig, q, closed, conn, models, fam, cEn, flagVars>>

\* update_model_family (CAT:805-846) refuses to disable the default.
ToggleCustom ==
  /\ UserOps /\ fam["C"] = "active" /\ (cEn => defFam /= "C")
  /\ cEn' = ~cEn
  /\ UNCHANGED <<pdsVars, elig, q, closed, conn, models, fam, defFam,
                 defProv, defMod, flagVars>>

\* The provider's upstream model list changes.
FlipElig(p) ==
  /\ flips < MaxFlips /\ flips' = flips + 1
  /\ elig' = [elig EXCEPT ![p] = ~@]
  /\ UNCHANGED <<life, acct, adapter, hasRt, pending, pdsHold, events, q,
                 closed, rustVars, flagVars>>

\* close() (MCS:161-167): aborts every entry.
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
  \* Startup activation (PDS:688-719) either registered P's runtime or,
  \* on failure, the unavailable stub (PC:54-75).
  /\ adapter \in {[p \in Provs |-> IF p = "P" THEN a ELSE "none"] : a \in InitAdapters}
  /\ hasRt = [p \in Provs |-> adapter[p] = "real"]
  /\ pending = [p \in Provs |-> FALSE]
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
       \/ SkipAborted(p) \/ DiscoverReal(p) \/ DiscoverStub(p)
       \/ StubRecoverCall(p) \/ \E ok \in BOOLEAN : RecoverRun(p, ok)
       \/ DiscoverFail(p) \/ Publish(p)
       \/ Logout(p) \/ ReconnectStart(p) \/ ReconnectComplete(p)
       \/ ReconnectCancel(p) \/ Remove(p)
       \/ ConnectRegister(p) \/ ConnectCommit(p) \/ ConnectFail(p)
       \/ SetDefaultProvider(p) \/ FlipElig(p)
       \/ \E f \in Fams : SetDefaultFamily(f, p)
  \/ ToggleCustom \/ Close

\* Fairness: the queue steps the code always runs once reachable (promise
\* continuations), strong fairness on successful discovery (a provider
\* that stays healthy eventually answers), and the background timer
\* (MCS:148-159) as weak fairness on an auto request.
Fairness ==
  /\ \A p \in Provs :
       /\ WF_vars(SkipAborted(p)) /\ WF_vars(DiscoverStub(p))
       /\ WF_vars(StubRecoverCall(p)) /\ WF_vars(\E ok \in BOOLEAN : RecoverRun(p, ok))
       /\ WF_vars(Publish(p)) /\ SF_vars(DiscoverReal(p))
       /\ WF_vars(Request(p, "auto"))
       /\ WF_vars(ConnectCommit(p) \/ ConnectFail(p))

Spec == Init /\ [][Next]_vars
FairSpec == Spec /\ Fairness

-----------------------------------------------------------------------------
(* Properties.                                                            *)

\* DRAFT PROV-002: a result started before logout/reconnect/remove has no
\* family, default, or catalog effect.
NoStaleEffect == ~fStale
\* Narrower: the stale effect contradicts what the current generation
\* would publish (the stale result is not merely redundant).
NoContradictingStaleEffect == ~fStaleX
\* Narrower still: the contradicting stale result is the last publish for
\* the provider (no refresh queued behind it corrects it).
NoPersistingStaleEffect == ~fStaleL
\* DRAFT PROV-002: a result produced through an adapter that was replaced
\* or unregistered after the refresh was requested has no effect.
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
\* CODE (replace_system_family comment CAT:2505-2506, prd:780): only this
\* provider's managed family and an unset/managed default change; the
\* custom family is never touched by a catalog publish.
OnlyOwnFamily ==
  [][\A p \in Provs :
       (/\ q[p] /= << >> /\ Head(q[p]).pc = "pub"
        /\ Publish(p))
         => /\ \A f \in Fams \ {M(p)} : fam'[f] = fam[f]
            /\ cEn' = cEn]_vars

\* DRAFT (tombstoned default) liveness: it restores once its provider
\* is healthy and its refresh machinery is registered.
Healthy(ad) == /\ life["P"] = "active" /\ acct["P"] = "conn" /\ elig["P"]
               /\ ~closed /\ adapter["P"] \in ad
TombP == defFam = "mP" /\ fam["mP"] = "tomb"
DefaultRestores ==
  (TombP /\ Healthy({"real"})) ~> (~TombP \/ ~Healthy({"real"}))
\* Same, without assuming the adapter is the real runtime.
DefaultRestoresAnyAdapter ==
  (TombP /\ Healthy({"real", "stub", "none"}))
    ~> (~TombP \/ ~Healthy({"real", "stub", "none"}))
\* CODE: logout returns (it holds the PDS queue while it awaits).
LogoutReturns == (pdsHold \in Provs) ~> (pdsHold = "none")
\* CODE: close() settles every refresh (MCS:166).
CloseDrains == closed ~> (\A p \in Provs : q[p] = << >>)
=============================================================================
