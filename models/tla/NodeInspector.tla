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
  LatestRequestSupersedes, \* TRUE since review of #514: a user's newest
                    \* request supersedes every earlier one. A click that
                    \* waits for a resolving draft supersedes the switch in
                    \* flight, as a waiting Close or turn change already did,
                    \* and a request that proceeds at once voids any still
                    \* waiting (WS userRequestTicket). Before, the switch
                    \* committed its node first, and a waiting request could
                    \* run after a newer one
  RefreshAfterResolve \* TRUE since #515: a switch continues from the latest
                    \* state, and a resolved draft re-renders the selection
                    \* unless a waiting request or the switch will. Before,
                    \* a render during the save was dropped and a refused
                    \* request left the kept node's superseded mount disposed

None == "none"
NoKey == <<None, 0>>
NoEditor == [node |-> None, eid |-> 0, resolving |-> FALSE, vid |-> 0]
FreeSlot == [st |-> "free", node |-> None, rev |-> 0, cur |-> FALSE, eid |-> 0, fresh |-> FALSE,
             key |-> NoKey]
NoOp == [eid |-> 0, key |-> NoKey]
NoHost == [slot |-> 0, node |-> None, live |-> FALSE, owned |-> FALSE]
NoRequest == [kind |-> "none", node |-> None]

VARIABLES
  \* --- product state (appState) ---
  srev,         \* revision of the state the latest render() used
  graph,        \* nodes of the visible layer
  vid,          \* the visible view (thread, turn, layer); a new one on entering
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
  editor,       \* contextEditor (durable): [node, eid, resolving, vid]
  eids,         \* last editor identity handed out
  queued,       \* under QueueWhileResolving, the latest request that arrived
                \* while the editor resolved
  \* --- context draft controller ---
  drafts,       \* unconfirmed durable drafts: <<node, view>>. A draft's target
                \* includes the layer it was made in, so it is usable only in
                \* that view (nodeContextDraftForSelection, WS:960-966); the
                \* controller holds one per node (node-context-drafts.js:318-326)
  unsaved,      \* drafts whose text is not saved yet
  \* --- in-flight work ---
  slots,        \* slot -> selectNode activation awaiting a save or a mount
  prep,         \* prepareNodeContextSelectionChange awaiting a save
  op,           \* the discard in flight: [editor identity, draft], or NoOp
  \* --- ghost ---
  want,         \* what the user last asked the inspector to show
  stray,        \* a request the user had superseded committed its node
  closed        \* the host's nodeDetailsClosed: the user closed Node Details, so
                \* entering a view selects nothing (threads.js
                \* replaceCurrentSelection)

vars == <<srev, graph, vid, sel, open, title, detail, mounted, attach, editor, eids,
          queued, drafts, unsaved, slots, prep, op, want, stray, closed>>

(* Operators below work on a record W of every variable, so that render() *)
(* can compose the dock reconciliation, renderGraph, and selectNode in one *)
(* task, as the code does.                                                *)
W == [srev |-> srev, graph |-> graph, vid |-> vid, sel |-> sel, open |-> open,
      title |-> title, detail |-> detail, mounted |-> mounted, attach |-> attach,
      editor |-> editor, eids |-> eids,
      queued |-> queued, drafts |-> drafts, unsaved |-> unsaved, slots |-> slots,
      prep |-> prep, op |-> op, want |-> want, stray |-> stray, closed |-> closed]

Assign(w) ==
  /\ srev' = w.srev /\ graph' = w.graph /\ vid' = w.vid /\ sel' = w.sel
  /\ open' = w.open /\ title' = w.title /\ detail' = w.detail
  /\ mounted' = w.mounted /\ attach' = w.attach /\ editor' = w.editor
  /\ eids' = w.eids /\ queued' = w.queued /\ drafts' = w.drafts
  /\ unsaved' = w.unsaved /\ slots' = w.slots /\ prep' = w.prep /\ op' = w.op
  /\ want' = w.want /\ stray' = w.stray /\ closed' = w.closed

Key(e) == <<e.node, e.vid>>
HasDraft(w, n) == <<n, w.vid>> \in w.drafts

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
  LET restore == w.editor = NoEditor /\ HasDraft(w, n)
      reuse == w.mounted = n /\ w.detail.owned /\ w.detail.live
      k == TakenSlot(w)
      w1 == [w EXCEPT !.sel = n, !.open = TRUE, !.title = [node |-> n, rev |-> r], !.closed = FALSE,
                      !.editor = IF restore
                                 THEN [node |-> n, eid |-> w.eids + 1, resolving |-> FALSE,
                                       vid |-> w.vid]
                                 ELSE w.editor,
                      !.eids = IF restore THEN w.eids + 1 ELSE w.eids,
                      !.detail = IF reuse THEN w.detail
                                 ELSE [slot |-> k, node |-> n, live |-> TRUE, owned |-> FALSE]]
  IN [w1 EXCEPT !.slots[k] = [st |-> "mounting", node |-> n, rev |-> r, cur |-> TRUE,
                              eid |-> 0, fresh |-> ~reuse, key |-> NoKey]]

\* The synchronous start (WS:4761-4801) with the state revision r its
\* caller read. While the editor resolves the call returns at once, or the
\* candidate fix remembers a user's request. A request for a node no longer
\* in the view does nothing, and the user's earlier choice stands.
Select(w, n, r, user) ==
  IF w.editor.resolving
  THEN IF QueueWhileResolving /\ user
       THEN [IF LatestRequestSupersedes THEN Bump(w) ELSE w
               EXCEPT !.queued = [kind |-> "select", node |-> n]]
       ELSE w
  ELSE LET w0 == Bump(w)
       IN IF n \notin w.graph THEN [w0 EXCEPT !.want = IF user THEN w.sel ELSE w.want]
          ELSE IF w.editor # NoEditor /\ (w.editor.node # n \/ w.editor.vid # w.vid)
          THEN IF Key(w.editor) \in w.unsaved
               THEN Take([w0 EXCEPT !.editor.resolving = TRUE],
                         [st |-> "saving", node |-> n, rev |-> r, cur |-> TRUE,
                          eid |-> w.editor.eid, fresh |-> FALSE, key |-> Key(w.editor)])
               ELSE Continue([w0 EXCEPT !.editor = NoEditor], n, r)
          ELSE Continue(w0, n, r)

\* renderNodeContextDock (WS:2587-2626): a durable editor survives only for
\* the selected node's draft; a selected draft without one gets one.
Reconcile(w) ==
  IF w.editor = NoEditor
  THEN IF w.sel # None /\ HasDraft(w, w.sel)
       THEN [w EXCEPT !.editor = [node |-> w.sel, eid |-> w.eids + 1, resolving |-> FALSE,
                                  vid |-> w.vid],
                      !.eids = w.eids + 1]
       ELSE w
  ELSE IF w.sel = None \/ w.editor.node # w.sel \/ w.editor.vid # w.vid
          \/ Key(w.editor) \notin w.drafts
       THEN [w EXCEPT !.editor = NoEditor]
       ELSE w

\* render() (WS:3749-3938) with state revision r and visible nodes g:
\* renderInteractionState reconciles the dock and updates the attach
\* control first (WS:4049-4050), renderGraph
\* may clear the selection on entering a new view (WS:4210-4380), and the
\* selection is refreshed with selectNode or the inspector hidden
\* (WS:3930-3937).
\* Entering a new view voids a remembered click from the old one, and the
\* mounted runtime no longer matches the mount key, which includes the
\* interaction and layer (WS:4906-4912).
Render(w, r, g, entering) ==
  LET w1 == Reconcile([w EXCEPT !.srev = r, !.graph = g, !.attach = w.sel # None,
                                !.vid = IF entering THEN w.vid + 1 ELSE w.vid,
                                !.queued = IF entering /\ w.queued.kind = "select"
                                           THEN NoRequest ELSE w.queued])
      w2 == IF entering THEN [Bump(w1) EXCEPT !.open = FALSE, !.mounted = None] ELSE w1
      clears == entering /\ w2.sel # None /\ w2.sel \notin g
      w3 == IF clears THEN [Bump(w2) EXCEPT !.sel = None, !.open = FALSE] ELSE w2
      \* Unless the user closed Node Details, entering a view keeps a node that
      \* is still in it and otherwise selects the layer's first node
      \* (preferredLayerNode; the layers name no default node).
      auto == ~w3.closed /\ (entering \/ (w3.sel # None /\ w3.sel \notin g))
      pick == IF w3.sel # None /\ w3.sel \in g THEN w3.sel
              ELSE IF "n1" \in g THEN "n1" ELSE IF "n2" \in g THEN "n2" ELSE None
      w4 == IF auto THEN [w3 EXCEPT !.sel = pick] ELSE w3
  IN IF w4.sel # None THEN Select(w4, w4.sel, r, FALSE) ELSE [w4 EXCEPT !.open = FALSE]

-----------------------------------------------------------------------------
(* prepareNodeContextSelectionChange (WS:1624-1646) and what follows it:   *)
(* closeInspector (WS:1836-1862) or selectTurnById (TH:712-731). A turn   *)
(* change loads another turn whose visible nodes are g.                   *)

Proceed(w, purpose, g) ==
  IF purpose = "close"
  THEN [w EXCEPT !.sel = None, !.editor = NoEditor, !.open = FALSE, !.closed = TRUE]
  ELSE LET w1 == Render([w EXCEPT !.sel = None], w.srev + 1, g, TRUE)
       IN [w1 EXCEPT !.want = w1.sel]      \* a click in the old view is void

Prepare(w, purpose, g) ==
  LET w0 == Bump(w)
  IN IF w.editor = NoEditor \/ (~w.editor.resolving /\ Key(w.editor) \notin w.unsaved)
     THEN Proceed(w0, purpose, g)
     ELSE IF w.editor.resolving
     THEN IF QueueWhileResolving THEN [w0 EXCEPT !.queued = [kind |-> purpose, node |-> None]]
          ELSE w0                            \* dropped
     ELSE [w0 EXCEPT !.editor.resolving = TRUE,
                     !.prep = [st |-> purpose, node |-> None, rev |-> 0, cur |-> TRUE,
                               eid |-> w.editor.eid, fresh |-> FALSE, key |-> Key(w.editor)]]

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
  /\ srev = 1 /\ graph = Nodes /\ vid = 1
  /\ sel = None /\ open = FALSE
  /\ title = [node |-> None, rev |-> 0]
  /\ detail = NoHost /\ mounted = None /\ attach = FALSE
  /\ editor = NoEditor /\ eids = 0 /\ queued = NoRequest
  /\ drafts = {} /\ unsaved = {}
  /\ slots = [k \in Slots |-> FreeSlot]
  /\ prep = FreeSlot /\ op = NoOp
  /\ want = None
  /\ stray = FALSE /\ closed = TRUE

-----------------------------------------------------------------------------
(* User actions.                                                          *)

\* A new user request: under LatestRequestSupersedes, a request still
\* waiting is void, whether this one waits too or proceeds at once.
Newest(w) == IF LatestRequestSupersedes THEN NoRequest ELSE w.queued

\* A click or Enter on a graph node (WS:4299-4316).
Click(n) ==
  /\ n \in graph /\ Room(W)
  /\ Assign(Select([W EXCEPT !.want = n, !.queued = Newest(W)], n, srev, TRUE))

\* The attach-context control opens a durable draft for the selected node
\* (openContextEditor, WS:2468-2508). The controller creates it unsaved and
\* schedules its first save (node-context-drafts.js:318-352). It refuses a
\* second draft for a node that has one from another view.
Annotate ==
  /\ open /\ attach /\ sel # None /\ editor = NoEditor /\ Room(W)
  /\ \A d \in drafts : d[1] # sel
  /\ editor' = [node |-> sel, eid |-> eids + 1, resolving |-> FALSE, vid |-> vid]
  /\ eids' = eids + 1
  /\ drafts' = drafts \cup {<<sel, vid>>}
  /\ unsaved' = unsaved \cup {<<sel, vid>>}
  /\ want' = Keep(W)
  /\ UNCHANGED <<srev, graph, vid, sel, open, title, detail, mounted, attach, queued, slots,
                 prep, op, stray, closed>>

\* Typing in the editor; the controller autosaves after 350 ms.
EditDraft ==
  /\ editor # NoEditor /\ ~editor.resolving
  /\ unsaved' = unsaved \cup {Key(editor)}
  /\ want' = IF sel = editor.node THEN Keep(W) ELSE want
  /\ UNCHANGED <<srev, graph, vid, sel, open, title, detail, mounted, attach, editor, eids,
                 queued, drafts, slots, prep, op, stray, closed>>

\* × discards the selected node's draft (WS:2704-2720). A saved draft needs
\* a request (node-context-drafts.js:531-575); discarding a draft that was
\* never saved is local and is not modeled.
Discard ==
  /\ editor # NoEditor /\ ~editor.resolving /\ op = NoOp /\ Key(editor) \notin unsaved
  /\ editor' = [editor EXCEPT !.resolving = TRUE]
  /\ op' = [eid |-> editor.eid, key |-> Key(editor)]
  /\ want' = IF sel = editor.node THEN Keep(W) ELSE want
  /\ UNCHANGED <<srev, graph, vid, sel, open, title, detail, mounted, attach, eids, queued,
                 drafts, unsaved, slots, prep, stray, closed>>

\* The close button or Escape (WS:1863-1877). A second one while the first
\* flushes is dropped, and it supersedes the first (WS:1625-1638).
Close ==
  /\ open /\ (prep.st = "free" \/ editor.resolving) /\ Room(W)
  /\ Assign(Prepare([W EXCEPT !.want = None, !.queued = Newest(W)], "close", graph))

\* Previous or Next turn (WS:1893-1904) loads a turn with nodes g.
NextTurn ==
  /\ (prep.st = "free" \/ editor.resolving) /\ NewState(W)
  /\ \E g \in SUBSET Nodes : Assign(Prepare([W EXCEPT !.want = None, !.queued = Newest(W)], "turn", g))

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
                                        !.unsaved = IF ok THEN unsaved \ {s.key}
                                                    ELSE unsaved], s.eid)
         stale == ~s.cur
         refused == ~stale /\ ~ok
         w1 == IF stale THEN w0
               ELSE IF refused THEN [w0 EXCEPT !.want = w0.sel]
               \* A switch that commits while a newer request waits reports a
               \* node the user no longer wants.
               ELSE Continue([w0 EXCEPT !.editor = NoEditor,
                                        !.stray = w0.stray \/ w0.queued # NoRequest], s.node,
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
  /\ UNCHANGED <<srev, graph, vid, sel, open, title, editor, eids, queued, drafts,
                 unsaved, prep, op, want, stray, closed>>

\* The flush in prepareNodeContextSelectionChange returns (WS:1633-1645).
PrepareReturns(ok) ==
  /\ prep.st # "free"
  /\ LET p == prep
         w0 == ClearResolving([W EXCEPT !.prep = FreeSlot,
                                        !.unsaved = IF ok THEN unsaved \ {p.key}
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
  /\ op # NoOp
  /\ LET gone == IF ok THEN {op.key} ELSE {}
         w0 == ClearResolving([W EXCEPT !.op = NoOp, !.drafts = drafts \ gone,
                                        !.unsaved = unsaved \ gone], op.eid)
         w1 == IF ok /\ editor.eid = op.eid THEN [w0 EXCEPT !.editor = NoEditor] ELSE w0
         w2 == Reconcile(w1)
     IN \E g \in ReplayGraphs(w2) : Assign(Resume(w2, g))

-----------------------------------------------------------------------------
(* The product advancing on its own.                                      *)

\* The draft's 350 ms autosave lands (createNodeContextDraftController).
Autosave(d) ==
  /\ d \in unsaved
  /\ unsaved' = unsaved \ {d}
  /\ UNCHANGED <<srev, graph, vid, sel, open, title, detail, mounted, attach, editor, eids,
                 queued, drafts, slots, prep, op, want, stray, closed>>

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
  \/ \E d \in unsaved : Autosave(d)
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
    [] n = "Autosave" -> Autosave(<<s[2], vid>>)
    [] n = "StatePush" -> IF s[2] = "same" THEN StatePushTo(FALSE, graph)
                          ELSE StatePushTo(TRUE, {s[i] : i \in 3..Len(s)})

-----------------------------------------------------------------------------
(* Safety. The inspector promises are about what the user sees once the  *)
(* renderer has nothing left to do.                                       *)

TypeOK ==
  /\ sel \in Nodes \cup {None}
  /\ \A d \in drafts : d[1] \in Nodes
  /\ unsaved \subseteq drafts

Quiet ==
  /\ \A k \in Slots : slots[k].st = "free"
  /\ prep.st = "free" /\ op = NoOp

\* "Clicking a node opens its authored details and actions in the right
\* inspector" (PRD L2293); closing hides it.
InspectorShowsSelection ==
  Quiet => /\ open <=> sel # None
           /\ open => /\ title.node = sel
                      /\ detail.node = sel /\ detail.live

\* "once the draft resolves, Node Details shows the selected node from the
\* latest state" (PRD 7.1, #515).
InspectorIsCurrent == Quiet /\ open => title.rev = srev

\* The inspector ends on what the user last asked for: input made while a
\* draft resolves "waits for it instead of being ignored", and "only the
\* latest waiting request proceeds" (PRD 7.1, #514).
LastRequestWins == Quiet => sel = want

\* "selecting a drafted node restores the same text and open editor"
\* (PRD L2203).
\* Only the latest request selects: a superseded one does not report its
\* node through onSelectionChange or record it in navigation history.
OnlyLatestRequestSelects == ~stray

DraftedSelectionHasEditor ==
  Quiet /\ sel # None /\ <<sel, vid>> \in drafts => editor.node = sel

=============================================================================
