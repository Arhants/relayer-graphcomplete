--------------------------- MODULE HarnessPrimeRoot ---------------------------
(***************************************************************************)
(* The harness host's per-thread session lock and Prime Agent's root       *)
(* session: pinning, rotation, reload, the force-stop generation, each     *)
(* session's presentation instructions, host state capture and persist,    *)
(* graceful close, force close and one restart.                            *)
(*                                                                         *)
(* Files stand for native session files; a session object reopened from a *)
(* file is the same file id. taint[f] = the file was force-stopped while a *)
(* root turn's native conversation ran on it (PRD, Provider execution      *)
(* access: such a conversation is not resumed).                            *)
(*                                                                         *)
(* Five constants hold the fixes; each -reverted check turns one off:      *)
(*   ForcePersists         the host persists the harness state as soon as  *)
(*                         a per-turn force-stop fires (host.ts            *)
(*                         recordForcedState), not when its run ends.      *)
(*   ForceShutdownForgets  force shutdown forgets the root session while   *)
(*                         a root turn's conversation runs (prime-agent.ts)*)
(*   ForgetOnlyRunning     ... only when an unforced root turn is bound to *)
(*                         that session; not while a turn is still         *)
(*                         acquiring it, nor for a turn already forced.    *)
(*   ForceClosePersists    force close captures and persists that state    *)
(*                         although close's final persist is skipped.      *)
(*   SessionScopedInstructions  each session reads its own presentation    *)
(*                         instructions. Before, every session read the    *)
(*                         shared resource loader's cache, which only a    *)
(*                         session reload() refreshed.                     *)
(***************************************************************************)
EXTENDS Naturals, FiniteSets, Sequences

CONSTANTS CanForceClose, CanCrash, CanClose,
          ForcePersists, ForceShutdownForgets, ForgetOnlyRunning, ForceClosePersists,
          SessionScopedInstructions

R == {1, 2}                \* two root turns on one thread
Files == 1..4
Vers == {1, 2}             \* personal-presentation versions; 1 = neutral ("" instructions)
U == 0                     \* sessionPersonalPresentationVersionId === undefined
Instr(v) == IF v = 1 THEN 0 ELSE 2   \* the native instructions a version renders

AcqStates == {"reload", "rotDispose", "rotCreate"}
ActiveStates == AcqStates \cup {"running"}

VARIABLES
  \* Prime harness memory (prime-agent.ts PrimeAgentHarness)
  handle, ver, resumable, gen, pending, cur, shutdown, nextF,
  fstate, taint,
  \* lcache: the shared resource loader's cached instructions (before the fix);
  \* sinstr[f]: the instructions the session on file f was built or reloaded with.
  lcache, sinstr,
  \* root turns
  pc, tv, tgen, tsess, tprev, tfile, forced, hostDone, queuedOrder,
  \* host (host.ts)
  lock, savedF, savedV, writes, persistedF, persistedV, childDone,
  closing, closeStep, abandoned,
  restarted, resumedTainted,
  \* force close forgot a session no running, unforced root conversation was on
  needless

primeVars == <<handle, ver, resumable, gen, pending, cur, shutdown, nextF, fstate, taint, lcache, sinstr>>
turnVars == <<pc, tv, tgen, tsess, tprev, tfile, forced, hostDone, queuedOrder>>
hostVars == <<lock, savedF, savedV, writes, persistedF, persistedV, childDone,
              closing, closeStep, abandoned, restarted, resumedTainted, needless>>
vars == <<primeVars, turnVars, hostVars>>

\* PrimeAgentHarness.state()
StateF == IF handle = 0 \/ ver = U THEN 0 ELSE handle
StateV == IF handle = 0 \/ ver = U THEN U ELSE ver

Init ==
  \* Restored from saved state {file 1, version 1}; its session starts with no instructions.
  /\ handle = 1 /\ ver = 1 /\ resumable = 1 /\ gen = 0 /\ pending = 0
  /\ cur = 0 /\ shutdown = FALSE /\ nextF = 2
  /\ fstate = [f \in Files |-> IF f = 1 THEN "live" ELSE "none"]
  /\ taint = [f \in Files |-> FALSE]
  /\ lcache = 0 /\ sinstr = [f \in Files |-> 0]
  /\ pc = [r \in R |-> "idle"] /\ tv \in [R -> Vers]
  /\ tgen = [r \in R |-> 0] /\ tsess = [r \in R |-> 0] /\ tprev = [r \in R |-> 0]
  /\ tfile = [r \in R |-> 0] /\ forced = [r \in R |-> FALSE]
  /\ hostDone = [r \in R |-> FALSE] /\ queuedOrder = <<>>
  /\ lock = 0 /\ savedF = 1 /\ savedV = 1 /\ writes = 0
  /\ persistedF = 1 /\ persistedV = 1 /\ childDone = FALSE
  /\ closing = FALSE /\ closeStep = "none" /\ abandoned = FALSE
  /\ restarted = FALSE /\ resumedTainted = FALSE /\ needless = FALSE

Live == ~restarted

\* The instructions a session compares against: its own, or the shared current before the fix.
Own(f) == IF SessionScopedInstructions THEN sinstr[f] ELSE cur

\* forceStopRootSession
ForceStopRoot(f, running) ==
  /\ handle' = IF handle = f THEN 0 ELSE handle
  /\ ver' = IF handle = f THEN U ELSE ver
  /\ resumable' = IF handle = f THEN 0 ELSE resumable
  /\ fstate' = [fstate EXCEPT ![f] = "stopped"]
  /\ taint' = [taint EXCEPT ![f] = taint[f] \/ running]

(* host.complete -> withSessionLock (FIFO tail). *)
Queue(r) ==
  /\ Live /\ ~closing /\ pc[r] = "idle"
  /\ (r = 2 => pc[1] # "idle")
  /\ pc' = [pc EXCEPT ![r] = "queued"]
  /\ queuedOrder' = Append(queuedOrder, r)
  /\ UNCHANGED <<primeVars, tv, tgen, tsess, tprev, tfile, forced, hostDone, hostVars>>

TakeLock(r) ==
  /\ Live /\ pc[r] = "queued" /\ lock = 0
  /\ (r = 2 => hostDone[1])
  /\ lock' = r
  /\ pc' = [pc EXCEPT ![r] = "start"]
  /\ UNCHANGED <<primeVars, tv, tgen, tsess, tprev, tfile, forced, hostDone, queuedOrder,
                 savedF, savedV, writes, persistedF, persistedV, childDone, closing, closeStep,
                 abandoned, restarted, resumedTainted, needless>>

(* executeRoot + sessionFor. A turn force-stopped before start never starts. *)
Start(r) ==
  /\ Live /\ pc[r] = "start"
  /\ tgen' = [tgen EXCEPT ![r] = gen]
  /\ LET v == tv[r] IN
     IF shutdown \/ closing THEN   \* runCompletion: if (this.closed) throw
       /\ pc' = [pc EXCEPT ![r] = "failed"]
       /\ UNCHANGED <<ver, pending, cur, tsess, tprev>>
     ELSE IF pending # 0 THEN
       \* chained acquisition previous.then(sessionFor): modelled as a stall
       \* (never reached within these bounds; checked by NoChain)
       /\ pc' = [pc EXCEPT ![r] = "chain"]
       /\ UNCHANGED <<ver, pending, cur, tsess, tprev>>
     ELSE IF handle # 0 /\ (ver = v \/ ver = U) THEN
       IF Instr(v) = Own(handle) THEN
         \* synchronous reuse
         /\ ver' = v
         /\ tsess' = [tsess EXCEPT ![r] = handle]
         /\ pc' = [pc EXCEPT ![r] = "running"]
         /\ UNCHANGED <<pending, cur, tprev>>
       ELSE
         \* reloadPresentationInstructions
         /\ cur' = Instr(v)
         /\ tsess' = [tsess EXCEPT ![r] = handle]
         /\ pending' = r
         /\ pc' = [pc EXCEPT ![r] = "reload"]
         /\ UNCHANGED <<ver, tprev>>
     ELSE
       \* rotateSession
       /\ tprev' = [tprev EXCEPT ![r] = handle]
       /\ pending' = r
       /\ pc' = [pc EXCEPT ![r] = "rotDispose"]
       /\ UNCHANGED <<ver, cur, tsess>>
  /\ UNCHANGED <<handle, resumable, gen, shutdown, nextF, fstate, taint, lcache, sinstr,
                 tv, tfile, forced, hostDone, queuedOrder, hostVars>>

ClearPending(r) == pending' = IF pending = r THEN 0 ELSE pending

\* session.reload() re-reads the loader: the session now holds the instructions set for it.
ReloadDone(r) ==
  /\ Live /\ pc[r] = "reload"
  /\ ClearPending(r)
  /\ lcache' = cur
  /\ sinstr' = [sinstr EXCEPT ![tsess[r]] = Instr(tv[r])]
  /\ IF gen # tgen[r] THEN
       /\ pc' = [pc EXCEPT ![r] = "failed"] /\ UNCHANGED ver
     ELSE
       /\ ver' = tv[r]
       /\ pc' = [pc EXCEPT ![r] = IF forced[r] THEN "failed" ELSE "running"]
  /\ UNCHANGED <<handle, resumable, gen, cur, shutdown, nextF, fstate, taint,
                 tv, tgen, tsess, tprev, tfile, forced, hostDone, queuedOrder, hostVars>>

\* await disposeSession(previousHandle) then checks. A new session gets its own file.
RotDisposed(r) ==
  /\ Live /\ pc[r] = "rotDispose"
  /\ LET p == tprev[r]
         reopen == resumable # 0 /\ ver = tv[r]
     IN
     /\ fstate' = IF p # 0 /\ fstate[p] = "live" THEN [fstate EXCEPT ![p] = "disposed"] ELSE fstate
     /\ IF shutdown \/ gen # tgen[r] THEN
          /\ pc' = [pc EXCEPT ![r] = "failed"] /\ ClearPending(r)
          /\ UNCHANGED <<handle, cur, tfile, nextF>>
        ELSE
          /\ reopen \/ nextF \in Files
          /\ handle' = IF handle = p THEN 0 ELSE handle
          /\ cur' = Instr(tv[r])
          /\ tfile' = [tfile EXCEPT ![r] = IF reopen THEN resumable ELSE nextF]
          /\ nextF' = IF reopen THEN nextF ELSE nextF + 1
          /\ pc' = [pc EXCEPT ![r] = "rotCreate"]
          /\ UNCHANGED pending
  /\ UNCHANGED <<ver, resumable, gen, shutdown, taint, lcache, sinstr,
                 tv, tgen, tsess, tprev, forced, hostDone, queuedOrder, hostVars>>

\* await createSession(...) then generation/shutdown checks. createAgentSessionFromServices
\* does not reload the loader: before the fix the new session gets the loader's cache.
RotCreated(r) ==
  /\ Live /\ pc[r] = "rotCreate"
  /\ LET f == tfile[r] IN
     /\ ClearPending(r)
     /\ sinstr' = [sinstr EXCEPT ![f] = IF SessionScopedInstructions THEN Instr(tv[r]) ELSE lcache]
     /\ IF gen # tgen[r] \/ shutdown THEN
          /\ fstate' = [fstate EXCEPT ![f] = "stopped"]
          /\ pc' = [pc EXCEPT ![r] = "failed"]
          /\ UNCHANGED <<handle, ver, tsess>>
        ELSE
          /\ fstate' = [fstate EXCEPT ![f] = "live"]
          /\ handle' = f /\ ver' = tv[r]
          /\ tsess' = [tsess EXCEPT ![r] = f]
          /\ pc' = [pc EXCEPT ![r] = IF forced[r] THEN "failed" ELSE "running"]
  /\ UNCHANGED <<resumable, gen, cur, shutdown, nextF, taint, lcache,
                 tv, tgen, tprev, tfile, forced, hostDone, queuedOrder, hostVars>>

(* After acquisition executeRoot binds the handle in the same synchronous step and
   executeOn starts promptAndWait; a turn already force-stopped throws at bind. *)
NativeDone(r) ==
  /\ Live /\ pc[r] = "running"
  /\ pc' = [pc EXCEPT ![r] = "nativeDone"]
  /\ UNCHANGED <<primeVars, tv, tgen, tsess, tprev, tfile, forced, hostDone, queuedOrder, hostVars>>

(* Cancel + 2 min per-turn force-stop; PrimeTurnForceStop runs the bound stopper:
   abandonRootSessionAcquisition before bind, forceStopRootSession after bind. With the
   fix the host then captures the harness state and persists it at once. *)
Force(r) ==
  /\ Live /\ lock = r /\ ~forced[r] /\ pc[r] \in ActiveStates
  /\ forced' = [forced EXCEPT ![r] = TRUE]
  /\ IF pc[r] \in AcqStates THEN
       IF gen = tgen[r] THEN
         /\ gen' = gen + 1
         /\ pending' = 0
         /\ IF handle # 0 THEN ForceStopRoot(handle, FALSE)
            ELSE /\ UNCHANGED <<handle, fstate, taint>>
                 /\ ver' = U /\ resumable' = 0
       ELSE UNCHANGED <<gen, pending, handle, ver, resumable, fstate, taint>>
     ELSE
       /\ ForceStopRoot(tsess[r], pc[r] = "running")
       /\ UNCHANGED <<gen, pending>>
  /\ IF ForcePersists
       THEN /\ savedF' = IF handle' = 0 \/ ver' = U THEN 0 ELSE handle'
            /\ savedV' = IF handle' = 0 \/ ver' = U THEN U ELSE ver'
            /\ writes' = writes + 1
       ELSE UNCHANGED <<savedF, savedV, writes>>
  /\ UNCHANGED <<cur, shutdown, nextF, lcache, sinstr, pc, tv, tgen, tsess, tprev, tfile,
                 hostDone, queuedOrder, lock, persistedF, persistedV, childDone, closing,
                 closeStep, abandoned, restarted, resumedTainted, needless>>

(* runCompletion end: capture state, persist, release lock. The Prime race settles at
   once on force-stop. *)
HostEnd(r) ==
  /\ Live /\ lock = r /\ ~hostDone[r]
  /\ (pc[r] \in {"nativeDone", "failed"} \/ forced[r])
  /\ savedF' = StateF /\ savedV' = StateV
  /\ writes' = writes + 1
  /\ lock' = 0
  /\ hostDone' = [hostDone EXCEPT ![r] = TRUE]
  /\ UNCHANGED <<primeVars, pc, tv, tgen, tsess, tprev, tfile, forced, queuedOrder,
                 persistedF, persistedV, childDone, closing, closeStep, abandoned,
                 restarted, resumedTainted, needless>>

(* An invoked child's runCompletion also captures and persists, without the lock. It
   never touches the root session. *)
ChildEnd ==
  /\ Live /\ ~childDone
  /\ childDone' = TRUE
  /\ savedF' = StateF /\ savedV' = StateV
  /\ writes' = writes + 1
  /\ UNCHANGED <<primeVars, turnVars, lock, persistedF, persistedV, closing, closeStep,
                 abandoned, restarted, resumedTainted, needless>>

\* persist(): serialized, reads this.saved when its turn comes
Write ==
  /\ Live /\ writes > 0
  /\ writes' = writes - 1
  /\ persistedF' = savedF /\ persistedV' = savedV
  /\ UNCHANGED <<primeVars, turnVars, lock, savedF, savedV, childDone, closing, closeStep,
                 abandoned, restarted, resumedTainted, needless>>

(* Graceful close: abort active completions, wait for the tail at most 5 s (either
   outcome), capture, dispose, persist unless abandoned. *)
Close ==
  /\ Live /\ CanClose /\ ~closing
  /\ closing' = TRUE /\ closeStep' = "waiting"
  /\ UNCHANGED <<primeVars, turnVars, lock, savedF, savedV, writes, persistedF, persistedV,
                 childDone, abandoned, restarted, resumedTainted, needless>>

CloseCapture ==
  /\ Live /\ closeStep = "waiting"
  /\ closeStep' = "captured"
  /\ savedF' = StateF /\ savedV' = StateV
  /\ UNCHANGED <<primeVars, turnVars, lock, writes, persistedF, persistedV, childDone,
                 closing, abandoned, restarted, resumedTainted, needless>>

\* PrimeAgentHarness.dispose may stall; persist after it.
ClosePersist ==
  /\ Live /\ closeStep = "captured"
  /\ closeStep' = "done"
  /\ shutdown' = TRUE
  /\ writes' = IF abandoned THEN writes ELSE writes + 1
  /\ UNCHANGED <<handle, ver, resumable, gen, pending, cur, nextF, fstate, taint, lcache, sinstr,
                 turnVars, lock, savedF, savedV, persistedF, persistedV, childDone, closing,
                 abandoned, restarted, resumedTainted, needless>>

(* forceClose -> PrimeAgentHarness.forceShutdown: aborts and force-disposes the root
   session. Before the fix it kept sessionHandle, so state() still named it, and nothing
   persisted: closeAbandoned suppresses closeInternal's final persist. *)
ForceClose ==
  /\ Live /\ CanForceClose /\ ~abandoned
  /\ LET running == \E r \in R : pc[r] = "running" /\ tsess[r] = handle /\ ~forced[r]
         \* Before the review fix: any root turn in flight, acquiring or already forced.
         inFlight == \E r \in R : pc[r] \in ActiveStates
         rootActive == IF ForgetOnlyRunning THEN handle # 0 /\ running ELSE inFlight
         forget == ForceShutdownForgets /\ rootActive
         h2 == IF forget THEN 0 ELSE handle
         v2 == IF forget THEN U ELSE ver
     IN /\ abandoned' = TRUE /\ closing' = TRUE /\ shutdown' = TRUE
        /\ closeStep' = IF closeStep = "none" THEN "waiting" ELSE closeStep
        /\ IF handle # 0 THEN
             /\ fstate' = [fstate EXCEPT ![handle] = "stopped"]
             /\ taint' = [taint EXCEPT ![handle] =
                  taint[handle] \/ \E r \in R : pc[r] = "running" /\ tsess[r] = handle]
           ELSE UNCHANGED <<fstate, taint>>
        /\ handle' = h2 /\ ver' = v2
        /\ needless' = (needless \/ (forget /\ handle # 0 /\ ~running))
        /\ resumable' = IF forget THEN 0 ELSE resumable
        /\ IF ForceClosePersists
             THEN /\ savedF' = IF h2 = 0 \/ v2 = U THEN 0 ELSE h2
                  /\ savedV' = IF h2 = 0 \/ v2 = U THEN U ELSE v2
                  /\ writes' = writes + 1
             ELSE UNCHANGED <<savedF, savedV, writes>>
  /\ UNCHANGED <<gen, pending, cur, nextF, lcache, sinstr, turnVars,
                 lock, persistedF, persistedV, childDone, restarted, resumedTainted>>

(* Process exit and restart: registerSession restores prior.state; Prime.create reopens
   the saved file. close() and forceClose() both await their persists before the process
   exits; only a crash loses unflushed writes. *)
Restart ==
  /\ Live
  /\ \/ closeStep = "done" /\ writes = 0
     \/ abandoned /\ writes = 0
     \/ CanCrash
  /\ restarted' = TRUE
  /\ resumedTainted' = (persistedF # 0 /\ taint[persistedF])
  /\ UNCHANGED <<primeVars, turnVars, lock, savedF, savedV, writes, persistedF, persistedV,
                 childDone, closing, closeStep, abandoned, needless>>

Next ==
  \/ \E r \in R : Queue(r) \/ TakeLock(r) \/ Start(r) \/ ReloadDone(r) \/ RotDisposed(r)
                  \/ RotCreated(r) \/ NativeDone(r) \/ Force(r) \/ HostEnd(r)
  \/ ChildEnd \/ Write \/ Close \/ CloseCapture \/ ClosePersist \/ ForceClose \/ Restart

Spec == Init /\ [][Next]_vars

\* The host eventually releases a force-stopped turn's lock even when its native turn never
\* settles (weak fairness on HostEnd only; the host guarantees it runs).
FairSpec == Spec /\ \A r \in R : WF_vars(HostEnd(r))

--------------------------------------------------------------------------------
TypeOK ==
  /\ handle \in Files \cup {0} /\ ver \in Vers \cup {U} /\ resumable \in Files \cup {0}
  /\ gen \in Nat /\ pending \in R \cup {0} /\ cur \in {0, 2}
  /\ lcache \in {0, 2} /\ sinstr \in [Files -> {0, 2}]
  /\ pc \in [R -> {"idle", "queued", "start", "chain", "reload", "rotDispose", "rotCreate",
                   "running", "nativeDone", "failed"}]
  /\ lock \in R \cup {0} /\ writes \in Nat

\* CODE: chained acquisition never starts while another root turn's acquisition is pending.
NoChain == \A r \in R : pc[r] # "chain"

\* Root turns on a thread are serialized. Two root turns that were not force-stopped are
\* never active at once, and two root natives never share a session.
RootsSerialized ==
  /\ \A r1, r2 \in R : (r1 # r2 /\ pc[r1] \in ActiveStates /\ pc[r2] \in ActiveStates)
                        => (forced[r1] \/ forced[r2])
  /\ \A r1, r2 \in R : (r1 # r2 /\ pc[r1] = "running" /\ pc[r2] = "running")
                        => tsess[r1] # tsess[r2]

\* PRD: the next root turn starts fresh -- memory never pins or resumes a force-stopped
\* conversation while the harness is live.
MemoryNeverTainted ==
  ~shutdown => /\ (handle = 0 \/ ~taint[handle])
               /\ (resumable = 0 \/ ~taint[resumable])

\* Harness state captured after a force-stop never names the stopped session.
\* (Action property: checked at each capture step.)
CaptureStep == writes' > writes \/ (closeStep' = "captured" /\ closeStep # "captured")
CapturedNotTainted == [][CaptureStep => (savedF' = 0 \/ ~taint'[savedF'])]_vars

\* PRD across restart: the restored session is never a force-stopped conversation.
RestartNotTainted == ~resumedTainted

\* PPG-003: a running root turn's session carries its own pinned version's instructions.
RootSessionHasOwnInstructions ==
  \A r \in R : pc[r] = "running" => sinstr[tsess[r]] = Instr(tv[r])

\* Continuity: force close keeps a session no running, unforced root conversation was on,
\* such as an idle one or one a root turn was still acquiring.
NoNeedlessForget == ~needless

\* Witness, expected to be violated: a session survives a force close and the restart, so
\* NoNeedlessForget is not vacuous.
NeverKeptAcrossForceClose == ~(abandoned /\ restarted /\ persistedF # 0)

\* Liveness: a force-stopped turn's host run ends, freeing the lock.
ForcedReleasesLock == \A r \in R : [](forced[r] => <>(hostDone[r]))
================================================================================
