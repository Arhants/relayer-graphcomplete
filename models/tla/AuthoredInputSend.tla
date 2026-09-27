-------------------------- MODULE AuthoredInputSend --------------------------
(***************************************************************************)
(* An input action in an authored Node Detail, the thread's input draft,  *)
(* and the follow-up Send that reserves the draft's committed inputs.     *)
(*                                                                         *)
(* Source of truth (every action cites the code it abstracts):            *)
(*   WS  = desktop/renderer/src/product-workspace/workspace.js             *)
(*   RT  = desktop/renderer/src/product-workspace/node-detail-runtime.js   *)
(*   NIC = desktop/renderer/src/node-input-controls.js                     *)
(*   DR  = crates/relayer-app-server/src/storage/sqlite/input_drafts.rs    *)
(*   IC  = crates/relayer-app-server/src/storage/sqlite/interaction_contexts.rs *)
(*   MIG = crates/relayer-app-server/src/storage/sqlite/migrations/        *)
(*         0028_action_input_detach_receipts.sql                           *)
(*                                                                         *)
(* One thread, one authored input occurrence, and possibly one other      *)
(* committed attachment. Each server request is one transaction; the      *)
(* renderer learns its result in a later task. The prompt is assumed to   *)
(* hold text, so Send is enabled by its other gates.                      *)
(***************************************************************************)
EXTENDS Naturals

CONSTANTS
  MaxVal,           \* bound on distinct typed values
  MaxRev,           \* bound on the draft revision
  SendAwaitsAuthoredCommits \* TRUE since #521: Send waits for the thread's
                    \* authored input commits before it captures the draft
                    \* revision (WS settleAuthoredInputCommits). Before, Send
                    \* stayed enabled and captured the revision at the click
                    \* while an authored commit was in flight.

NoVal == 0
Idle == [st |-> "none", expected |-> 0, val |-> NoVal, tracked |-> FALSE,
         result |-> "none", rev |-> 0]

VARIABLES
  \* --- server (SQLite) ---
  srvRev,       \* action_input_drafts.revision
  srvVal,       \* the authored occurrence's committed value, or NoVal
  srvOther,     \* another committed attachment exists
  active,       \* the thread has an active interaction
  snap,         \* the running attempt's reserved inputs: [val, other]
  \* --- renderer ---
  crev,         \* the input draft controller's revision
  cval,         \* the controller's committed value for the occurrence
  field,        \* the authored input's DOM value
  put,          \* the commit request: [st, expected, val, tracked, result, rev]
  send,         \* the Send: [st, expected, result, reserved value]
  running,      \* the renderer shows the new turn as running
  reload,       \* a draft reload is queued behind the commit in flight
                \* (the controller serializes them, NIC:455-464)
  \* --- ghosts ---
  intended,     \* the answer the user had entered when they clicked Send
  raced,        \* a commit was in flight when they clicked Send
  sentWith,     \* the answer the accepted Send reserved, or NoVal
  outcome       \* how the last Send ended: none | sent | stopped (its answer did
                \* not save) | rejected_by_own_commit | rejected

vars == <<srvRev, srvVal, srvOther, active, snap, crev, cval, field, put, send,
          running, reload, intended, raced, sentWith, outcome>>

Init ==
  /\ srvRev = 1 /\ srvVal = NoVal /\ srvOther \in BOOLEAN
  /\ active = FALSE /\ snap = [val |-> NoVal, other |-> FALSE]
  /\ crev = 1 /\ cval = NoVal /\ field = NoVal
  /\ put = Idle
  /\ send = [st |-> "idle", expected |-> 0, result |-> "none", reserved |-> NoVal]
  /\ running = FALSE /\ reload = FALSE
  /\ intended = NoVal /\ raced = FALSE /\ sentWith = NoVal /\ outcome = "none"

-----------------------------------------------------------------------------
(* The user.                                                              *)

\* Typing changes only the DOM (RT:397-406). The host is disabled while its
\* own commit is busy (RT:284), and while a Send is in flight. A commit
\* during a run goes to the next turn's draft (ADR 0008).
Type(v) ==
  /\ v # field /\ put.st = "none" /\ send.st = "idle"
  /\ field' = v
  /\ UNCHANGED <<srvRev, srvVal, srvOther, active, snap, crev, cval, put, send,
                 running, reload, intended, raced, sentWith, outcome>>

\* Leaving the field fires change, which commits through onInput
\* (RT:380-388, 409; WS:4959-4993) at the controller's revision
\* (NIC:486-497). Pressing the mouse on Send blurs the field first.
Commit ==
  /\ put.st = "none" /\ field # NoVal /\ field # cval /\ send.st = "idle"
  /\ put' = [st |-> "inflight", expected |-> crev, val |-> field,
             tracked |-> FALSE, result |-> "none", rev |-> 0]
  /\ UNCHANGED <<srvRev, srvVal, srvOther, active, snap, crev, cval, field, send,
                 running, reload, intended, raced, sentWith, outcome>>

\* Send is enabled when no send is in flight and the turn is not running
\* (WS:3113-3123; while it runs, the button is Stop). Its intent is rebuilt with the controller's revision
\* after the input reconciliation await (WS:710-731); that await resolves
\* without yielding unless an authored commit is pending and awaited.
ClickSend ==
  /\ send.st = "idle" /\ ~running
  /\ LET waits == SendAwaitsAuthoredCommits /\ put.st # "none" IN
     send' = [st |-> IF waits THEN "waiting" ELSE "inflight",
              expected |-> IF waits THEN 0 ELSE crev, result |-> "none", reserved |-> NoVal]
  /\ intended' = IF put.st # "none" THEN put.val ELSE cval
  /\ raced' = (put.st # "none")
  /\ outcome' = "none"
  /\ UNCHANGED <<srvRev, srvVal, srvOther, active, snap, crev, cval, field, put,
                 running, reload, sentWith>>

-----------------------------------------------------------------------------
(* The server.                                                            *)

\* PUT .../input-draft/attachments (DR:21-104): a lost-response replay of
\* the same value one revision back succeeds; otherwise the expected
\* revision must be current.
ServeCommit ==
  /\ put.st = "inflight" /\ srvRev < MaxRev
  /\ LET replay == srvVal = put.val /\ put.expected + 1 = srvRev
         fresh == put.expected = srvRev
     IN IF replay THEN put' = [put EXCEPT !.st = "answered", !.result = "ok", !.rev = srvRev]
                       /\ UNCHANGED <<srvRev, srvVal>>
        ELSE IF fresh
        THEN /\ srvVal' = put.val /\ srvRev' = srvRev + 1
             /\ put' = [put EXCEPT !.st = "answered", !.result = "ok", !.rev = srvRev + 1]
        ELSE /\ put' = [put EXCEPT !.st = "answered", !.result = "conflict"]
             /\ UNCHANGED <<srvRev, srvVal>>
  /\ UNCHANGED <<srvOther, active, snap, crev, cval, field, send, running, reload,
                 intended, raced, sentWith, outcome>>

\* The commit fails in transport or on the server without applying (a 5xx
\* or a lost connection).
CommitFails ==
  /\ put.st = "inflight"
  /\ put' = [put EXCEPT !.st = "answered", !.result = "failed"]
  /\ UNCHANGED <<srvRev, srvVal, srvOther, active, snap, crev, cval, field, send, running,
                 reload, intended, raced, sentWith, outcome>>

\* The follow-up POST reserves the draft in one transaction (IC:166-324):
\* an active interaction refuses it; a changed revision refuses it; with
\* committed attachments it snapshots them, deletes them, and advances the
\* revision; with none it reserves nothing and leaves the revision.
ServeSend ==
  /\ send.st = "inflight" /\ srvRev < MaxRev
  /\ IF active
     THEN /\ send' = [send EXCEPT !.st = "answered", !.result = "in_progress"]
          /\ UNCHANGED <<srvRev, srvVal, srvOther, active, snap>>
     ELSE IF send.expected # srvRev
     THEN /\ send' = [send EXCEPT !.st = "answered", !.result = "conflict"]
          /\ UNCHANGED <<srvRev, srvVal, srvOther, active, snap>>
     ELSE LET inputs == srvVal # NoVal \/ srvOther IN
          /\ snap' = [val |-> srvVal, other |-> srvOther]
          /\ srvVal' = NoVal /\ srvOther' = FALSE
          /\ srvRev' = IF inputs THEN srvRev + 1 ELSE srvRev
          /\ active' = TRUE
          /\ send' = [send EXCEPT !.st = "answered", !.result = "ok", !.reserved = srvVal]
  /\ UNCHANGED <<crev, cval, field, put, running, reload, intended, raced, sentWith, outcome>>

-----------------------------------------------------------------------------
(* Replies reaching the renderer.                                         *)

\* The commit returns; a conflict adopts the server draft (NIC:465-474) and
\* shows the error on the mount. A reload queued behind it then runs. A Send
\* waiting on it captures the controller's revision, or stops if the commit
\* failed.
CommitReturns ==
  /\ put.st = "answered"
  /\ LET ok == put.result = "ok"
         \* Only a conflict adopts the server draft; another failure keeps
         \* the controller's draft (NIC:465-474).
         adopt == reload \/ put.result = "conflict"
         rev == IF adopt THEN srvRev ELSE IF ok THEN put.rev ELSE crev
         waiting == send.st = "waiting"
     IN /\ crev' = rev
        /\ cval' = IF adopt THEN srvVal ELSE IF ok THEN put.val ELSE cval
        /\ reload' = FALSE
        /\ send' = IF waiting /\ put.result = "ok"
                   THEN [send EXCEPT !.st = "inflight", !.expected = rev]
                   ELSE IF waiting THEN [st |-> "idle", expected |-> 0, result |-> "none", reserved |-> NoVal]
                   ELSE send
        /\ outcome' = IF waiting /\ put.result # "ok" THEN "stopped" ELSE outcome
  /\ put' = Idle
  /\ UNCHANGED <<srvRev, srvVal, srvOther, active, snap, field, running,
                 intended, raced, sentWith>>

\* A draft reload: immediate, or queued behind the commit in flight.
Reload ==
  IF put.st = "none"
  THEN crev' = srvRev /\ cval' = srvVal /\ reload' = FALSE
  ELSE UNCHANGED <<crev, cval>> /\ reload' = TRUE

\* The POST returns. Success reloads the draft after the thread refresh
\* (WS:3220-3228); failure reloads it too (WS:3296-3298). Re-rendering the
\* selection then shows the committed value in the authored input
\* (WS:3339-3341, 4896-4902), unless its own commit is still busy.
SendReturns ==
  /\ send.st = "answered"
  /\ running' = (send.result = "ok")
  /\ Reload
  /\ field' = IF put.st = "none" THEN srvVal ELSE field
  /\ sentWith' = IF send.result = "ok" THEN send.reserved ELSE sentWith
  /\ outcome' = CASE send.result = "ok" -> "sent"
                  [] send.result = "conflict" /\ raced -> "rejected_by_own_commit"
                  [] OTHER -> "rejected"
  /\ send' = [st |-> "idle", expected |-> 0, result |-> "none", reserved |-> NoVal]
  /\ UNCHANGED <<srvRev, srvVal, srvOther, active, snap, put, intended, raced>>

\* The renderer learns the turn ended and reloads the draft.
TurnSettles ==
  /\ running /\ ~active
  /\ running' = FALSE
  /\ Reload
  /\ UNCHANGED <<srvRev, srvVal, srvOther, active, snap, field, put, send,
                 intended, raced, sentWith, outcome>>

\* The turn ends. A failure before acceptance restores the snapshot into
\* the draft unless a newer commit owns the slot, and advances the
\* revision (MIG:15-74). The renderer learns of it later (TurnSettles).
TurnEndsServer(accepted) ==
  /\ active /\ srvRev < MaxRev
  /\ active' = FALSE
  /\ IF accepted
     THEN UNCHANGED <<srvRev, srvVal, srvOther>>
     ELSE /\ srvVal' = IF srvVal = NoVal THEN snap.val ELSE srvVal
          /\ srvOther' = (srvOther \/ snap.other)
          /\ srvRev' = srvRev + 1
  /\ snap' = [val |-> NoVal, other |-> FALSE]
  /\ UNCHANGED <<crev, cval, field, put, send, running, reload, intended, raced, sentWith, outcome>>

-----------------------------------------------------------------------------
Next ==
  \/ \E v \in 1..MaxVal : Type(v)
  \/ Commit \/ ClickSend
  \/ ServeCommit \/ CommitFails \/ ServeSend
  \/ \E ok \in BOOLEAN : TurnEndsServer(ok)
  \/ CommitReturns \/ SendReturns \/ TurnSettles

Spec == Init /\ [][Next]_vars

Act(s) ==
  LET n == s[1] IN
  CASE n = "Type" -> Type(s[2])
    [] n = "Commit" -> Commit
    [] n = "ClickSend" -> ClickSend
    [] n = "ServeCommit" -> ServeCommit
    [] n = "CommitFails" -> CommitFails
    [] n = "ServeSend" -> ServeSend
    [] n = "TurnEnds" -> TurnEndsServer(s[2] = "accepted")
    [] n = "CommitReturns" -> CommitReturns
    [] n = "SendReturns" -> SendReturns
    [] n = "TurnSettles" -> TurnSettles

-----------------------------------------------------------------------------
(* Safety.                                                                *)

TypeOK ==
  /\ srvRev \in 1..MaxRev /\ crev \in 1..MaxRev
  /\ srvVal \in 0..MaxVal /\ cval \in 0..MaxVal /\ field \in 0..MaxVal

\* "Send waits for an input commit still in flight ... That answer then goes
\* with that Send" (PRD 7.2, #521): an answer the user entered before clicking
\* Send goes with that Send when the Send is accepted.
SendCarriesEnteredAnswer ==
  outcome = "sent" /\ intended # NoVal => sentWith = intended

\* Send is not refused because of the user's own commit of that answer.
SendNotRefusedByOwnAnswer == outcome # "rejected_by_own_commit"

=============================================================================
