---------------------------- MODULE ReadinessRepair ----------------------------
(***************************************************************************)
(* Harness readiness across Repair, restart and upgrade, for two providers *)
(* that share one harness: codex-basic serves ChatGPT (codex-subscription) *)
(* and OpenRouter (desktop/shared/managed-runtime-requirements.mjs).       *)
(*                                                                         *)
(* Code (every action cites what it abstracts):                            *)
(*   HR  = desktop/main/services/harness-readiness.mjs                     *)
(*   INS = desktop/main/managed-runtimes/installer.mjs                     *)
(*   RES = desktop/main/managed-runtimes/resolver.mjs                      *)
(*   GCR = desktop/main/services/graphcomplete-runtime.mjs                 *)
(*   IDX = desktop/main/index.mjs                                          *)
(*   PC  = desktop/main/providers/provider-composition.mjs                 *)
(*   CAT = crates/relayer-app-server/src/storage/sqlite/catalog.rs         *)
(*                                                                         *)
(* The managed runtime has two health predicates:                          *)
(*   files = what startup's cheap validation checks (INS                   *)
(*           validateOwnedLayout): exact receipt, ownership marker, owned  *)
(*           real private-state directory, entrypoints confined to the     *)
(*           installation.                                                 *)
(*   execs = what the version probe checks: the entrypoints execute and    *)
(*           report the recipe's version (stat follows symlinks).          *)
(*                                                                         *)
(* Fix constants (each -reverted check turns one off):                     *)
(*   RepairRevalidates: preparation reuses an installation only when it    *)
(*     passes startup's full validation as well as the probe (INS          *)
(*     probeReceipt). FALSE is the code before the fix: the probe alone.   *)
(*   UpgradeEvaluates: an upgrade that changes the configuration digest    *)
(*     marks the route due in the app server (CAT initialize_model_catalog,*)
(*     readiness_update_due). Desktop then starts one background           *)
(*     evaluation through the recipe-update trigger (IDX, HR               *)
(*     evaluateRecipeUpdate). A committed result clears the mark (CAT      *)
(*     update_harness_runtime_availability). FALSE: the route stays        *)
(*     pending until a Connect or Repair (issue #556).                     *)
(*                                                                         *)
(* Abstractions: prepare and checker are one step (HR evaluate; the IDX    *)
(* checkers accept any well-formed descriptor). installer.prepare          *)
(* coalesces per runtime, so concurrent preparations are atomic here. A    *)
(* reinstall may fail (network). Publication failures and requests that    *)
(* outlive their client are not modeled; HarnessReadiness.tla covers them. *)
(* Restart kills in-flight evaluations and runs the whole startup (GCR     *)
(* start, CAT initialize_model_catalog). An upgrade is a restart that may  *)
(* change the configuration digest or leave the active runtime on an older *)
(* recipe. A newly activated recipe also triggers the automatic            *)
(* evaluation in the code; that trigger is Desktop memory and not modeled. *)
(***************************************************************************)
EXTENDS Naturals, Sequences, FiniteSets

CONSTANTS Providers, Evals, MaxRestarts, MaxTampers,
          UpgradeCanChangeDigest, UpgradeCanChangeRecipe,
          StartsPreRule,        \* an older build left the row ready (pre-0034)
          RepairRevalidates,    \* fix R1
          UpgradeEvaluates      \* fix for #556

VARIABLES
  installed, recipeOK, files, execs,   \* managed runtime on disk
  digest,                              \* current configuration digest (1..2)
  rust,                                \* product_harnesses row for the harness
  due,                                 \* CAT readiness_update_due
  acc,                                 \* CAT accepted generation, 0 = none
  gen, hgen,                           \* HR generation, harnessGenerations(H)
  ev, chain,                           \* in-flight evaluations, publication FIFO
  autoStarted,                         \* this process started its upgrade evaluation
  restarts, tampers,
  \* ghosts
  cleanReady,     \* Rust ready from a publication; runtime untouched since
  justRestarted,  \* the last step was a restart
  restartKept,    \* the last restart kept digest and recipe
  badPublish,     \* a ready publication observed ~files
  crossRestore,   \* an evaluation not for a provider made that provider's route ready
  blocked,        \* providers whose route Rust held unavailable
  latestAvail,    \* result of the evaluation with gen = hgen: 0 none, 1 no, 2 yes
  lostRepair,     \* a restart that kept digest and recipe dropped a clean ready
  upgradePending  \* a changed digest has no committed evaluation yet

vars == <<installed, recipeOK, files, execs, digest, rust, due, acc, gen, hgen,
          ev, chain, autoStarted, restarts, tampers, cleanReady, justRestarted,
          restartKept, badPublish, crossRestore, blocked, latestAvail, lostRepair,
          upgradePending>>

Auto == "recipe-update"   \* the provider field of the automatic evaluation
Idle == [pc |-> "idle", gen |-> 0, prov |-> Auto, avail |-> FALSE, tamp |-> 0]
Validate == installed /\ recipeOK /\ files          \* INS validateInstalledRecipe

Init ==
  /\ installed = TRUE /\ recipeOK = TRUE /\ files = TRUE /\ execs = TRUE
  /\ digest = 1
  /\ rust = [ready |-> StartsPreRule, digest |-> 1, preRule |-> StartsPreRule]
  /\ due = FALSE
  /\ acc = 0 /\ gen = 0 /\ hgen = 0
  /\ ev = [e \in Evals |-> Idle]
  /\ chain = <<>>
  /\ autoStarted = FALSE
  /\ restarts = 0 /\ tampers = 0
  /\ cleanReady = FALSE /\ justRestarted = FALSE /\ restartKept = FALSE
  /\ badPublish = FALSE /\ crossRestore = FALSE
  /\ blocked = IF StartsPreRule THEN {} ELSE Providers
  /\ latestAvail = 0
  /\ lostRepair = FALSE
  /\ upgradePending = FALSE

Begin(e, p) ==
  /\ ev[e].pc = "idle"
  /\ gen' = gen + 1
  /\ hgen' = gen + 1
  /\ ev' = [ev EXCEPT ![e] = [pc |-> "prep", gen |-> gen + 1, prov |-> p, avail |-> FALSE, tamp |-> 0]]
  /\ latestAvail' = 0
  /\ justRestarted' = FALSE

(* Connect, reconnect or explicit Repair for provider p (HR evaluate;     *)
(* PC publishSnapshot for explicit-repair).                                *)
Start(e, p) ==
  /\ Begin(e, p)
  /\ UNCHANGED <<lostRepair, installed, recipeOK, files, execs, digest, rust, due, acc,
                 chain, autoStarted, restarts, tampers, cleanReady, restartKept,
                 badPublish, crossRestore, blocked, upgradePending>>

(* The one background evaluation after an upgrade: IDX reads CAT's due    *)
(* marks after startup and calls HR evaluateRecipeUpdate for every        *)
(* provider with a route through the harness.                             *)
AutoStart(e) ==
  /\ UpgradeEvaluates /\ due /\ ~autoStarted
  /\ Begin(e, Auto)
  /\ autoStarted' = TRUE
  /\ UNCHANGED <<lostRepair, installed, recipeOK, files, execs, digest, rust, due, acc,
                 chain, restarts, tampers, cleanReady, restartKept, badPublish,
                 crossRestore, blocked, upgradePending>>

(* prepareRecipe -> RES.prepare -> INS.prepare -> install(): reuse when   *)
(* the active receipt is the exact recipe and probeReceipt passes, else a *)
(* fresh install that activates atomically or fails leaving the active    *)
(* installation untouched. Then the checker and the HR filter.            *)
Reuse == installed /\ recipeOK /\ execs /\ (RepairRevalidates => files)

Finish(e, avail, observedFiles) ==
  /\ ev' = [ev EXCEPT ![e].pc = IF ev[e].gen = hgen THEN "queued" ELSE "done",
                      ![e].avail = avail, ![e].tamp = tampers]
  /\ chain' = IF ev[e].gen = hgen THEN Append(chain, e) ELSE chain
  /\ latestAvail' = IF ev[e].gen = hgen THEN (IF avail THEN 2 ELSE 1) ELSE latestAvail
  /\ badPublish' = (badPublish \/ (ev[e].gen = hgen /\ avail /\ ~observedFiles))

PrepareReuse(e) ==
  /\ ev[e].pc = "prep" /\ Reuse
  /\ Finish(e, TRUE, files)
  /\ justRestarted' = FALSE
  /\ UNCHANGED <<lostRepair, installed, recipeOK, files, execs, digest, rust, due, acc, gen,
                 hgen, autoStarted, restarts, tampers, cleanReady, restartKept,
                 crossRestore, blocked, upgradePending>>

PrepareInstall(e) ==
  /\ ev[e].pc = "prep" /\ ~Reuse
  /\ installed' = TRUE /\ recipeOK' = TRUE /\ files' = TRUE /\ execs' = TRUE
  /\ Finish(e, TRUE, TRUE)
  /\ justRestarted' = FALSE
  /\ UNCHANGED <<lostRepair, digest, rust, due, acc, gen, hgen, autoStarted, restarts,
                 tampers, cleanReady, restartKept, crossRestore, blocked, upgradePending>>

PrepareFail(e) ==   \* download, assembly or probe failure
  /\ ev[e].pc = "prep" /\ ~Reuse
  /\ Finish(e, FALSE, files)
  /\ justRestarted' = FALSE
  /\ UNCHANGED <<lostRepair, installed, recipeOK, files, execs, digest, rust, due, acc, gen,
                 hgen, autoStarted, restarts, tampers, cleanReady, restartKept,
                 crossRestore, blocked, upgradePending>>

(* Head of the publication chain (HR) and the Rust transaction (CAT       *)
(* update_harness_runtime_availability): rejects an older generation,     *)
(* writes availability, and clears the upgrade mark.                      *)
Publish ==
  /\ chain # <<>>
  /\ LET e == Head(chain) IN
     /\ chain' = Tail(chain)
     /\ ev' = [ev EXCEPT ![e].pc = "done"]
     /\ IF ev[e].gen = hgen /\ ev[e].gen >= acc
          THEN /\ rust' = [rust EXCEPT !.ready = ev[e].avail]
               /\ acc' = ev[e].gen
               /\ due' = FALSE
               /\ upgradePending' = FALSE
               /\ cleanReady' = (ev[e].avail /\ ev[e].tamp = tampers)
               /\ crossRestore' = (crossRestore
                    \/ (ev[e].avail /\ \E q \in blocked : q # ev[e].prov))
               /\ blocked' = IF ev[e].avail THEN {} ELSE Providers
          ELSE UNCHANGED <<rust, acc, due, upgradePending, cleanReady, crossRestore, blocked>>
  /\ justRestarted' = FALSE
  /\ UNCHANGED <<lostRepair, installed, recipeOK, files, execs, digest, gen, hgen,
                 autoStarted, restarts, tampers, badPublish, latestAvail, restartKept>>

(* External change to runtime files after a ready record: the private     *)
(* state or ownership marker removed, or an entrypoint replaced by a      *)
(* symlink that still executes (breaks files only); or the executable     *)
(* damaged (breaks execs; the layout checks may still pass).              *)
BreakFiles ==
  /\ tampers < MaxTampers /\ files
  /\ files' = FALSE /\ tampers' = tampers + 1 /\ cleanReady' = FALSE
  /\ justRestarted' = FALSE
  /\ UNCHANGED <<lostRepair, installed, recipeOK, execs, digest, rust, due, acc, gen, hgen,
                 ev, chain, autoStarted, restarts, restartKept, badPublish, crossRestore,
                 blocked, latestAvail, upgradePending>>
BreakExecs ==
  /\ tampers < MaxTampers /\ execs
  /\ execs' = FALSE /\ tampers' = tampers + 1 /\ cleanReady' = FALSE
  /\ justRestarted' = FALSE
  /\ UNCHANGED <<lostRepair, installed, recipeOK, files, digest, rust, due, acc, gen, hgen,
                 ev, chain, autoStarted, restarts, restartKept, badPublish, crossRestore,
                 blocked, latestAvail, upgradePending>>

(* Crash anywhere, then startup. GCR computes runtimeFilesValid with       *)
(* validate(); CAT restores ready only from a ready row with the same     *)
(* digest and valid files, and marks a changed digest due. Migration 0034 *)
(* clears a pre-rule ready row once. A fresh process: HR generations, CAT *)
(* accepted generations and Desktop's autoStarted start empty.            *)
Restart(newDigest, newRecipeOK) ==
  /\ restarts < MaxRestarts
  /\ LET keep == rust.ready /\ ~rust.preRule /\ rust.digest = newDigest
                 /\ installed /\ newRecipeOK /\ files
     IN /\ rust' = [ready |-> keep, digest |-> newDigest, preRule |-> FALSE]
        /\ blocked' = IF keep THEN {} ELSE Providers
        /\ cleanReady' = (cleanReady /\ keep)
        /\ lostRepair' = (lostRepair \/ (cleanReady /\ rust.ready /\ newDigest = digest
                                           /\ newRecipeOK = recipeOK /\ ~keep))
  /\ due' = (UpgradeEvaluates /\ (due \/ newDigest # digest))
  /\ upgradePending' = (upgradePending \/ newDigest # digest)
  /\ digest' = newDigest /\ recipeOK' = newRecipeOK
  /\ restarts' = restarts + 1
  /\ acc' = 0 /\ gen' = 0 /\ hgen' = 0
  /\ ev' = [e \in Evals |-> Idle] /\ chain' = <<>>
  /\ autoStarted' = FALSE
  /\ justRestarted' = TRUE
  /\ restartKept' = (newDigest = digest /\ newRecipeOK = recipeOK)
  /\ latestAvail' = 0
  /\ UNCHANGED <<installed, files, execs, tampers, badPublish, crossRestore>>

Next ==
  \/ \E e \in Evals, p \in Providers : Start(e, p)
  \/ \E e \in Evals : AutoStart(e)
  \/ \E e \in Evals : PrepareReuse(e) \/ PrepareInstall(e) \/ PrepareFail(e)
  \/ Publish
  \/ BreakFiles \/ BreakExecs
  \/ Restart(digest, recipeOK)
  \/ (UpgradeCanChangeDigest /\ Restart(3 - digest, recipeOK))
  \/ (UpgradeCanChangeRecipe /\ Restart(digest, FALSE))

Spec == Init /\ [][Next]_vars

(* Users are not obliged to press anything. The app is: preparation,      *)
(* publication and the automatic evaluation are weakly fair.              *)
FairSpec == Spec
  /\ \A e \in Evals : WF_vars(PrepareReuse(e) \/ PrepareInstall(e))
  /\ WF_vars(Publish)
  /\ WF_vars(\E a \in Evals : AutoStart(a))

----------------------------------------------------------------------------
TypeOK ==
  /\ installed \in BOOLEAN /\ recipeOK \in BOOLEAN /\ files \in BOOLEAN
  /\ execs \in BOOLEAN /\ digest \in {1, 2} /\ due \in BOOLEAN
  /\ rust \in [ready : BOOLEAN, digest : {1, 2}, preRule : BOOLEAN]
  /\ \A e \in Evals : ev[e].pc \in {"idle", "prep", "queued", "done"}
  /\ blocked \subseteq Providers

(* PROV-006: startup restores ready only from the record, for the same    *)
(* digest, when files validate; a pre-rule ready row is verified again.   *)
PROV006_RestoreRule == justRestarted /\ rust.ready => Validate

(* PRD "Exact managed-runtime preparation": explicit Repair reconstructs  *)
(* the requested recipe. With PROV-006, a route an evaluation made ready  *)
(* survives a restart that changes nothing. Ghost: such a restart, from a *)
(* ready record published with no runtime change since, dropped it.       *)
RepairSurvivesRestart == ~lostRepair

(* Cheap validation and root confinement: readiness is never published   *)
(* for an installation that startup's validation would reject.            *)
ReadyOnlyForValidatedRuntime == ~badPublish

(* PROV-005 at quiescence: Rust holds the latest evaluation's result.     *)
Quiescent == chain = <<>> /\ \A e \in Evals : ev[e].pc # "prep"
PROV005_LatestWins ==
  Quiescent /\ latestAvail # 0 => rust.ready = (latestAvail = 2)

(* The app server's mark never outlives the evaluation it waits for: a   *)
(* marked route is never ready, so no committed result leaves it set.     *)
DueOnlyWhilePending == due => ~rust.ready

(* Witness, not a promise: readiness is per harness (PRD 2.1). A          *)
(* violation shows that an evaluation not started for a provider makes    *)
(* that provider's route ready, as one Repair did for both in #556.       *)
NoCrossProviderRestore == ~crossRestore

(* Liveness: every started evaluation settles.                            *)
EvaluationsSettle == \A e \in Evals : (ev[e].pc = "prep") ~> (ev[e].pc \in {"done", "idle"})

(* #556: an upgrade that changed the digest gets a committed evaluation   *)
(* without anyone pressing Repair.                                        *)
UpgradeEvaluatedWithoutRepair == upgradePending ~> ~upgradePending
=============================================================================
