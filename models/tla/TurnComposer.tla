---------------------------- MODULE TurnComposer ----------------------------
(***************************************************************************)
(* The follow-up composer of the Product workspace: typing, Send, the     *)
(* follow-up POST, the new turn arriving, and settlement of the submitted *)
(* draft, while the user switches threads and the workspace re-renders.   *)
(*                                                                         *)
(* Source of truth (every action cites the code it abstracts):            *)
(*   WS = desktop/renderer/src/product-workspace/workspace.js              *)
(*   CS = desktop/renderer/src/product-workspace/composer-submission.js    *)
(*   TH = desktop/renderer/src/threads.js                                  *)
(*   CD = desktop/renderer/src/composer-drafts.js                          *)
(*                                                                         *)
(* The renderer is single-threaded. Each action is one task: a user event *)
(* or the continuation of one await. Code between two awaits is atomic.   *)
(*                                                                         *)
(* A composer draft is scoped to (thread, latest turn) (WS:1126). Text is  *)
(* abstracted to an identity: each keystroke burst makes a fresh value,   *)
(* and 0 is the empty prompt. Context annotations, input attachments,     *)
(* restored retry drafts, the model picker, and the unconfirmed-draft     *)
(* warning are not modeled.                                                *)
(***************************************************************************)
EXTENDS Naturals, FiniteSets

CONSTANTS
  Threads,          \* thread ids
  MaxTurns,         \* bound on turns per thread
  MaxText,          \* bound on distinct typed values
  MaxRev,           \* bound on composerPromptRevision
  BackgroundRenders, \* renderThread() runs for reasons unrelated to the send
                    \* (window focus refreshes the environment, polling, SSE)
  CarryUnsentDraft, \* TRUE since #512: entering a newer turn's empty scope
                    \* moves unsent text from the newest older scope of the
                    \* thread, unless it is the submission in flight; a
                    \* failed send restores its stranded text. Before, the
                    \* new scope started empty and the text was stranded
  StableScopeRevision \* TRUE since #513: re-entering a scope keeps its
                    \* revision when its text is unchanged and otherwise
                    \* takes one above any it had. Before, it took
                    \* currentPromptRevision + 1, which could repeat or
                    \* change without the text changing

None == "none"
Null == MaxText + 1   \* composer-drafts has no value for the key
NoDraft == [text |-> Null, rev |-> 0]
Scopes == Threads \X (1..MaxTurns)
Texts == 0..MaxText
Phases == {"idle", "post", "posted", "refresh", "settle"}

VARIABLES
  \* --- Product state as the renderer sees it (appState) ---
  view,         \* viewState.currentThreadId
  latest,       \* thread -> index of its latest turn
  running,      \* thread -> its latest turn's completion is pending
  pendingTurn,  \* thread -> the server holds a follow-up turn the renderer
                \* has not loaded yet
  \* --- composer (WS:2420-2422, #threadPrompt) ---
  active,       \* composerDraftScopeState.activeScopeKey
  drafts,       \* composerDraftScopeState.drafts: scope -> [text, rev]
  text,         \* prompt.value
  rev,          \* composerPromptRevision
  disabled,     \* prompt.disabled
  persisted,    \* CD threadFollowups: scope -> text, or Null
  \* --- send attempts (WS:2403-2404) ---
  pc,           \* thread -> phase of its in-flight send (inFlightSendThreads)
  owner,        \* sendAttempt?.threadId, or None
  intent,       \* thread -> [text, rev, scope] captured when Send was clicked
  \* --- ghosts ---
  fresh,        \* last text identity handed out
  sent,         \* texts a successful follow-up POST carried
  unsent,       \* thread -> the user's latest text there, until it is sent
  cleared       \* the text the last settlement removed from the prompt, or 0

vars == <<view, latest, running, pendingTurn, active, drafts, text, rev, disabled,
          persisted, pc, owner, intent, fresh, sent, unsent, cleared>>
productVars == <<latest, running, pendingTurn>>
composerVars == <<active, drafts, text, rev, disabled, persisted>>
ghostVars == <<fresh, sent, unsent, cleared>>

Max(a, b) == IF a >= b THEN a ELSE b
Scope(t) == <<t, latest[t]>>

-----------------------------------------------------------------------------
(* transitionComposerDraftScope (WS:1134-1201) with restoredDraft = null   *)
(* and persistedDraftText = threadFollowupDraft(nextScope) (WS:3902-3913). *)
(* Returns the next [drafts, text, rev].                                   *)
EnterScope(next) ==
  LET stored == persisted[next] IN
  IF active = next THEN
    LET changed == stored # Null /\ stored # text
        nt == IF changed THEN stored ELSE text
        nr == IF changed THEN rev + 1 ELSE rev
    IN [drafts |-> [drafts EXCEPT ![next] = [text |-> nt, rev |-> nr]],
        text |-> nt, rev |-> nr, carried |-> FALSE, prior |-> next]
  ELSE
    LET saved == [drafts EXCEPT ![active] = [text |-> text, rev |-> rev]]
        \* The newest older scope of this thread that holds text.
        older == {k \in 1..(next[2] - 1) :
                    saved[<<next[1], k>>] # NoDraft /\ saved[<<next[1], k>>].text # 0}
        prior == IF older = {} THEN next
                 ELSE <<next[1], CHOOSE k \in older : \A j \in older : j <= k>>
        \* The prior turn's draft is still the in-flight submission,
        \* unchanged since Send; its settlement will clear it.
        submitting == pc[next[1]] # "idle" /\ intent[next[1]].scope = prior
                      /\ saved[prior].rev = intent[next[1]].rev
        carried == CarryUnsentDraft /\ older # {} /\ ~submitting
        base == IF StableScopeRevision /\ saved[next] # NoDraft
                THEN Max(saved[next].rev, rev) ELSE rev
        unchanged == StableScopeRevision /\ saved[next] # NoDraft
                     /\ saved[next].text = stored
        empty == stored = Null /\ (saved[next] = NoDraft \/ saved[next].text = 0)
        entered ==
          IF stored # Null /\ unchanged THEN saved
          ELSE IF stored # Null
          THEN [saved EXCEPT ![next] = [text |-> stored, rev |-> base + 1]]
          ELSE IF empty /\ carried
          THEN [saved EXCEPT ![next] = [text |-> saved[prior].text, rev |-> base + 1],
                             ![prior] = NoDraft]
          ELSE IF saved[next] = NoDraft
          THEN [saved EXCEPT ![next] = [text |-> 0, rev |-> rev + 1]]
          ELSE saved
    IN [drafts |-> entered, text |-> entered[next].text, rev |-> entered[next].rev,
        carried |-> stored = Null /\ empty /\ carried, prior |-> prior]

\* render() for thread t (WS:3749-3938): the scope transition, then
\* renderInteractionState sets prompt.disabled from the latest turn's status
\* (WS:4043-4047). Under CarryUnsentDraft, a carried draft moves: it is
\* persisted under its new scope and removed from the old one.
EnterScopeEffect(next, isRunning) ==
  LET e == EnterScope(next) IN
  /\ drafts' = e.drafts
  /\ text' = e.text
  /\ rev' = e.rev
  /\ active' = next
  /\ disabled' = isRunning
  /\ persisted' = IF e.carried
                  THEN [persisted EXCEPT ![next] = e.text, ![e.prior] = Null]
                  ELSE persisted

Render(t, isRunning) == EnterScopeEffect(Scope(t), isRunning)

Init ==
  /\ view \in Threads
  /\ latest = [t \in Threads |-> 1]
  /\ running = [t \in Threads |-> FALSE]
  /\ pendingTurn = [t \in Threads |-> FALSE]
  /\ active = <<view, 1>>
  /\ drafts = [s \in Scopes |-> IF s = <<view, 1>> THEN [text |-> 0, rev |-> 1]
                                ELSE NoDraft]
  /\ text = 0 /\ rev = 1 /\ disabled = FALSE
  /\ persisted = [s \in Scopes |-> Null]
  /\ pc = [t \in Threads |-> "idle"]
  /\ owner = None
  /\ intent = [t \in Threads |-> [text |-> 0, rev |-> 0, scope |-> <<t, 1>>]]
  /\ fresh = 0 /\ sent = {} /\ unsent = [t \in Threads |-> 0] /\ cleared = 0

-----------------------------------------------------------------------------
(* User actions.                                                          *)

\* prompt.oninput (WS:3470-3481): a new value, one revision, persisted
\* under the active scope (an empty value deletes the key, CD:108-120).
Type ==
  /\ ~disabled /\ fresh < MaxText /\ rev < MaxRev
  /\ fresh' = fresh + 1
  /\ text' = fresh + 1
  /\ rev' = rev + 1
  /\ persisted' = [persisted EXCEPT ![active] = fresh + 1]
  /\ unsent' = [unsent EXCEPT ![view] = fresh + 1]
  /\ cleared' = 0
  /\ UNCHANGED <<view, productVars, active, drafts, disabled, pc, owner, intent, sent>>

Erase ==
  /\ ~disabled /\ text # 0 /\ rev < MaxRev
  /\ text' = 0
  /\ rev' = rev + 1
  /\ persisted' = [persisted EXCEPT ![active] = Null]
  /\ unsent' = [unsent EXCEPT ![view] = 0]
  /\ cleared' = 0
  /\ UNCHANGED <<view, productVars, active, drafts, disabled, pc, owner, intent,
                 fresh, sent>>

\* Selecting another thread loads its state and renders it (loadThread,
\* TH:650-661; WS:3787-3815), so a turn the server holds becomes the latest.
\* releaseSendAttempt drops sendAttempt but not inFlightSendThreads.
SwitchThread(u) ==
  /\ u # view /\ rev < MaxRev
  /\ view' = u
  /\ owner' = None
  /\ IF pendingTurn[u] /\ latest[u] < MaxTurns
     THEN /\ latest' = [latest EXCEPT ![u] = @ + 1]
          /\ running' = [running EXCEPT ![u] = TRUE]
          /\ pendingTurn' = [pendingTurn EXCEPT ![u] = FALSE]
          /\ EnterScopeEffect(<<u, latest[u] + 1>>, TRUE)
     ELSE /\ Render(u, running[u])
          /\ UNCHANGED productVars
  /\ cleared' = 0
  /\ UNCHANGED <<pc, intent, fresh, sent, unsent>>

\* requestInteractionSend (WS:3347-3491) through submitInteraction up to its
\* await (WS:3199-3218). Send is enabled only with text, an enabled prompt,
\* no in-flight send for this thread, and loaded drafts (WS:3113-3121), so
\* the draft-load awaits resolve without yielding to another task. The
\* intent is captured at the click. threads.submitInteraction reads the
\* thread from viewState behind a dynamic import (graph.js), which is
\* assumed to resolve in the same task.
ClickSend ==
  /\ ~disabled /\ text # 0
  /\ pc[view] = "idle"
  /\ owner # view
  /\ pc' = [pc EXCEPT ![view] = "post"]
  /\ owner' = view
  /\ intent' = [intent EXCEPT ![view] = [text |-> text, rev |-> rev, scope |-> active]]
  /\ disabled' = TRUE
  /\ cleared' = 0
  /\ UNCHANGED <<view, productVars, active, drafts, text, rev, persisted, fresh,
                 sent, unsent>>

-----------------------------------------------------------------------------
(* The follow-up POST and its continuations (TH:733-812).                 *)

\* submitInteraction's finally resets prompt.disabled from the status on
\* screen, whichever thread that is (WS:3334-3338); requestInteractionSend's
\* finally releases the in-flight entry and sendAttempt (WS:3485-3490).
FinallyEffect(t) ==
  /\ disabled' = running[view]
  /\ pc' = [pc EXCEPT ![t] = "idle"]
  /\ owner' = IF owner = t THEN None ELSE owner

\* A POST rejected before the server records the turn settles in the same
\* task: submitInteraction's catch and
\* finally, then requestInteractionSend's finally (WS:3294-3345, 3485-3490;
\* TH:787-790). The prompt keeps its value. Under CarryUnsentDraft, text
\* stranded in the submitted scope because a newer turn arrived meanwhile
\* is restored into the empty prompt.
PostFails(t) ==
  /\ pc[t] = "post"
  /\ LET i == intent[t]
         stranded == IF drafts[i.scope] # NoDraft THEN drafts[i.scope].text ELSE 0
         restore == CarryUnsentDraft /\ view = t /\ active # i.scope
                    /\ text = 0 /\ stranded # 0
     IN /\ text' = IF restore THEN stranded ELSE text
        /\ rev' = IF restore THEN rev + 1 ELSE rev
        /\ drafts' = IF restore THEN [drafts EXCEPT ![i.scope] = NoDraft] ELSE drafts
        /\ persisted' = IF restore
                        THEN [persisted EXCEPT ![active] = stranded, ![i.scope] = Null]
                        ELSE persisted
  /\ FinallyEffect(t)
  /\ cleared' = 0
  /\ UNCHANGED <<view, productVars, active, intent, fresh, sent, unsent>>

\* The server records the follow-up turn before it starts the run and
\* answers (crates/relayer-app-server/src/api/threads.rs:600-666). It does so
\* only while the thread has no active interaction
\* (storage/sqlite/interactions.rs:249-259, interaction_in_progress);
\* otherwise PostFails. A start that fails after the turn is recorded
\* restores the draft through the retry path, which is not modeled.
PostInserted(t) ==
  /\ pc[t] = "post"
  /\ ~pendingTurn[t] /\ ~running[t] /\ latest[t] < MaxTurns
  /\ pc' = [pc EXCEPT ![t] = "posted"]
  /\ pendingTurn' = [pendingTurn EXCEPT ![t] = TRUE]
  /\ sent' = sent \cup {intent[t].text}
  /\ unsent' = [unsent EXCEPT ![t] = IF @ = intent[t].text THEN 0 ELSE @]
  /\ cleared' = 0
  /\ UNCHANGED <<view, latest, running, composerVars, owner, intent, fresh>>

PostSucceeds(t) ==
  /\ pc[t] = "posted"
  /\ pc' = [pc EXCEPT ![t] = "refresh"]
  /\ cleared' = 0
  /\ UNCHANGED <<view, productVars, composerVars, owner, intent, fresh, sent, unsent>>

\* A newer turn becomes the thread's latest; if the thread is on screen,
\* renderThread() moves the composer to the new turn's scope.
TurnArrivesEffect(t) ==
  /\ latest' = [latest EXCEPT ![t] = @ + 1]
  /\ running' = [running EXCEPT ![t] = TRUE]
  /\ pendingTurn' = [pendingTurn EXCEPT ![t] = FALSE]
  /\ IF view = t
     THEN EnterScopeEffect(<<t, latest[t] + 1>>, TRUE)
     ELSE UNCHANGED composerVars

\* Settlement after a successful POST (WS:3240-3269, CS:1-55), then the
\* finally blocks in the same task:
\* settleComposerSubmission clears the prompt only on the same thread, same
\* scope, and same prompt revision; clearSubmittedComposerDraft drops the
\* submitted scope's draft and its persisted text only when its retained
\* revision equals the submitted one, comparing composerPromptRevision
\* before the prompt is cleared.
Settle(t) ==
  /\ pc[t] = "settle"
  /\ LET i == intent[t]
         clearPrompt == view = t /\ active = i.scope /\ rev = i.rev
         \* A scope with no entry retains no revision (undefined in WS:1209).
         retained == IF active = i.scope THEN rev
                     ELSE IF drafts[i.scope] # NoDraft THEN drafts[i.scope].rev
                     ELSE MaxRev + 99
         dropDraft == retained = i.rev
     IN /\ text' = IF clearPrompt THEN 0 ELSE text
        /\ rev' = IF clearPrompt THEN i.rev + 1 ELSE rev
        /\ drafts' = IF dropDraft THEN [drafts EXCEPT ![i.scope] = NoDraft] ELSE drafts
        /\ persisted' = IF dropDraft THEN [persisted EXCEPT ![i.scope] = Null]
                        ELSE persisted
        /\ cleared' = IF clearPrompt /\ text # 0 THEN text ELSE 0
  /\ FinallyEffect(t)
  /\ UNCHANGED <<view, productVars, active, intent, fresh, sent, unsent>>

-----------------------------------------------------------------------------
(* The product advancing on its own.                                      *)

\* Polling or an event loads the accepted follow-up (TH:schedulePendingRefresh).
TurnArrives(t) ==
  /\ pendingTurn[t] /\ pc[t] # "refresh" /\ rev < MaxRev
  /\ TurnArrivesEffect(t)
  /\ cleared' = 0
  /\ UNCHANGED <<view, pc, owner, intent, fresh, sent, unsent>>

TurnFinishes(t) ==
  /\ running[t] /\ ~pendingTurn[t]
  /\ running' = [running EXCEPT ![t] = FALSE]
  /\ disabled' = IF view = t THEN FALSE ELSE disabled
  /\ cleared' = 0
  /\ UNCHANGED <<view, latest, pendingTurn, active, drafts, text, rev, persisted,
                 pc, owner, intent, fresh, sent, unsent>>

\* renderThread() for an unrelated reason re-renders the thread on screen.
BackgroundRender ==
  /\ BackgroundRenders /\ rev < MaxRev
  /\ Render(view, running[view])
  /\ cleared' = 0
  /\ UNCHANGED <<view, productVars, pc, owner, intent, fresh, sent, unsent>>

\* After the POST, submitInteraction refreshes the thread only if the
\* navigation entry [thread, turn, layer path] is unchanged (TH:797-808;
\* workspace-navigation.js:31-38), and refreshState drops a response for a
\* thread no longer on screen (TH:460-463). The refresh is a fetch, so it is
\* its own task. RefreshSkipped models a changed entry, such as a send from
\* a nested layer followed by leaving and returning to the thread, which
\* resets the layer path, or a failed refresh (TH:809-812).
RefreshReturnsAction(t) ==
  /\ pc[t] = "refresh"
  /\ (view = t /\ pendingTurn[t]) => rev < MaxRev   \* bound only
  /\ pc' = [pc EXCEPT ![t] = "settle"]
  /\ IF view = t /\ pendingTurn[t]
     THEN TurnArrivesEffect(t)
     ELSE UNCHANGED <<productVars, composerVars>>
  /\ cleared' = 0
  /\ UNCHANGED <<view, owner, intent, fresh, sent, unsent>>

RefreshSkipped(t) ==
  /\ pc[t] = "refresh"
  /\ pc' = [pc EXCEPT ![t] = "settle"]
  /\ cleared' = 0
  /\ UNCHANGED <<view, productVars, composerVars, owner, intent, fresh, sent, unsent>>

-----------------------------------------------------------------------------
SystemStep ==
  \E t \in Threads :
    \/ PostInserted(t) \/ PostSucceeds(t) \/ PostFails(t)
    \/ RefreshReturnsAction(t) \/ RefreshSkipped(t)
    \/ Settle(t)

Next ==
  \/ Type \/ Erase \/ ClickSend
  \/ \E u \in Threads : SwitchThread(u)
  \/ SystemStep
  \/ \E t \in Threads : TurnArrives(t) \/ TurnFinishes(t)
  \/ BackgroundRender

\* Every send continuation runs once the POST answers.
Fairness ==
  /\ \A t \in Threads :
       /\ WF_vars(PostInserted(t) \/ PostFails(t))
       /\ WF_vars(PostSucceeds(t))
       /\ WF_vars(RefreshReturnsAction(t) \/ RefreshSkipped(t))
       /\ WF_vars(Settle(t))

Spec == Init /\ [][Next]_vars
FairSpec == Spec /\ Fairness

Act(s) ==
  LET n == s[1] IN
  CASE n = "Type" -> Type
    [] n = "Erase" -> Erase
    [] n = "ClickSend" -> ClickSend
    [] n = "SwitchThread" -> SwitchThread(s[2])
    [] n = "PostInserted" -> PostInserted(s[2])
    [] n = "PostSucceeds" -> PostSucceeds(s[2])
    [] n = "PostFails" -> PostFails(s[2])
    [] n = "RefreshReturns" -> RefreshReturnsAction(s[2])
    [] n = "RefreshSkipped" -> RefreshSkipped(s[2])
    [] n = "Settle" -> Settle(s[2])
    [] n = "TurnArrives" -> TurnArrives(s[2])
    [] n = "TurnFinishes" -> TurnFinishes(s[2])
    [] n = "BackgroundRender" -> BackgroundRender

-----------------------------------------------------------------------------
(* Safety.                                                                *)

TypeOK ==
  /\ view \in Threads
  /\ \A t \in Threads : latest[t] \in 1..MaxTurns /\ pc[t] \in Phases
  /\ text \in Texts /\ rev \in Nat
  /\ active = Scope(view)

\* The text the composer shows for thread t: the prompt on screen, or what
\* render() would restore on entering t now.
Shown(t) == IF view = t THEN text ELSE EnterScope(Scope(t)).text

\* SCP-016: "Saved-thread ... drafts survive navigation and restart. Send or
\* explicit clearing removes only the applicable draft." SCP-018: text
\* written while a send is in flight survives the new turn loading. The user's latest unsent text in a thread is what
\* that thread's composer shows, except while a send owns that text: a
\* successful send removes it, and a failed one must hand it back.
Sending(t) == pc[t] # "idle" /\ intent[t].text = unsent[t]
UnsentDraftSurvives ==
  \A t \in Threads : unsent[t] # 0 /\ ~Sending(t) => Shown(t) = unsent[t]

\* The same promise, narrowed to the settlement step: a successful send
\* removes from the prompt only text that send carried.
SettlementClearsOnlySentText == cleared = 0 \/ cleared \in sent

\* "Send ... removes ... the applicable draft" (SCP-016): once a thread's
\* send has settled, its composer does not offer the sent text again.
SentTextIsNotShownAgain ==
  \A t \in Threads : pc[t] = "idle" /\ Shown(t) # 0 => Shown(t) \notin sent

\* One follow-up POST per thread at a time (WS:3354-3356).
OneSendPerThread == \A t \in Threads : pc[t] = "post" => intent[t].scope[1] = t

-----------------------------------------------------------------------------
(* Liveness.                                                              *)

\* A send always releases its thread's Send button.
SendReleases == \A t \in Threads : pc[t] # "idle" ~> pc[t] = "idle"

=============================================================================
