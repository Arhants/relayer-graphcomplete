--------------------------- MODULE CanvasGesture ---------------------------
(***************************************************************************)
(* Pointer gestures on the graph canvas: dragging a node, clicking it,    *)
(* and panning the stage, while the workspace re-renders underneath with  *)
(* the same layout, a changed layout, or another view and back.           *)
(*                                                                         *)
(* Source of truth (every action cites the code it abstracts):            *)
(*   WS = desktop/renderer/src/product-workspace/workspace.js              *)
(*                                                                         *)
(* The renderer is single-threaded; each action is one task. Positions   *)
(* are abstract locations on a ring of L points: a node's screen location *)
(* is its world location plus the camera offset. One draggable node N;   *)
(* the other view has no node N. Pinch zoom, wheel zoom, keyboard, and   *)
(* the inspector's camera fit are not modeled.                            *)
(*                                                                         *)
(* renderGraph replaces graphNodes with new objects and                  *)
(* the node elements with new ones. A node keeps its dragged position     *)
(* when it was pinned and the layout signature is unchanged; a cached     *)
(* view restores positions and camera on return; a changed layout resets  *)
(* positions to the layout and refits the camera.                         *)
(***************************************************************************)
EXTENDS Naturals

CONSTANTS
  L,                \* locations on the ring
  MaxGen,           \* bound on renders
  FitBeforeLeaving, \* TRUE since review of #531: a fit still due when the
                    \* view changes runs before the view is cached. Before,
                    \* returning restored the unfitted camera
  FitLayoutAfterDrop, \* TRUE since review of #531: a layout that changed
                    \* mid-drag is fitted once the node is dropped. Before,
                    \* the fit was skipped, and new nodes could stay off-screen
  KeepDragAcrossRender \* TRUE since the fix (#531): a render re-binds the drag to
                    \* its node's new object and element and keeps the node
                    \* under the pointer. Before, the drag kept the replaced
                    \* object and capture, and moved a node no longer drawn

None == L + 1
Wrap(x) == x % L
Canon(layout) == layout - 1          \* N's authored location in each layout
\* fitGraphCamera centers the graph, which puts the one node N at screen
\* location 0.
Fit(x) == Wrap(L - x)
NoDrag == [on |-> FALSE, gen |-> 0, capGen |-> 0, moved |-> FALSE]

VARIABLES
  view,         \* "home" (shows N) or "away"
  layout,       \* the home view's layout signature: 1 or 2
  gen,          \* renderGraph generation: graphNodes and node elements
  w,            \* N's world location in the current graphNodes
  pinned,       \* N's current object is pinned
  cam,          \* camera offset
  cache,        \* graphViewCache for home: [w, pinned, cam, layout] or NoCache
  ptr,          \* pointer screen location
  pressed,      \* "none" | "node" | "stage": where the press began
  drag,         \* dragging: [on, gen of the held node object, capGen = gen of
                \* the element holding pointer capture, moved]
  pan,          \* panning: [on, startCam, startPtr]
  sel,          \* N is selected
  fitDue,       \* fitGraphAfterDrop: the layout changed while N was dragged
  \* --- ghosts ---
  dropped,      \* where the user last moved N to, while that should hold
  unfitted      \* the home view shows a layout changed mid-drag that no fit
                \* or pan has settled

vars == <<view, layout, gen, w, pinned, cam, cache, ptr, pressed, drag, pan, sel,
          fitDue, dropped, unfitted>>

NoCache == [w |-> None, pinned |-> FALSE, cam |-> 0, layout |-> 0, unfitted |-> FALSE]
Screen(x) == Wrap(x + cam)
World(p) == Wrap(p + L - cam)
Over == view = "home" /\ Screen(w) = ptr        \* the pointer is over N's element

Init ==
  /\ view = "home" /\ layout = 1 /\ gen = 1
  /\ w = Canon(1) /\ pinned = FALSE /\ cam = 0 /\ cache = NoCache
  /\ ptr \in 0..(L - 1) /\ pressed = "none"
  /\ drag = NoDrag /\ pan = [on |-> FALSE, startCam |-> 0, startPtr |-> 0]
  /\ sel = FALSE /\ fitDue = FALSE
  /\ dropped = None /\ unfitted = FALSE

-----------------------------------------------------------------------------
(* The pointer.                                                           *)

\* pointerdown on N's element starts a drag and captures the pointer on it
\* (the node's onpointerdown in renderGraph); on the stage background it
\* starts a pan (the stage's pointerdown handler).
Press ==
  /\ pressed = "none"
  /\ IF Over
     THEN /\ pressed' = "node"
          /\ drag' = [on |-> TRUE, gen |-> gen, capGen |-> gen, moved |-> FALSE]
          /\ UNCHANGED pan
     ELSE /\ pressed' = "stage"
          /\ pan' = [on |-> TRUE, startCam |-> cam, startPtr |-> ptr]
          /\ UNCHANGED drag
  /\ UNCHANGED <<view, layout, gen, w, pinned, cam, cache, ptr, sel, fitDue, dropped, unfitted>>

\* A pointer event goes to the element holding capture while it is still in
\* the document; otherwise to the element under the pointer.
NodeGetsEvent == drag.capGen = gen \/ Over

\* pointermove. On N's element it moves the node object the drag holds
\* (the node's onpointermove); that is N's drawn object only if no render
\* replaced it. On the stage it pans (the stage's pointermove handler).
Move(p) ==
  /\ pressed # "none" /\ p # ptr
  /\ ptr' = p
  /\ IF pressed = "node"
     THEN LET target == drag.capGen = gen \/ (view = "home" /\ Screen(w) = p) IN
          IF target /\ drag.on
          THEN /\ drag' = [drag EXCEPT !.moved = TRUE]
               /\ IF drag.gen = gen /\ view = "home"
                  THEN w' = World(p) /\ pinned' = TRUE
                  ELSE UNCHANGED <<w, pinned>>
               /\ UNCHANGED cam
          ELSE UNCHANGED <<drag, w, pinned, cam>>
     ELSE /\ cam' = Wrap(pan.startCam + p + L - pan.startPtr)
          /\ UNCHANGED <<drag, w, pinned>>
  \* The user means N to go where the pointer is, whichever element hears it.
  /\ dropped' = IF pressed = "node" /\ drag.on /\ view = "home" THEN World(p) ELSE dropped
  \* A pan puts the camera where the user wants it.
  /\ unfitted' = IF pressed = "stage" /\ view = "home" THEN FALSE ELSE unfitted
  /\ UNCHANGED <<view, layout, gen, cache, pressed, pan, sel, fitDue>>

\* pointerup and the click that follows it. On N's element, a moved drag
\* suppresses the click (the node's onpointerup and onclick); otherwise the click
\* selects N. Released elsewhere, N's handlers do not run and the drag
\* object is left behind. On the stage, the pan ends (the stage's pointerup).
Release ==
  /\ pressed # "none"
  /\ pressed' = "none"
  /\ IF pressed = "node"
     THEN IF NodeGetsEvent
          THEN /\ drag' = NoDrag
               /\ sel' = IF drag.moved THEN sel ELSE TRUE
          ELSE UNCHANGED <<drag, sel>>
     ELSE UNCHANGED <<drag, sel>>
  \* The drag ends on N's element; a fit due from a mid-drag layout change
  \* runs now (fitAfterDrop), and N stays where it was dropped.
  /\ LET fits == FitLayoutAfterDrop /\ fitDue /\ pressed = "node" /\ NodeGetsEvent IN
     /\ cam' = IF fits THEN Fit(w) ELSE cam
     /\ fitDue' = IF fits THEN FALSE ELSE fitDue
     /\ unfitted' = IF fits THEN FALSE ELSE unfitted
  /\ pan' = [pan EXCEPT !.on = FALSE]
  /\ UNCHANGED <<view, layout, gen, w, pinned, cache, ptr, dropped>>

-----------------------------------------------------------------------------
(* Renders.                                                               *)

\* With the candidate fix, a render re-binds the drag to N's new object and
\* element, and keeps N under the pointer even when the layout changed.
Rebind(g) ==
  IF KeepDragAcrossRender /\ drag.on /\ pressed = "node"
  THEN [drag EXCEPT !.gen = g, !.capGen = g] ELSE drag
Dragging == KeepDragAcrossRender /\ drag.on /\ pressed = "node" /\ drag.moved

\* renderThread() with the same layout (renderGraph): N keeps a pinned
\* position; the camera stays.
RenderSame ==
  /\ gen < MaxGen /\ view = "home"
  /\ gen' = gen + 1
  /\ w' = IF pinned THEN w ELSE Canon(layout)
  /\ drag' = Rebind(gen + 1)
  /\ UNCHANGED <<view, layout, pinned, cam, cache, ptr, pressed, pan, sel, fitDue, dropped,
                 unfitted>>

\* The accepted layout changes (a newer current revision in the same view):
\* positions reset to the layout and the camera refits. A node still being
\* dragged stays with the pointer under the candidate fix.
RenderLayout ==
  /\ gen < MaxGen /\ view = "home"
  /\ gen' = gen + 1
  /\ layout' = 3 - layout
  /\ w' = IF Dragging THEN w ELSE Canon(3 - layout)
  /\ pinned' = Dragging
  /\ cam' = IF Dragging THEN cam ELSE Fit(Canon(3 - layout))
  /\ fitDue' = Dragging
  /\ unfitted' = Dragging
  /\ drag' = Rebind(gen + 1)
  \* A node still being dragged keeps where the user is taking it.
  /\ dropped' = IF Dragging THEN dropped ELSE None
  /\ UNCHANGED <<view, cache, ptr, pressed, pan, sel>>

\* Another view is entered: the home view is cached (saveGraphView)
\* and the other view is fitted. A drag cannot follow a node that is gone.
Leave ==
  /\ gen < MaxGen /\ view = "home"
  /\ view' = "away"
  /\ gen' = gen + 1
  \* A fit due from a mid-drag layout change runs before the view is cached.
  /\ LET fits == FitBeforeLeaving /\ fitDue IN
     cache' = [w |-> w, pinned |-> pinned, cam |-> IF fits THEN Fit(w) ELSE cam,
               layout |-> layout, unfitted |-> unfitted /\ ~fits]
  /\ cam' = 0
  /\ drag' = IF KeepDragAcrossRender THEN NoDrag ELSE drag
  /\ fitDue' = FALSE
  /\ UNCHANGED <<layout, w, pinned, ptr, pressed, pan, sel, dropped, unfitted>>

\* Returning restores N and the camera from the cache when the layout
\* signature matches (graphViewCache in renderGraph), else starts from the
\* layout.
Return ==
  /\ gen < MaxGen /\ view = "away" /\ pressed = "none"
  /\ view' = "home"
  /\ gen' = gen + 1
  /\ LET hit == cache # NoCache /\ cache.layout = layout IN
     /\ w' = IF hit /\ cache.pinned THEN cache.w ELSE Canon(layout)
     /\ pinned' = hit /\ cache.pinned
     /\ cam' = IF hit THEN cache.cam ELSE Fit(Canon(layout))
     /\ unfitted' = (hit /\ cache.unfitted)
  /\ UNCHANGED <<layout, cache, ptr, pressed, drag, pan, sel, fitDue, dropped>>

-----------------------------------------------------------------------------
Next ==
  \/ Press \/ Release
  \/ \E p \in 0..(L - 1) : Move(p)
  \/ RenderSame \/ RenderLayout \/ Leave \/ Return

Spec == Init /\ [][Next]_vars

Act(s) ==
  LET n == s[1] IN
  CASE n = "Press" -> Press
    [] n = "Move" -> Move(s[2])
    [] n = "Release" -> Release
    [] n = "RenderSame" -> RenderSame
    [] n = "RenderLayout" -> RenderLayout
    [] n = "Leave" -> Leave
    [] n = "Return" -> Return

-----------------------------------------------------------------------------
(* Safety.                                                                *)

TypeOK ==
  /\ w \in 0..(L - 1) /\ cam \in 0..(L - 1) /\ ptr \in 0..(L - 1)
  /\ pressed \in {"none", "node", "stage"}

\* "Nodes are movable" (PRD 6.1): while a drag moves N, N is under the
\* pointer.
DragFollowsPointer ==
  pressed = "node" /\ drag.on /\ drag.moved /\ view = "home" => Screen(w) = ptr

\* A node the user moved stays where they left it across renders of the
\* same layout and across leaving the view and returning.
DropStays ==
  dropped # None /\ view = "home" /\ pressed = "none" => w = dropped

\* "panning, zooming, and inspector changes affect only the camera"
\* (docs/architecture.md): in the home view, the camera moves only when the
\* user pans or when a new layout is fitted. A property of steps, so it
\* fails if any render moves the camera.
CameraMovesOnlyByPanOrFit ==
  [][view = "home" /\ view' = "home" /\ cam' # cam =>
       pressed = "stage" \/ layout' # layout \/ (fitDue /\ ~fitDue')]_vars

\* A layout that changed mid-drag is fitted once the node is dropped, so its
\* nodes come into view.
DropFitsNewLayout == pressed = "none" /\ view = "home" => ~unfitted

=============================================================================
