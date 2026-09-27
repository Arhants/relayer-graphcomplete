---------------------------- MODULE NodeInspector ----------------------------
(***************************************************************************)
(* Node selection on the graph canvas, the Node Details inspector, and    *)
(* the durable annotation draft editor, while the product state changes   *)
(* underneath and the user closes the inspector or moves between turns.   *)
(*                                                                         *)
(* Source of truth (every action cites the code it abstracts):            *)
(*   WS = desktop/renderer/src/product-workspace/workspace.js              *)
(*   TH = desktop/renderer/src/threads.js                                  *)
(*                                                                         *)
(* The renderer is single-threaded. Each action is one task: a user event *)
(* or the continuation of one await. Code between two awaits is atomic.   *)
(* A draft save that is already settled resolves without yielding         *)
(* (saveContextDraftBeforeSelection, WS:973-994), so only an unsaved      *)
(* draft opens a window. An authored Node Detail mounts asynchronously    *)
(* (renderProductNodeDetail, WS:89-159).                                  *)
(*                                                                         *)
(* One thread. Historical context selections, node inputs, annotation     *)
(* comments, confirm (which resolves like discard), and the camera are    *)
(* not modeled.                                                           *)
(***************************************************************************)
EXTENDS Naturals, FiniteSets, Sequences

CONSTANTS
  Nodes,            \* node ids of the visible layers
  MaxRev,           \* bound on product state revisions
  MaxEditors,       \* bound on editor identities
  Slots,            \* in-flight selectNode activations
  QueueWhileResolving, \* TRUE since #514: a click, close, or turn change
                    \* arriving while the editor resolves waits for it, and
                    \* the latest one then proceeds (WS awaitUserRequestTurn).
                    \* Before, it returned at once, and a dropped prepare
                    \* also cancelled a pending request
  RefreshAfterResolve \* TRUE since #515: a switch continues from the latest
                    \* state, and a resolved draft re-renders the selection
                    \* unless a waiting request or the switch will. Before,
                    \* a render during the save was dropped and a refused
                    \* request left the kept node's superseded mount disposed

None == "none"
NoEditor == [node |-> None, eid |-> 0, resolving |-> FALSE]
FreeSlot == [st |-> "free", node |-> None, rev |-> 0, cur |-> FALSE, eid |-> 0, fresh |-> FALSE]
NoHost == [slot |-> 0, node |-> None, live |-> FALSE, owned |-> FALSE]
NoRequest == [kind |-> "none", node |-> None]

VARIABLES
  \* --- product state (appState) ---
  srev,         \* revision of the state the latest render() used
  graph,        \* nodes of the visible layer
  \* --- workspace (createProductWorkspace closure and DOM) ---
  \* nodeSelectionSequence is compared only for equality with the value a
  \* request captured, so each in-flight request carries cur: whether no
  \* request has incremented the sequence since it captured it.
  sel,          \* selection.selectedNodeId
  open,         \* #inspector is visible
  title,        \* #detailTitle and #detailKind: [node, rev] of the state
                \* snapshot the header was rendered from
  detail,       \* the Node Detail host in #detailContent: [slot rendering
                \* into it, node, live = its page is shown and not disposed,
                \* owned = it is mountedAuthoredDetail's host]
  mounted,      \* the node of mountedAuthoredDetail, or None
  attach,       \* #attachNodeContext was last updated with a selection
  editor,       \* contextEditor (durable): [node, eid, resolving]
  eids,         \* last editor identity handed out
  queued,       \* under QueueWhileResolving, the latest request that arrived
                \* while the editor resolved
  \* --- context draft controller ---
  drafts,       \* nodes with an unconfirmed durable draft
  unsaved,      \* nodes whose draft text is not saved yet
  \* --- in-flight work ---
  slots,        \* slot -> selectNode activation awaiting a save or a mount
  prep,         \* prepareNodeContextSelectionChange awaiting a save
  op,           \* the editor identity whose discard is in flight, or 0
  \* --- ghost ---
  want          \* what the user last asked the inspector to show

vars == <<srev, graph, sel, open, title, detail, mounted, attach, editor, eids,
          queued, drafts, unsaved, slots, prep, op, want>>

(* Operators below work on a record W of every variable, so that render() *)
(* can compose the dock reconciliation, renderGraph, and selectNode in one *)
(* task, as the code does.                                                *)
W == [srev |-> srev, graph |-> graph, sel |-> sel, open |-> open,
      title |-> title, detail |-> detail, mounted |-> mounted, attach |-> attach,
      editor |-> editor, eids |-> eids,
      queued |-> queued, drafts |-> drafts, unsaved |-> unsaved, slots |-> slots,
      prep |-> prep, op |-> op, want |-> want]

Assign(w) ==
  /\ srev' = w.srev /\ graph' = w.graph /\ sel' = w.sel
  /\ open' = w.open /\ title' = w.title /\ detail' = w.detail
  /\ mounted' = w.mounted /\ attach' = w.attach /\ editor' = w.editor
  /\ eids' = w.eids /\ queued' = w.queued /\ drafts' = w.drafts
  /\ unsaved' = w.unsaved /\ slots' = w.slots /\ prep' = w.prep /\ op' = w.op
  /\ want' = w.want

FreeSlots(w) == {k \in Slots : w.slots[k].st = "free"}
Take(w, s) == LET k == CHOOSE k \in FreeSlots(w) : TRUE IN [w EXCEPT !.slots[k] = s]
TakenSlot(w) == CHOOSE k \in FreeSlots(w) : TRUE

\* ++nodeSelectionSequence: every request in flight is superseded.
Bump(w) == [w EXCEPT !.slots = [k \in Slots |-> [w.slots[k] EXCEPT !.cur = FALSE]],
                     !.prep.cur = FALSE]

-----------------------------------------------------------------------------
(* selectNode (WS:4754-5120).                                             *)

\* The synchronous part after any draft switch: select the node, restore a
\* durable editor for its draft, open the inspector, render the header from
\* the state the call was given, and start rendering the Node Detail
\* (WS:4803-4935). renderProductNodeDetail (WS:89-151) reuses the mounted
\* runtime when it shows the same node and its host is still in place, and
\* only updates its capabilities; otherwise it disposes that runtime,
\* replaces #detailContent with a new host, and mounts into it. The
\* authored page renders before its assets resolve (node-detail-runtime.js
\* :476-500), so the new host shows content while the mount is pending.
Continue(w, n, r) ==
  LET restore == w.editor = NoEditor /\ n \in w.drafts
      reuse == w.mounted = n /\ w.detail.owned /\ w.detail.live
      k == TakenSlot(w)
      w1 == [w EXCEPT !.sel = n, !.open = TRUE, !.title = [node |-> n, rev |-> r],
                      !.editor = IF restore
                                 THEN [node |-> n, eid |-> w.eids + 1, resolving |-> FALSE]
                                 ELSE w.editor,
                      !.eids = IF restore THEN w.eids + 1 ELSE w.eids,
                      !.detail = IF reuse THEN w.detail
                                 ELSE [slot |-> k, node |-> n, live |-> TRUE, owned |-> FALSE]]
  IN [w1 EXCEPT !.slots[k] = [st |-> "mounting", node |-> n, rev |-> r, cur |-> TRUE,
                              eid |-> 0, fresh |-> ~reuse]]

\* The synchronous start (WS:4761-4801) with the state revision r its
\* caller read. While the editor resolves the call returns at once, or the
\* candidate fix remembers a user's request. A request for a node no longer
\* in the view does nothing, and the user's earlier choice stands.
Select(w, n, r, user) ==
  IF w.editor.resolving
  THEN IF QueueWhileResolving /\ user
       THEN [w EXCEPT !.queued = [kind |-> "select", node |-> n]]
       ELSE w
  ELSE LET w0 == Bump(w)
       IN IF n \notin w.graph THEN [w0 EXCEPT !.want = IF user THEN w.sel ELSE w.want]
          ELSE IF w.editor # NoEditor /\ w.editor.node # n
          THEN IF w.editor.node \in w.unsaved
               THEN Take([w0 EXCEPT !.editor.resolving = TRUE],
                         [st |-> "saving", node |-> n, rev |-> r, cur |-> TRUE,
                          eid |-> w.editor.eid, fresh |-> FALSE])
               ELSE Continue([w0 EXCEPT !.editor = NoEditor], n, r)
          ELSE Continue(w0, n, r)

\* renderNodeContextDock (WS:2587-2626): a durable editor survives only for
\* the selected node's draft; a selected draft without one gets one.
Reconcile(w) ==
  IF w.editor = NoEditor
  THEN IF w.sel # None /\ w.sel \in w.drafts
       THEN [w EXCEPT !.editor = [node |-> w.sel, eid |-> w.eids + 1, resolving |-> FALSE],
                      !.eids = w.eids + 1]
       ELSE w
  ELSE IF w.sel = None \/ w.editor.node # w.sel \/ w.editor.node \notin w.drafts
       THEN [w EXCEPT !.editor = NoEditor]
       ELSE w

\* render() (WS:3749-3938) with state revision r and visible nodes g:
\* renderInteractionState reconciles the dock and updates the attach
\* control first (WS:4049-4050), renderGraph
\* may clear the selection on entering a new view (WS:4210-4380), and the
\* selection is refreshed with selectNode or the inspector hidden
\* (WS:3930-3937).
\* A remembered click is retried against the view it finds; it does nothing
\* if its node is gone.
Render(w, r, g, entering) ==
  LET w1 == Reconcile([w EXCEPT !.srev = r, !.graph = g, !.attach = w.sel # None])
      w2 == IF entering THEN [Bump(w1) EXCEPT !.open = FALSE] ELSE w1
      clears == entering /\ w2.sel # None /\ w2.sel \notin g
      w3 == IF clears THEN [Bump(w2) EXCEPT !.sel = None, !.open = FALSE] ELSE w2
  IN IF w3.sel # None THEN Select(w3, w3.sel, r, FALSE) ELSE [w3 EXCEPT !.open = FALSE]

-----------------------------------------------------------------------------
(* prepareNodeContextSelectionChange (WS:1624-1646) and what follows it:   *)
(* closeInspector (WS:1836-1862) or selectTurnById (TH:712-731). A turn   *)
(* change loads another turn whose visible nodes are g.                   *)

Proceed(w, purpose, g) ==
  IF purpose = "close"
  THEN [w EXCEPT !.sel = None, !.editor = NoEditor, !.open = FALSE]
  ELSE LET w1 == Render([w EXCEPT !.sel = None], w.srev + 1, g, TRUE)
       IN [w1 EXCEPT !.want = w1.sel]      \* a click in the old view is void

Prepare(w, purpose, g) ==
  LET w0 == Bump(w)
  IN IF w.editor = NoEditor \/ (~w.editor.resolving /\ w.editor.node \notin w.unsaved)
     THEN Proceed(w0, purpose, g)
     ELSE IF w.editor.resolving
     THEN IF QueueWhileResolving THEN [w0 EXCEPT !.queued = [kind |-> purpose, node |-> None]]
          ELSE w0                            \* dropped
     ELSE [w0 EXCEPT !.editor.resolving = TRUE,
                     !.prep = [st |-> purpose, node |-> None, rev |-> 0, cur |-> TRUE,
                               eid |-> w.editor.eid, fresh |-> FALSE]]

\* When the editor stops resolving, the candidate fixes replay the latest
\* user request that arrived meanwhile, then re-render the selection from
\* the latest state unless a current request already will.
\* A current request is already rendering the selection, or will.
Fresh(w) ==
  \E k \in Slots :
    w.slots[k].cur /\ (w.slots[k].st = "saving"
                       \/ (w.slots[k].rev = w.srev /\ w.slots[k].node = w.sel))
    \* A superseded mount can leave a dead host that the refresh replaces.
Replay(w, g) ==
  IF w.queued = NoRequest THEN w
  ELSE LET q == w.queued
           w0 == [w EXCEPT !.queued = NoRequest]
       IN IF q.kind = "select" THEN Select([w0 EXCEPT !.want = q.node], q.node, w.srev, TRUE)
          ELSE Prepare([w0 EXCEPT !.want = None], q.kind, g)
Resume(w, g) ==
  IF w.editor.resolving THEN w
  ELSE LET w1 == Replay(w, g) IN
       IF RefreshAfterResolve /\ ~w1.editor.resolving /\ w1.prep.st = "free"
          /\ w1.sel # None /\ ~Fresh(w1)
       THEN Select(w1, w1.sel, w1.srev, FALSE)
       ELSE w1

\* Working in the inspector re-asserts its selection, unless the user
\* already asked for another one that is still pending.
Pending(w) == \/ w.queued # NoRequest
              \/ w.prep.st # "free" /\ w.prep.cur
              \/ \E k \in Slots : w.slots[k].cur /\ w.slots[k].st = "saving"
Keep(w) == IF Pending(w) THEN w.want ELSE w.sel

ClearResolving(w, eid) ==
  IF w.editor.eid = eid THEN [w EXCEPT !.editor.resolving = FALSE] ELSE w

\* Room for the next step within the bounds; NewState also advances srev.
Room(w) == Cardinality(FreeSlots(w)) >= 2 /\ w.eids < MaxEditors
NewState(w) == Room(w) /\ w.srev < MaxRev

Init ==
  /\ srev = 1 /\ graph = Nodes
  /\ sel = None /\ open = FALSE
  /\ title = [node |-> None, rev |-> 0]
  /\ detail = NoHost /\ mounted = None /\ attach = FALSE
  /\ editor = NoEditor /\ eids = 0 /\ queued = NoRequest
  /\ drafts = {} /\ unsaved = {}
  /\ slots = [k \in Slots |-> FreeSlot]
  /\ prep = FreeSlot /\ op = 0
  /\ want = None

-----------------------------------------------------------------------------
(* User actions.                                                          *)

\* A click or Enter on a graph node (WS:4299-4316).
Click(n) ==
  /\ n \in graph /\ Room(W)
  /\ Assign(Select([W EXCEPT !.want = n], n, srev, TRUE))

\* The attach-context control opens a durable draft for the selected node
\* (openContextEditor, WS:2468-2508). The controller creates it unsaved and
\* schedules its first save (node-context-drafts.js:318-352).
Annotate ==
  /\ open /\ attach /\ sel # None /\ editor = NoEditor /\ Room(W)
  /\ editor' = [node |-> sel, eid |-> eids + 1, resolving |-> FALSE]
  /\ eids' = eids + 1
  /\ drafts' = drafts \cup {sel}
  /\ unsaved' = unsaved \cup {sel}
  /\ want' = Keep(W)
  /\ UNCHANGED <<srev, graph, sel, open, title, detail, mounted, attach, queued, slots,
                 prep, op>>

\* Typing in the editor; the controller autosaves after 350 ms.
EditDraft ==
  /\ editor # NoEditor /\ ~editor.resolving
  /\ unsaved' = unsaved \cup {editor.node}
  /\ want' = IF sel = editor.node THEN Keep(W) ELSE want
  /\ UNCHANGED <<srev, graph, sel, open, title, detail, mounted, attach, editor, eids, queued,
                 drafts, slots, prep, op>>

\* × discards the selected node's draft (WS:2704-2720). A saved draft needs
\* a request (node-context-drafts.js:531-575); discarding a draft that was
\* never saved is local and is not modeled.
Discard ==
  /\ editor # NoEditor /\ ~editor.resolving /\ op = 0 /\ editor.node \notin unsaved
  /\ editor' = [editor EXCEPT !.resolving = TRUE]
  /\ op' = editor.eid
  /\ want' = IF sel = editor.node THEN Keep(W) ELSE want
  /\ UNCHANGED <<srev, graph, sel, open, title, detail, mounted, attach, eids, queued, drafts,
                 unsaved, slots, prep>>

\* The close button or Escape (WS:1863-1877). A second one while the first
\* flushes is dropped, and it supersedes the first (WS:1625-1638).
Close ==
  /\ open /\ (prep.st = "free" \/ editor.resolving) /\ Room(W)
  /\ Assign(Prepare([W EXCEPT !.want = None], "close", graph))

\* Previous or Next turn (WS:1893-1904) loads a turn with nodes g.
NextTurn ==
  /\ (prep.st = "free" \/ editor.resolving) /\ NewState(W)
  /\ \E g \in SUBSET Nodes : Assign(Prepare([W EXCEPT !.want = None], "turn", g))

-----------------------------------------------------------------------------
(* Continuations of awaits. Each may replay a remembered request, which   *)
(* for a turn change loads nodes g.                                       *)

ReplayGraphs(w) == IF w.queued.kind = "turn" THEN SUBSET Nodes ELSE {w.graph}

\* The draft flush in selectNode returns (WS:4786-4806). A refused switch
\* keeps the selection, which the user then sees (PRD L2204).
SaveReturns(k, ok) ==
  /\ slots[k].st = "saving"
  /\ LET s == slots[k]
         w0 == ClearResolving([W EXCEPT !.slots[k] = FreeSlot,
                                        !.unsaved = IF ok THEN unsaved \ {editor.node}
                                                    ELSE unsaved], s.eid)
         stale == ~s.cur
         refused == ~stale /\ ~ok
         w1 == IF stale THEN w0
               ELSE IF refused THEN [w0 EXCEPT !.want = w0.sel]
               ELSE Continue([w0 EXCEPT !.editor = NoEditor], s.node,
                             IF RefreshAfterResolve THEN w0.srev ELSE s.rev)
     IN \E g \in ReplayGraphs(w1) : Assign(Resume(w1, g))

\* renderProductNodeDetail returns once the assets resolve (WS:4935-4955,
\* 5113-5116). A superseded call disposes a new runtime, emptying its host
\* (node-detail-runtime.js:672-678); a current call records it as mounted
\* and updates the attach control.
MountReturns(k) ==
  /\ slots[k].st = "mounting"
  /\ LET s == slots[k]
         here == detail.slot = k
         kept == s.cur \/ ~s.fresh
     IN /\ detail' = IF here /\ s.fresh
                      THEN [detail EXCEPT !.live = kept, !.owned = s.cur]
                      ELSE IF s.cur /\ s.fresh THEN [detail EXCEPT !.owned = FALSE]
                      ELSE detail
        /\ mounted' = IF s.cur /\ s.fresh THEN s.node ELSE mounted
        /\ attach' = IF s.cur THEN TRUE ELSE attach
        /\ slots' = [slots EXCEPT ![k] = FreeSlot]
  /\ UNCHANGED <<srev, graph, sel, open, title, editor, eids, queued, drafts,
                 unsaved, prep, op, want>>

\* The flush in prepareNodeContextSelectionChange returns (WS:1633-1645).
PrepareReturns(ok) ==
  /\ prep.st # "free"
  /\ LET p == prep
         w0 == ClearResolving([W EXCEPT !.prep = FreeSlot,
                                        !.unsaved = IF ok THEN unsaved \ {editor.node}
                                                    ELSE unsaved], p.eid)
         \* Today a prepare whose editor was replaced gives up (WS:1638).
         \* The candidate fix prepares again for the editor now open.
         proceed == ok /\ p.cur /\ editor.eid = p.eid
         again == ok /\ p.cur /\ editor.eid # p.eid /\ QueueWhileResolving
         w1 == IF proceed \/ again THEN w0
               ELSE IF ~ok /\ p.cur THEN [w0 EXCEPT !.want = w0.sel] ELSE w0
     IN \E g \in SUBSET Nodes :
          /\ (p.st = "close" \/ ~(proceed \/ again)) /\ w1.queued.kind # "turn" => g = graph
          /\ Assign(Resume(IF proceed THEN Proceed(w1, p.st, g)
                           ELSE IF again THEN Prepare(w1, p.st, g) ELSE w1, g))

\* The discard request returns (WS:2709-2719).
DiscardReturns(ok) ==
  /\ op # 0
  /\ LET gone == IF ok THEN {editor.node} ELSE {}
         w0 == ClearResolving([W EXCEPT !.op = 0, !.drafts = drafts \ gone,
                                        !.unsaved = unsaved \ gone], op)
         w1 == IF ok /\ editor.eid = op THEN [w0 EXCEPT !.editor = NoEditor] ELSE w0
         w2 == Reconcile(w1)
     IN \E g \in ReplayGraphs(w2) : Assign(Resume(w2, g))

-----------------------------------------------------------------------------
(* The product advancing on its own.                                      *)

\* The draft's 350 ms autosave lands (createNodeContextDraftController).
Autosave(n) ==
  /\ n \in unsaved
  /\ unsaved' = unsaved \ {n}
  /\ UNCHANGED <<srev, graph, sel, open, title, detail, mounted, attach, editor, eids, queued,
                 drafts, slots, prep, op, want>>

\* renderThread() with newer state. Entering a new view (another layer or
\* turn) may bring other nodes. A view change the user did not ask for
\* supersedes their pending request (PRD L2298); what stays selected is what
\* they then expect.
StatePushTo(entering, g) ==
  /\ NewState(W)
  /\ ~entering => g = graph
  /\ LET w1 == Render(W, srev + 1, g, entering) IN
     Assign(IF entering THEN [w1 EXCEPT !.want = w1.sel] ELSE w1)

StatePush == \E entering \in BOOLEAN, g \in SUBSET Nodes : StatePushTo(entering, g)

-----------------------------------------------------------------------------
Next ==
  \/ \E n \in Nodes : Click(n)
  \/ Annotate \/ EditDraft \/ Discard \/ Close \/ NextTurn
  \/ \E k \in Slots, ok \in BOOLEAN : SaveReturns(k, ok)
  \/ \E k \in Slots : MountReturns(k)
  \/ \E ok \in BOOLEAN : PrepareReturns(ok) \/ DiscardReturns(ok)
  \/ \E n \in Nodes : Autosave(n)
  \/ StatePush

Spec == Init /\ [][Next]_vars

Act(s) ==
  LET n == s[1] IN
  CASE n = "Click" -> Click(s[2])
    [] n = "Annotate" -> Annotate
    [] n = "EditDraft" -> EditDraft
    [] n = "Discard" -> Discard
    [] n = "Close" -> Close
    [] n = "NextTurn" -> NextTurn
    [] n = "SaveReturns" -> SaveReturns(s[2], s[3] = "ok")
    [] n = "MountReturns" -> MountReturns(s[2])
    [] n = "PrepareReturns" -> PrepareReturns(s[2] = "ok")
    [] n = "DiscardReturns" -> DiscardReturns(s[2] = "ok")
    [] n = "Autosave" -> Autosave(s[2])
    [] n = "StatePush" -> IF s[2] = "same" THEN StatePushTo(FALSE, graph)
                          ELSE StatePushTo(TRUE, {s[i] : i \in 3..Len(s)})

-----------------------------------------------------------------------------
(* Safety. The inspector promises are about what the user sees once the  *)
(* renderer has nothing left to do.                                       *)

TypeOK ==
  /\ sel \in Nodes \cup {None}
  /\ drafts \subseteq Nodes /\ unsaved \subseteq drafts

Quiet ==
  /\ \A k \in Slots : slots[k].st = "free"
  /\ prep.st = "free" /\ op = 0

\* "Clicking a node opens its authored details and actions in the right
\* inspector" (PRD L2293); closing hides it.
InspectorShowsSelection ==
  Quiet => /\ open <=> sel # None
           /\ open => /\ title.node = sel
                      /\ detail.node = sel /\ detail.live

\* The inspector is rendered from the latest state. This extends "The
\* canvas and inspector show the exact accepted layer" (PRD L297), which is
\* about which layer is shown; freshness within a layer is not promised.
InspectorIsCurrent == Quiet /\ open => title.rev = srev

\* The inspector ends on what the user last asked for. The PRD says only
\* "Clicking a node opens its authored details" (L2293); whether input may
\* be ignored while a draft resolves is a product decision.
LastRequestWins == Quiet => sel = want

\* "selecting a drafted node restores the same text and open editor"
\* (PRD L2203).
DraftedSelectionHasEditor ==
  Quiet /\ sel # None /\ sel \in drafts => editor.node = sel

=============================================================================
