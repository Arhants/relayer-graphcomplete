-------------------------- MODULE HarnessCodexThread --------------------------
(***************************************************************************)
(* codex.basic's persistent root thread (codexThreadId) across serialized  *)
(* root turns: Codex homes, Stop, the per-turn force-stop and force        *)
(* shutdown, and a thread saved by an earlier release.                     *)
(*                                                                         *)
(* A Codex thread has a rollout in a home only once a turn/start on it was *)
(* accepted there. thread/resume of a thread without a rollout in the      *)
(* turn's home fails with "no rollout found" (observed on the pinned Codex *)
(* 0.147.0 binary). Each provider definition stands for one home: the      *)
(* subscription has its own, and the model does not represent two API-key *)
(* providers sharing Codex's default home.                                 *)
(*                                                                         *)
(* Six constants hold the fixes; each -reverted check turns one off:       *)
(*   CommitAtTurnStart      the thread is saved when turn/start is accepted *)
(*                          (onTurnId), not when thread/start answers.      *)
(*   ThreadRecordsProvider  the saved thread names its provider definition; *)
(*                          a turn on another provider starts fresh.        *)
(*   RecoverMissingRollout  thread/resume "no rollout found" forgets the    *)
(*                          saved thread and starts a fresh one in the turn.*)
(*   ForceForgets           a force-stop or force shutdown of a root turn   *)
(*                          that sent turn/start forgets the saved thread.  *)
(*   CommitChecksForce      a turn/start accepted after the force is not    *)
(*                          saved (onTurnId checks the force signal).       *)
(*   ForgetOnlyAfterTurnStart  a turn forced before it sent turn/start      *)
(*                          wrote nothing, so the saved thread is kept.     *)
(***************************************************************************)
EXTENDS Naturals

CONSTANTS AllowSwitch, AllowCancel, LegacyState,
          CommitAtTurnStart, ThreadRecordsProvider, RecoverMissingRollout,
          ForceForgets, CommitChecksForce, ForgetOnlyAfterTurnStart

Turns == 1..3
Homes == {"A", "B"}          \* provider definitions, one Codex home each
Threads == 1..4
Legacy == 4                  \* a thread saved by an earlier release, with no provider recorded
Unknown == "unknown"
Active == {"resume", "threadStart", "onThreadId", "turnStart", "awaitTurn", "running"}

VARIABLES
  saved, savedHome,          \* the harness's saved root thread and its provider
  nextT, rollout,            \* Codex: thread ids, and the home holding each rollout
  pc, home, tthread, forced, sent, cur,
  \* history for the properties
  tainted,                   \* threads a forced turn may have left mid-write
  mustResume, mustHome,      \* the thread the next root turn on mustHome should resume
  deadResume, blindResume, resumedForced, needless, resumedOK

vars == <<saved, savedHome, nextT, rollout, pc, home, tthread, forced, sent, cur,
          tainted, mustResume, mustHome,
          deadResume, blindResume, resumedForced, needless, resumedOK>>
flags == <<deadResume, blindResume, resumedForced, needless, resumedOK>>

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
  /\ sent = [t \in Turns |-> FALSE]
  /\ cur = 1
  /\ tainted = {}
  /\ mustResume = 0 /\ mustHome = "A"
  /\ deadResume = FALSE /\ blindResume = FALSE /\ resumedForced = FALSE
  /\ needless = FALSE /\ resumedOK = FALSE

\* The turn saves its thread (codex-basic.ts onTurnId), unless it was forced first.
Commit(t) ==
  IF CommitChecksForce /\ forced[t]
    THEN UNCHANGED <<saved, savedHome>>
    ELSE /\ saved' = tthread[t]
         /\ savedHome' = IF ThreadRecordsProvider THEN home[t] ELSE Unknown

\* Root turns are serialized by the host's session lock. A thread saved for another
\* provider definition is dropped before the turn (codex-basic.ts execute). Switching
\* provider gives up continuity, so it clears what the next turn must resume.
Begin(t) ==
  /\ t = cur /\ pc[t] = "idle"
  /\ LET stale == ThreadRecordsProvider /\ saved # 0 /\ savedHome # Unknown /\ savedHome # home[t]
         kept == IF stale THEN 0 ELSE saved
         owed == mustResume # 0 /\ mustHome = home[t]
     IN /\ saved' = kept
        /\ savedHome' = IF stale THEN Unknown ELSE savedHome
        /\ pc' = [pc EXCEPT ![t] = IF kept # 0 THEN "resume" ELSE "threadStart"]
        /\ tthread' = [tthread EXCEPT ![t] = kept]
        /\ needless' = (needless \/ (owed /\ kept # mustResume))
        /\ resumedForced' = (resumedForced \/ (kept # 0 /\ kept \in tainted))
        /\ mustResume' = IF owed THEN mustResume ELSE 0
  /\ UNCHANGED <<nextT, rollout, home, forced, sent, cur, tainted, mustHome,
                 deadResume, blindResume, resumedOK>>

\* codex-app-server.ts run(): thread/resume of savedThreadId.
Resume(t) ==
  /\ pc[t] = "resume" /\ ~forced[t]
  /\ IF rollout[tthread[t]] = home[t] THEN
       /\ pc' = [pc EXCEPT ![t] = "onThreadId"]
       /\ resumedOK' = TRUE
       /\ UNCHANGED <<saved, savedHome, deadResume, blindResume>>
     ELSE
       /\ blindResume' = (blindResume \/ tthread[t] # Legacy)
       /\ UNCHANGED resumedOK
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
  /\ UNCHANGED <<nextT, rollout, home, tthread, forced, sent, cur, tainted, mustResume,
                 mustHome, resumedForced, needless>>

ThreadStart(t) ==
  /\ pc[t] = "threadStart" /\ ~forced[t] /\ nextT \in 1..3
  /\ tthread' = [tthread EXCEPT ![t] = nextT]
  /\ nextT' = nextT + 1
  /\ pc' = [pc EXCEPT ![t] = "onThreadId"]
  /\ UNCHANGED <<saved, savedHome, rollout, home, forced, sent, cur, tainted, mustResume,
                 mustHome, flags>>

\* Before the fix, onThreadId saved the thread before turn/start (and before Stop was checked).
OnThreadId(t) ==
  /\ pc[t] = "onThreadId" /\ ~forced[t]
  /\ IF CommitAtTurnStart THEN UNCHANGED <<saved, savedHome>> ELSE Commit(t)
  /\ pc' = [pc EXCEPT ![t] = "turnStart"]
  /\ UNCHANGED <<nextT, rollout, home, tthread, forced, sent, cur, tainted, mustResume,
                 mustHome, flags>>

\* onTurnStarting: from here on, this turn may write the thread's rollout.
SendTurnStart(t) ==
  /\ pc[t] = "turnStart" /\ ~forced[t]
  /\ sent' = [sent EXCEPT ![t] = TRUE]
  /\ pc' = [pc EXCEPT ![t] = "awaitTurn"]
  /\ UNCHANGED <<saved, savedHome, nextT, rollout, home, tthread, forced, cur, tainted,
                 mustResume, mustHome, flags>>

\* turn/start accepted: the rollout now exists in this turn's home, and onTurnId saves it.
\* The answer may already be in flight when the turn is forced.
TurnStart(t) ==
  /\ pc[t] = "awaitTurn"
  /\ rollout' = [rollout EXCEPT ![tthread[t]] = IF @ = "none" THEN home[t] ELSE @]
  /\ IF CommitAtTurnStart THEN Commit(t) ELSE UNCHANGED <<saved, savedHome>>
  /\ pc' = [pc EXCEPT ![t] = "running"]
  /\ UNCHANGED <<nextT, home, tthread, forced, sent, cur, tainted, mustResume, mustHome, flags>>

\* A normal finish: the next root turn on this home should resume this thread.
Finish(t) ==
  /\ pc[t] = "running" /\ ~forced[t]
  /\ pc' = [pc EXCEPT ![t] = "done"]
  /\ mustResume' = tthread[t] /\ mustHome' = home[t]
  /\ UNCHANGED <<saved, savedHome, nextT, rollout, home, tthread, forced, sent, cur, tainted, flags>>

\* Stop. Before turn attachment the process is killed and nothing is saved. After it the
\* turn is interrupted, and its thread stays resumable.
Cancel(t) ==
  /\ AllowCancel /\ ~forced[t] /\ pc[t] \in Active
  /\ pc' = [pc EXCEPT ![t] = "failed"]
  /\ IF pc[t] = "running"
       THEN mustResume' = tthread[t] /\ mustHome' = home[t]
       ELSE UNCHANGED <<mustResume, mustHome>>
  /\ UNCHANGED <<saved, savedHome, nextT, rollout, home, tthread, forced, sent, cur, tainted, flags>>

\* Per-turn force-stop or force shutdown. The kill lands later (Kill), so an answer already
\* in flight can still arrive. A turn that sent turn/start may have left its thread mid-write.
Force(t) ==
  /\ pc[t] \in Active /\ ~forced[t]
  /\ forced' = [forced EXCEPT ![t] = TRUE]
  /\ IF ForceForgets /\ (sent[t] \/ ~ForgetOnlyAfterTurnStart)
       THEN saved' = 0 /\ savedHome' = Unknown
       ELSE UNCHANGED <<saved, savedHome>>
  /\ tainted' = IF sent[t] THEN tainted \cup {tthread[t]} ELSE tainted
  /\ mustResume' = IF sent[t] THEN 0 ELSE mustResume
  /\ UNCHANGED <<nextT, rollout, pc, home, tthread, sent, cur, mustHome, flags>>

Kill(t) ==
  /\ forced[t] /\ pc[t] \in Active
  /\ pc' = [pc EXCEPT ![t] = "failed"]
  /\ UNCHANGED <<saved, savedHome, nextT, rollout, home, tthread, forced, sent, cur, tainted,
                 mustResume, mustHome, flags>>

\* The host run ends and persists the state; a restart restores it unchanged.
End(t) ==
  /\ t = cur /\ pc[t] \in {"done", "failed"} /\ cur < 3
  /\ cur' = cur + 1
  /\ UNCHANGED <<saved, savedHome, nextT, rollout, pc, home, tthread, forced, sent, tainted,
                 mustResume, mustHome, flags>>

Next == \E t \in Turns : Begin(t) \/ Resume(t) \/ ThreadStart(t) \/ OnThreadId(t)
                         \/ SendTurnStart(t) \/ TurnStart(t) \/ Finish(t) \/ Cancel(t)
                         \/ Force(t) \/ Kill(t) \/ End(t)

Spec == Init /\ [][Next]_vars

TypeOK ==
  /\ saved \in Threads \cup {0}
  /\ savedHome \in Homes \cup {Unknown}
  /\ mustResume \in Threads \cup {0}
  /\ cur \in Turns

\* PRD architecture: a Complete call "remains semantically valid even when the provider
\* starts a fresh session". A root turn never fails because the harness resumes a thread
\* Codex cannot resume.
NoDeadResume == ~deadResume

\* CODE: the harness offers for resume only a thread with a rollout in the turn's home,
\* except a thread saved by an earlier release, whose provider it cannot know.
ResumeOnlyMaterialized == ~blindResume

\* PRD, Provider execution access: a root turn force-stopped while its native conversation
\* ran is not resumed.
NoForcedResume == ~resumedForced

\* Continuity (architecture: reuse "when obvious and behavior preserving"): after a root turn
\* on a home finishes, or is stopped once running, the next root turn on that home resumes
\* its thread, unless a later turn's conversation was force-stopped.
NoNeedlessForget == ~needless

\* Witness, expected to be violated: a real resume is reachable, so the properties above
\* are not vacuous.
NeverResumes == ~resumedOK
================================================================================
