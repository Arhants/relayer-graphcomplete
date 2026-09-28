-------------------------- MODULE HarnessCodexThread --------------------------
(***************************************************************************)
(* codex.basic's persistent root thread (codexThreadId) across serialized  *)
(* root turns: one CODEX_HOME per provider definition, Stop, the per-turn  *)
(* force-stop and a thread saved by an earlier release.                    *)
(*                                                                         *)
(* A Codex thread has a rollout in a home only once a turn/start on it was *)
(* accepted there. thread/resume of a thread without a rollout in the      *)
(* turn's home fails with "no rollout found" (observed on the pinned Codex *)
(* 0.147.0 binary).                                                         *)
(*                                                                         *)
(* Three constants hold the fixes; each -reverted check turns one off:     *)
(*   CommitAtTurnStart      the thread is saved when turn/start is accepted *)
(*                          (onTurnId), not when thread/start answers.      *)
(*   ThreadRecordsProvider  the saved thread names its provider definition; *)
(*                          a turn on another provider starts fresh.        *)
(*   RecoverMissingRollout  thread/resume "no rollout found" forgets the    *)
(*                          saved thread and starts a fresh one in the turn.*)
(***************************************************************************)
EXTENDS Naturals

CONSTANTS AllowSwitch, AllowCancel, LegacyState,
          CommitAtTurnStart, ThreadRecordsProvider, RecoverMissingRollout

Turns == 1..3
Homes == {"A", "B"}          \* provider definitions -> CODEX_HOME (provider-adapter-registry.mjs)
Threads == 1..4
Legacy == 4                  \* a thread saved by an earlier release, with no provider recorded
Unknown == "unknown"

VARIABLES saved, savedHome, nextT, rollout, pc, home, tthread, forced,
          deadResume, blindResume, cur

vars == <<saved, savedHome, nextT, rollout, pc, home, tthread, forced,
          deadResume, blindResume, cur>>

LegacyRollouts == IF LegacyState THEN {"none", "A"} ELSE {"none"}

Init ==
  /\ saved \in IF LegacyState THEN {0, Legacy} ELSE {0}
  /\ savedHome = Unknown
  /\ nextT = 1
  /\ rollout \in {[t \in Threads |-> IF t = Legacy THEN r ELSE "none"] : r \in LegacyRollouts}
  /\ pc = [t \in Turns |-> "idle"]
  /\ home \in [Turns -> IF AllowSwitch THEN Homes ELSE {"A"}]
  /\ tthread = [t \in Turns |-> 0]
  /\ forced = [t \in Turns |-> FALSE]
  /\ deadResume = FALSE
  /\ blindResume = FALSE
  /\ cur = 1

\* The saved thread, as the turn about to commit it records it (codex-basic.ts onTurnId).
Commit(t) ==
  /\ saved' = IF forced[t] THEN saved ELSE tthread[t]
  /\ savedHome' = IF forced[t] THEN savedHome
                  ELSE IF ThreadRecordsProvider THEN home[t] ELSE Unknown

\* Root turns are serialized by the host's session lock. A thread saved for another
\* provider definition is dropped before the turn (codex-basic.ts execute).
Begin(t) ==
  /\ t = cur /\ pc[t] = "idle"
  /\ LET stale == ThreadRecordsProvider /\ saved # 0 /\ savedHome # Unknown /\ savedHome # home[t]
         kept == IF stale THEN 0 ELSE saved
     IN /\ saved' = kept
        /\ savedHome' = IF stale THEN Unknown ELSE savedHome
        /\ pc' = [pc EXCEPT ![t] = IF kept # 0 THEN "resume" ELSE "threadStart"]
        /\ tthread' = [tthread EXCEPT ![t] = kept]
  /\ UNCHANGED <<nextT, rollout, home, forced, deadResume, blindResume, cur>>

\* codex-app-server.ts run(): thread/resume of savedThreadId.
Resume(t) ==
  /\ pc[t] = "resume"
  /\ IF rollout[tthread[t]] = home[t] THEN
       /\ pc' = [pc EXCEPT ![t] = "onThreadId"]
       /\ UNCHANGED <<saved, savedHome, deadResume, blindResume>>
     ELSE
       /\ blindResume' = (blindResume \/ tthread[t] # Legacy)
       /\ IF RecoverMissingRollout THEN
            \* onSavedThreadUnavailable, then thread/start in the same process.
            /\ saved' = IF saved = tthread[t] THEN 0 ELSE saved
            /\ savedHome' = IF saved = tthread[t] THEN Unknown ELSE savedHome
            /\ pc' = [pc EXCEPT ![t] = "threadStart"]
            /\ UNCHANGED deadResume
          ELSE
            /\ pc' = [pc EXCEPT ![t] = "failed"]
            /\ deadResume' = TRUE
            /\ UNCHANGED <<saved, savedHome>>
  /\ UNCHANGED <<nextT, rollout, home, tthread, forced, cur>>

ThreadStart(t) ==
  /\ pc[t] = "threadStart" /\ nextT \in 1..3
  /\ tthread' = [tthread EXCEPT ![t] = nextT]
  /\ nextT' = nextT + 1
  /\ pc' = [pc EXCEPT ![t] = "onThreadId"]
  /\ UNCHANGED <<saved, savedHome, rollout, home, forced, deadResume, blindResume, cur>>

\* Before the fix, onThreadId saved the thread before turn/start (and before Stop was checked).
OnThreadId(t) ==
  /\ pc[t] = "onThreadId"
  /\ IF CommitAtTurnStart THEN UNCHANGED <<saved, savedHome>> ELSE Commit(t)
  /\ pc' = [pc EXCEPT ![t] = "turnStart"]
  /\ UNCHANGED <<nextT, rollout, home, tthread, forced, deadResume, blindResume, cur>>

\* turn/start accepted: the rollout now exists in this turn's home, and onTurnId saves it.
TurnStart(t) ==
  /\ pc[t] = "turnStart"
  /\ rollout' = [rollout EXCEPT ![tthread[t]] = IF @ = "none" THEN home[t] ELSE @]
  /\ IF CommitAtTurnStart THEN Commit(t) ELSE UNCHANGED <<saved, savedHome>>
  /\ pc' = [pc EXCEPT ![t] = "running"]
  /\ UNCHANGED <<nextT, home, tthread, forced, deadResume, blindResume, cur>>

Finish(t) ==
  /\ pc[t] = "running"
  /\ pc' = [pc EXCEPT ![t] = "done"]
  /\ UNCHANGED <<saved, savedHome, nextT, rollout, home, tthread, forced, deadResume, blindResume, cur>>

\* Stop: before turn attachment the process is killed; the saved thread is kept.
Cancel(t) ==
  /\ AllowCancel /\ pc[t] \in {"resume", "threadStart", "onThreadId", "turnStart", "running"}
  /\ pc' = [pc EXCEPT ![t] = "failed"]
  /\ UNCHANGED <<saved, savedHome, nextT, rollout, home, tthread, forced, deadResume, blindResume, cur>>

\* Per-turn force-stop (and force shutdown during a root turn) forgets the root thread.
Force(t) ==
  /\ pc[t] \in {"resume", "threadStart", "onThreadId", "turnStart", "running"} /\ ~forced[t]
  /\ forced' = [forced EXCEPT ![t] = TRUE]
  /\ saved' = 0
  /\ savedHome' = Unknown
  /\ pc' = [pc EXCEPT ![t] = "failed"]
  /\ UNCHANGED <<nextT, rollout, home, tthread, deadResume, blindResume, cur>>

\* The host run ends and persists the state; a restart restores it unchanged.
End(t) ==
  /\ t = cur /\ pc[t] \in {"done", "failed"} /\ cur < 3
  /\ cur' = cur + 1
  /\ UNCHANGED <<saved, savedHome, nextT, rollout, pc, home, tthread, forced, deadResume, blindResume>>

Next == \E t \in Turns : Begin(t) \/ Resume(t) \/ ThreadStart(t) \/ OnThreadId(t)
                         \/ TurnStart(t) \/ Finish(t) \/ Cancel(t) \/ Force(t) \/ End(t)

Spec == Init /\ [][Next]_vars

TypeOK ==
  /\ saved \in Threads \cup {0}
  /\ savedHome \in Homes \cup {Unknown}
  /\ cur \in Turns

\* PRD architecture: a Complete call "remains semantically valid even when the provider
\* starts a fresh session". A root turn never fails because the harness resumes a thread
\* Codex cannot resume.
NoDeadResume == ~deadResume

\* CODE: the harness offers for resume only a thread with a rollout in the turn's home,
\* except a thread saved by an earlier release, whose provider it cannot know.
ResumeOnlyMaterialized == ~blindResume
================================================================================
