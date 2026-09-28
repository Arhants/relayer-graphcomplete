--------------------------- MODULE HarnessReadiness ---------------------------
(***************************************************************************)
(* Harness readiness generations, the readiness record, and a restart.    *)
(*                                                                         *)
(* Source of truth (every action cites the code it abstracts):            *)
(*   HR  = desktop/main/services/harness-readiness.mjs                     *)
(*   IDX = desktop/main/index.mjs                                          *)
(*   GCR = desktop/main/services/graphcomplete-runtime.mjs                 *)
(*   RAS = desktop/main/services/relayer-app-server.mjs                    *)
(*   CAT = crates/relayer-app-server/src/storage/sqlite/catalog.rs         *)
(*   RT  = crates/relayer-app-server/src/runtime.rs                        *)
(*   ATT = crates/relayer-app-server/src/storage/sqlite/attempts.rs        *)
(*                                                                         *)
(* Scope. One harness configuration H whose readiness concurrent          *)
(* evaluate() calls (connect, reconnect, explicit refresh) measure.       *)
(*   rust = product_harnesses.available and runtime_configuration_digest. *)
(*          rust.gen is the generation of the publication Rust holds:     *)
(*          in memory with RustRejectsOlderGeneration, a ghost otherwise. *)
(*   json = the harness-configurations.json entry for H. Before the fix   *)
(*          it was a second readiness record (runtimeAvailable,           *)
(*          readinessGeneration) that startup restored from.              *)
(*                                                                         *)
(* Candidate fixes (README: a `*-today` preset mirrors the code):         *)
(*   RustIsReadinessRecord: Electron publishes readiness to Rust only,    *)
(*     and startup restores ready from Rust's own row (R1, R2).           *)
(*   RustRejectsOlderGeneration: Rust rejects a generation lower than     *)
(*     one it accepted for H in the same process (R3).                    *)
(*                                                                         *)
(* Abstractions:                                                          *)
(*  - Recipe preparation and the checker are one step with a free result. *)
(*  - The Rust PUT is sent once (fetch) and applied in one BEGIN          *)
(*    IMMEDIATE transaction. RequestCanOutliveClient lets the client see  *)
(*    an error while the request still reaches Rust later (plausible:    *)
(*    a connection reset after send while the handler waits on SQLite).  *)
(*  - The JSON read-modify-write is one atomic step that may fail.        *)
(*  - Restart = crash at any point plus the whole next startup, which     *)
(*    finishes before any evaluation can start (IDX graphRuntime.start,   *)
(*    then productServer.start). The app server stops with Electron, so   *)
(*    requests in flight die with it.                                     *)
(*  - The configuration digest is constant within a process and may      *)
(*    change across a restart (new configuration files or an update).    *)
(***************************************************************************)
EXTENDS Naturals, Sequences, FiniteSets

CONSTANTS
  Evals,                      \* evaluate() calls over the whole run
  Digests,                    \* configuration digests H may have
  InitDigest,                 \* digest of the first process
  MaxRestarts,                \* restarts (crash + startup)
  JsonWriteCanFail,           \* the JSON readiness write can fail after Rust committed
  ValidationCanFail,          \* startup file validation can reject the runtime
  RequestCanOutliveClient,    \* a readiness PUT can reach Rust after its client gave up
  RustIsReadinessRecord,      \* fix R1/R2
  RustRejectsOlderGeneration  \* fix R3

VARIABLES
  gen,        \* HR `generation`
  hgen,       \* HR `harnessGenerations.get(H)`, 0 = unset
  ev,         \* e -> [pc, gen, avail]
  chain,      \* HR `publication` promise chain (FIFO of queued evaluations)
  epoch,      \* process epoch (ghost)
  digest,     \* current configuration digest
  restarts,
  rust,       \* [avail, gen, ep, digest]
  json,       \* [avail, gen, digest]
  lastMeasured, \* ghost: the latest evaluation result Rust committed
  restore,    \* ghost: what the latest startup restored, and from what
  admitBad    \* ghost: a turn was admitted while lastMeasured said unavailable

vars == <<gen, hgen, ev, chain, epoch, digest, restarts, rust, json,
          lastMeasured, restore, admitBad>>

PCs == {"idle", "checking", "checked", "queued", "sent", "orphan", "json",
        "done", "lost"}
Gens == 0..Cardinality(Evals)
Idle == [pc |-> "idle", gen |-> 0, avail |-> FALSE]
Quiescent == \A e \in Evals : ev[e].pc \in {"idle", "done", "lost"}
\* The record startup restores readiness from (GCR startup; CAT
\* initialize_model_catalog).
RestoreRecord == IF RustIsReadinessRecord THEN rust ELSE json

Init ==
  \* First startup: no previous record, so H starts unavailable.
  /\ gen = 0
  /\ hgen = 0
  /\ ev = [e \in Evals |-> Idle]
  /\ chain = <<>>
  /\ epoch = 1
  /\ digest = InitDigest
  /\ restarts = 0
  /\ rust = [avail |-> FALSE, gen |-> 0, ep |-> 1, digest |-> InitDigest]
  /\ json = [avail |-> FALSE, gen |-> 0, digest |-> InitDigest]
  /\ lastMeasured = [set |-> FALSE, avail |-> FALSE, digest |-> InitDigest]
  /\ restore = [done |-> FALSE, avail |-> FALSE, valid |-> FALSE,
                preRust |-> [avail |-> FALSE, gen |-> 0, ep |-> 1, digest |-> InitDigest]]
  /\ admitBad = FALSE

TypeOK ==
  /\ gen \in Gens /\ hgen \in Gens
  /\ ev \in [Evals -> [pc : PCs, gen : Gens, avail : BOOLEAN]]
  /\ chain \in Seq(Evals)
  /\ epoch \in 1..(MaxRestarts + 1) /\ restarts \in 0..MaxRestarts
  /\ digest \in Digests
  /\ rust \in [avail : BOOLEAN, gen : Gens, ep : 1..(MaxRestarts + 1), digest : Digests]
  /\ json \in [avail : BOOLEAN, gen : Gens, digest : Digests]
  /\ lastMeasured \in [set : BOOLEAN, avail : BOOLEAN, digest : Digests]
  /\ restore.done \in BOOLEAN /\ restore.avail \in BOOLEAN
  /\ admitBad \in BOOLEAN

-----------------------------------------------------------------------------
(* A connect, reconnect, or explicit refresh with at least one candidate. *)
(* HR evaluate: `++generation` and `harnessGenerations.set`, synchronous. *)
EvalStart(e) ==
  /\ ev[e].pc = "idle"
  /\ gen' = gen + 1
  /\ hgen' = gen + 1
  /\ ev' = [ev EXCEPT ![e] = [pc |-> "checking", gen |-> gen + 1, avail |-> FALSE]]
  /\ UNCHANGED <<chain, epoch, digest, restarts, rust, json, lastMeasured,
                 restore, admitBad>>

(* HR evaluate: prepareRecipe, then the implementation checker (IDX       *)
(* checkers). Any result; a throw is "unavailable".                       *)
EvalCheck(e) ==
  /\ ev[e].pc = "checking"
  /\ \E a \in BOOLEAN : ev' = [ev EXCEPT ![e].pc = "checked", ![e].avail = a]
  /\ UNCHANGED <<gen, hgen, chain, epoch, digest, restarts, rust, json,
                 lastMeasured, restore, admitBad>>

(* HR evaluate after Promise.all: keep only the current generation, then  *)
(* append to the publication chain.                                       *)
EvalFilter(e) ==
  /\ ev[e].pc = "checked"
  /\ IF hgen = ev[e].gen
     THEN /\ ev' = [ev EXCEPT ![e].pc = "queued"]
          /\ chain' = Append(chain, e)
     ELSE /\ ev' = [ev EXCEPT ![e].pc = "done"]
          /\ UNCHANGED chain
  /\ UNCHANGED <<gen, hgen, epoch, digest, restarts, rust, json,
                 lastMeasured, restore, admitBad>>

(* HR publish: once the previous publication settled, filter again, then  *)
(* publishAvailability sends the Rust PUT (RAS publishHarnessReadiness).  *)
PubFilter ==
  /\ chain /= <<>>
  /\ LET e == Head(chain) IN
     /\ ev[e].pc = "queued"
     /\ IF hgen = ev[e].gen
        THEN /\ ev' = [ev EXCEPT ![e].pc = "sent"]
             /\ UNCHANGED chain
        ELSE /\ ev' = [ev EXCEPT ![e].pc = "done"]
             /\ chain' = Tail(chain)
  /\ UNCHANGED <<gen, hgen, epoch, digest, restarts, rust, json,
                 lastMeasured, restore, admitBad>>

(* The client sees an error while its request still reaches Rust. The    *)
(* evaluation rejects and the chain moves on (HR `publication.catch`).   *)
ClientGivesUp ==
  /\ RequestCanOutliveClient
  /\ chain /= <<>>
  /\ LET e == Head(chain) IN
     /\ ev[e].pc = "sent"
     /\ ev' = [ev EXCEPT ![e].pc = "orphan"]
     /\ chain' = Tail(chain)
  /\ UNCHANGED <<gen, hgen, epoch, digest, restarts, rust, json,
                 lastMeasured, restore, admitBad>>

(* CAT update_harness_runtime_availability: one transaction, guarded by   *)
(* the digest (constant within a process) and, with the R3 fix, by the   *)
(* highest generation accepted for H in this process. A rejection is an  *)
(* HTTP error, so the client's evaluation rejects and the chain moves on. *)
(* Without RustIsReadinessRecord, IDX publishAvailability then writes the *)
(* JSON catalog (GCR recordHarnessReadiness, removed by the fix).         *)
RustApply(e) ==
  /\ ev[e].pc \in {"sent", "orphan"}
  /\ LET accept == ~RustRejectsOlderGeneration \/ ev[e].gen >= rust.gen
         client == ev[e].pc = "sent"
     IN /\ rust' = IF accept
                   THEN [avail |-> ev[e].avail, gen |-> ev[e].gen, ep |-> epoch,
                         digest |-> digest]
                   ELSE rust
        /\ lastMeasured' = IF accept
                           THEN [set |-> TRUE, avail |-> ev[e].avail, digest |-> digest]
                           ELSE lastMeasured
        /\ IF client /\ accept /\ ~RustIsReadinessRecord
           THEN /\ ev' = [ev EXCEPT ![e].pc = "json"]
                /\ UNCHANGED chain
           ELSE /\ ev' = [ev EXCEPT ![e].pc = "done"]
                /\ chain' = IF client THEN Tail(chain) ELSE chain
  /\ UNCHANGED <<gen, hgen, epoch, digest, restarts, json, restore, admitBad>>

(* Before the fix: GCR recordHarnessReadiness skips an entry whose digest *)
(* differs or whose generation would decrease, then writes tmp + rename.  *)
PubJson ==
  /\ chain /= <<>>
  /\ LET e == Head(chain) IN
     /\ ev[e].pc = "json"
     /\ json' = IF json.digest = digest /\ ev[e].gen >= json.gen
                THEN [avail |-> ev[e].avail, gen |-> ev[e].gen, digest |-> digest]
                ELSE json
     /\ ev' = [ev EXCEPT ![e].pc = "done"]
     /\ chain' = Tail(chain)
  /\ UNCHANGED <<gen, hgen, epoch, digest, restarts, rust, lastMeasured,
                 restore, admitBad>>

(* Before the fix: the JSON write throws after Rust committed (I/O error, *)
(* or the session closed during quit). The chain swallows it.            *)
PubJsonFail ==
  /\ JsonWriteCanFail
  /\ chain /= <<>>
  /\ LET e == Head(chain) IN
     /\ ev[e].pc = "json"
     /\ ev' = [ev EXCEPT ![e].pc = "done"]
     /\ chain' = Tail(chain)
  /\ UNCHANGED <<gen, hgen, epoch, digest, restarts, rust, json, lastMeasured,
                 restore, admitBad>>

(* Crash or quit at any point, then the next startup.                     *)
(*  GCR start: validateHarnessRuntime is file-only (installer             *)
(*    validateInstalledRecipe); `ok` is its result.                       *)
(*  Before the fix: startup restored ready from the previous JSON entry   *)
(*    (same digest, runtimeAvailable) and Rust rebuilt its row from that  *)
(*    JSON (RT product_harnesses; CAT initialize_model_catalog reset).    *)
(*  With the fix: the JSON carries only `ok`; CAT initialize_model_catalog *)
(*    reads Rust's own previous row before its reset and restores ready   *)
(*    only when that row was ready for the same digest and `ok` holds.    *)
(*  HR and the app server's generation map restart from 0.                *)
Restart ==
  /\ restarts < MaxRestarts
  /\ \E d \in Digests, ok \in (IF ValidationCanFail THEN BOOLEAN ELSE {TRUE}) :
       LET a == RestoreRecord.digest = d /\ RestoreRecord.avail /\ ok
       IN /\ json' = IF RustIsReadinessRecord THEN json
                     ELSE [avail |-> a, gen |-> 0, digest |-> d]
          /\ rust' = [avail |-> a, gen |-> 0, ep |-> epoch + 1, digest |-> d]
          /\ restore' = [done |-> TRUE, avail |-> a, valid |-> ok, preRust |-> rust]
          /\ digest' = d
  /\ restarts' = restarts + 1
  /\ epoch' = epoch + 1
  /\ gen' = 0
  /\ hgen' = 0
  /\ chain' = <<>>
  /\ ev' = [e \in Evals |-> IF ev[e].pc \in {"idle", "done"} THEN ev[e]
                            ELSE [ev[e] EXCEPT !.pc = "lost"]]
  /\ UNCHANGED <<lastMeasured, admitBad>>

(* ATT begin_interaction_attempt admits only WHERE available=1 with the   *)
(* matching digest. Read-only; the ghost records an admission while the   *)
(* latest result Rust committed for this digest said unavailable.         *)
Admit ==
  /\ rust.avail /\ rust.digest = digest
  /\ admitBad' = (admitBad \/ (lastMeasured.set /\ ~lastMeasured.avail
                               /\ lastMeasured.digest = digest))
  /\ UNCHANGED <<gen, hgen, ev, chain, epoch, digest, restarts, rust, json,
                 lastMeasured, restore>>

Next ==
  \/ \E e \in Evals : EvalStart(e) \/ EvalCheck(e) \/ EvalFilter(e) \/ RustApply(e)
  \/ PubFilter \/ ClientGivesUp \/ PubJson \/ PubJsonFail
  \/ Restart
  \/ Admit

(* Once started, evaluate() and the publication chain run to completion, *)
(* and a sent request reaches Rust. Triggers, restarts, admissions, and   *)
(* failures are not forced.                                               *)
Fairness ==
  /\ \A e \in Evals : WF_vars(EvalCheck(e)) /\ WF_vars(EvalFilter(e)) /\ WF_vars(RustApply(e))
  /\ WF_vars(PubFilter) /\ WF_vars(PubJson)

Spec == Init /\ [][Next]_vars
FairSpec == Spec /\ Fairness

-----------------------------------------------------------------------------
(* PRD: results publish only for the matching configuration digest.       *)
PRD_MatchingDigest ==
  /\ rust.digest = digest
  /\ ~RustIsReadinessRecord => json.digest = digest

(* PROV-006: startup restores a ready route only from the app server's    *)
(* own record, for the same digest, when the runtime files validate.     *)
PROV006_RestoreOnlyFromRecord ==
  (restore.done /\ restore.avail) =>
    (restore.preRust.avail /\ restore.preRust.digest = digest /\ restore.valid)

(* PROV-006: admission never follows a ready that the latest result the   *)
(* app server committed has withdrawn.                                    *)
PROV006_AdmitOnlyLatestReady == ~admitBad

(* PROV-006 (R2): the record startup restores from agrees with the app    *)
(* server once publication is quiet.                                      *)
ReadinessRecordsAgree ==
  Quiescent => (RestoreRecord.avail = rust.avail /\ RestoreRecord.digest = rust.digest)

(* PROV-005: within one app-server process, a result from an older        *)
(* evaluation is never published over a newer one.                       *)
PROV005_NeverOverNewer ==
  [][(epoch' = epoch /\ rust' /= rust) => rust'.gen >= rust.gen]_vars

(* The latest evaluation always reaches the app server.                  *)
LIVE_LatestReachesRust == <>[](Quiescent /\ rust.gen = gen)
=============================================================================
