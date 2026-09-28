# Reading layout and pending-turn navigation — issue #567

## Product and verification plan

Issue #567 and PRD §7.0 define the approved behavior. The implementation preserves
accepted graph/details while Send or Invoke waits for its first accepted displayable
layer. Explicit browsing cancels automatic navigation and exposes Result ready.
Environment is hidden until requested. Wide layouts start at 50/50 and retain a
locally saved divider ratio; narrow layouts retain the existing stacked flow. The issue described that existing
flow incorrectly; the single-pane / Back to graph acceptance item remains unresolved.
No reset control, graph authority change, paid inference, or release is involved.

| Checkpoint / executable seam | Smallest deterministic coverage | Rendered / process coverage |
| --- | --- | --- |
| READ-001: pending Send/Invoke, accepted intermediate/final, browsing during asynchronous submission/hydration, failed/stopped, departure | workspace-reading-context; workspace-navigation integration/controls | node-input-actions retains real details while pending and explicitly opens Result ready |
| READ-002: ratio default, drag limits, document pointer release, delayed hydration, disposal, overlay dismissal | workspace-reading-layout | node-input-actions actual pointer drag, durable preference, reload, close/reopen and overlay geometry |
| Native preference IPC and Eval origin-independent settings; read-only authority | workspace-reading-layout; eval-web-host | desktop reload; Eval fixture/tab and authorization runner |
| Existing automatic node selection, history, input/context preservation | workspace navigation; node-detail-runtime; layer-selection and existing input tests | project-new-thread; interaction-context; node-input-actions |
| Desktop narrow header/overlay reachability and public host layout | environment-rail; public-share-viewer artifact tests | narrow-sidebar (59 scenarios); public viewer captures |
| New renderer module distribution and telemetry | public artifact closure and telemetry inventory tests | public viewer capture runner |

The versioned affected-module portfolio retains existing coverage and adds the
reading-context/layout, node-detail, Environment and public artifact checkpoints.
No test was deleted. Three immediate-running-turn expectations were revised to
assert retained reading context. The interaction lifecycle runner now waits for
the accepted turn's exact graph node IDs before inspecting historical context;
its cleanup, restart, failure and authority assertions remain intact.

## Evidence and limits

This directory contains real Electron screenshots from the deterministic
node-input-actions runner. Public viewer captures and their source manifest live
in `../issue-471-public-share-viewer/`. Screenshots are evidence of rendered states,
not human acceptance. Eval authority and persistence are tested; a dedicated human
Eval visual review remains separate from the desktop human gate.

Verification outcomes and reviewed source inventories are recorded alongside this
file. The aggregate `npm run check` is **not certified**: its final run failed in
unchanged Rust persistence code at
`opening_a_quarantined_thread_accepts_its_attempt_without_releasing_again`,
`product_persistence_flow.rs:9604`, observing two provider DELETE requests instead
of one before reopening. The isolated case passed. A possible reconciliation /
completion race was identified, but request attribution does not prove that
hypothesis. Neither the isolated pass nor the renderer checks erase that failure.

An earlier full renderer run overlapped a clean-dist build and had missing-module
errors. That run is invalid for source certification; the serial renderer run is
reported separately. Earlier real native drag evidence exposed a persistence bug
when pointer release left the moving divider; the document-release regression and
subsequent native proof cover the fix.

## Human gate

Run the built checkout with:

```sh
RELAYER_WORKSPACE_HUMAN_REVIEW=1 node_modules/.bin/electron scripts/test-desktop-node-input-actions.mjs
```

The runner performs its deterministic checks, then foregrounds an interactive
Relayer window and prints the exact local route. Try the divider, close/reopen
Node Details, toggle Environment, and resize the window. Pending and Result ready
states are captured here. Human approval is pending; do not infer it from tests,
screenshots, or this document. No merge or release is authorized by this evidence.

## Narrow-layout contract mismatch

Visual inspection and baseline review found that `a437a59b` already stacked graph
and details in narrow windows and scrolled details into view. There was no Back to
graph control. Issue #567 described a single-pane flow as existing; preserving the
baseline does not satisfy that item. The draft PR explicitly leaves this item open
for the human gate rather than claiming complete acceptance.
