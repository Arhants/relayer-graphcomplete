--------------------------- MODULE HarnessCodexAuth ---------------------------
(***************************************************************************)
(* The per-CODEX_HOME auth.json refcount and serialized write/remove queue  *)
(* in codex-basic.ts, for concurrent turns (roots and children) on one      *)
(* provider home, with the per-turn force-stop and a host that stops        *)
(* waiting (10 s) before the turn's cleanup finishes. It passes today and   *)
(* guards the queue against regressions.                                    *)
(***************************************************************************)
EXTENDS Naturals, Sequences, FiniteSets

Turns == 1..3

VARIABLES users, file, queue, pc, forced

vars == <<users, file, queue, pc, forced>>

Init ==
  /\ users = 0 /\ file = FALSE /\ queue = <<>>
  /\ pc = [t \in Turns |-> "idle"] /\ forced = [t \in Turns |-> FALSE]

\* retainCodexApiKeyAuth then serializedCodexApiKeyAuthFileOperation(write) (codex-basic.ts execute)
Retain(t) ==
  /\ pc[t] = "idle"
  /\ users' = users + 1
  /\ queue' = Append(queue, [op |-> "write", t |-> t])
  /\ pc' = [pc EXCEPT ![t] = "awaitWrite"]
  /\ UNCHANGED <<file, forced>>

\* The queue head runs. A write re-checks the force signal (the write re-checks forceSignal);
\* a remove re-checks the user count (releaseCodexApiKeyAuth).
RunOp ==
  /\ Len(queue) > 0
  /\ LET h == Head(queue) IN
     /\ queue' = Tail(queue)
     /\ IF h.op = "write" THEN
          /\ file' = IF forced[h.t] THEN file ELSE TRUE
          /\ pc' = [pc EXCEPT ![h.t] = IF forced[h.t] THEN "release" ELSE "running"]
        ELSE
          /\ file' = IF users > 0 THEN file ELSE FALSE
          /\ pc' = [pc EXCEPT ![h.t] = IF pc[h.t] = "awaitRemove" THEN "done" ELSE pc[h.t]]
  /\ UNCHANGED <<users, forced>>

Finish(t) ==
  /\ pc[t] = "running"
  /\ pc' = [pc EXCEPT ![t] = "release"]
  /\ UNCHANGED <<users, file, queue, forced>>

Force(t) ==
  /\ pc[t] \in {"awaitWrite", "running"} /\ ~forced[t]
  /\ forced' = [forced EXCEPT ![t] = TRUE]
  /\ pc' = [pc EXCEPT ![t] = IF pc[t] = "running" THEN "release" ELSE pc[t]]
  /\ UNCHANGED <<users, file, queue>>

\* releaseCodexApiKeyAuth 
Release(t) ==
  /\ pc[t] = "release"
  /\ IF users <= 1 THEN
       /\ users' = 0
       /\ queue' = Append(queue, [op |-> "remove", t |-> t])
       /\ pc' = [pc EXCEPT ![t] = "awaitRemove"]
     ELSE
       /\ users' = users - 1
       /\ pc' = [pc EXCEPT ![t] = "done"]
       /\ UNCHANGED queue
  /\ UNCHANGED <<file, forced>>

Next == RunOp \/ \E t \in Turns : Retain(t) \/ Finish(t) \/ Force(t) \/ Release(t)
Spec == Init /\ [][Next]_vars
FairSpec == Spec /\ WF_vars(RunOp) /\ \A t \in Turns : WF_vars(Finish(t)) /\ WF_vars(Release(t))

TypeOK == users \in 0..3 /\ file \in BOOLEAN

\* CODE (writeCodexApiKeyAuthFile): a running Codex turn always finds its key file.
RunningHasKey == (\E t \in Turns : pc[t] = "running") => file
\* CODE: the count equals the turns holding the home.
CountExact == users = Cardinality({t \in Turns : pc[t] \in {"awaitWrite", "running", "release"}})
\* PRD AGT-007 (writeCodexApiKeyAuthFile): once every turn ends, no key file remains on disk.
NoLeftoverKey == ((\A t \in Turns : pc[t] = "done") /\ queue = <<>>) => ~file
EventuallyClean == <>[](~file)
================================================================================
