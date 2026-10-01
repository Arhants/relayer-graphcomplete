# Thread archive

The user-approved contract is PRD §3.5.1, ARC-001–ARC-003. Archive is manual,
reversible organization for both project and standalone chats. Active work
blocks it; explicit reopening restores it. Discovery and title search live only
in Settings. The graph, drafts, scope and conversation activity order remain
intact.

[Feature video](archive-demo.mp4) shows real accepted graphs created by an
inference-free deterministic harness, the production renderer's full `main.js`,
and authenticated Rust APIs. No user conversation or provider inference is
used. The capture additionally checks a real app-server process restart,
read-only write rejection, backend busy rejection, disabled Send, retained draft, selected node, breadcrumb,
camera position and zoom, scroll position and list order.
Its per-scenario results, source hashes and binary/video hashes are in
[manifest.json](manifest.json). Screenshots show the [rightmost sidebar trashcan](sidebar.png), [retained open
workspace](current-archived.png) and [Settings archive search](settings.png).
Human acceptance remains pending; this is deterministic feature evidence.

## Required plan and executable seam mapping

| Changed seam / promise | Deterministic observation | Heavy evidence |
| --- | --- | --- |
| Migration 0042, archive activity view and admission triggers; schema validation | `archive_authority_rejects_missing_or_weakened_objects_on_reopen`; existing migration/reopen tests now include 0042 | Real process reopen in capture |
| Archive/restore transaction; list exclusion and direct selected-state lookup | `archive_round_trip_preserves_thread_history_scope_and_activity_order` covers both scopes, a stored node-context draft, saved working directory/checkout, idempotence and disk reopen | Direct sidebar trashcan and thread menu; Settings search and restore |
| Busy versus archived admission race; earlier recursive work/native unwind | `archive_serializes_both_admission_orders_and_checks_earlier_work` exercises production writes in both serialized orders | Busy UI disabled and API conflict |
| HTTP write authority, read-only discovery, typed conflict and read/restore distinction | `thread_archive_http_authority_discovery_and_read_only_reopen` | Read-only write rejection; read leaves archive time intact |
| Accepted graph and export retention | Existing real-graph `conversation_export_uses_real_accepted_graph_and_rejects_read_only_authority` exports the same accepted graph records while archived, after its running fixture turn settles | Accepted graph remains displayed while archived |
| Sidebar trashcan and header menu; archived current-workspace projection; Send eligibility | `thread-archive.test.mjs` plus existing workspace/navigation portfolio | Full renderer capture verifies header action, retained workspace/draft/reading position, disabled Send and Undo |
| Explicit open, cross-thread references/history, startup versus preview reads | `workspace-navigation-integration.test.mjs` exercises archived invoke destinations and history; `thread-archive.test.mjs` checks preview and nonarchived read behavior | Settings Open runs production `loadThread` |
| Settings archive list/search, project labels, unarchive and activity order | `thread-archive.test.mjs` | Settings search, explicit open and preserved API ordering |
| Sealed telemetry module attribution | `desktop-telemetry-module-inventory.test.mjs` retains the exact packaged-module allowlist, adding only the new archive module | Existing telemetry evidence unchanged |
| Shared toast action/timer | Archive/Undo renderer journey | Undo via actual pointer input |
| Sidebar row wrapper and eighth Settings tab | Existing sidebar script adapted to the wrapped row and tab count | `npm run test:desktop:sidebar-overflow` at 1100, 761 and 375 pixels, expanded/collapsed; Settings and Eval |

Required local gates: `npm run check`, `npm run build`,
`npm run evidence:thread-archive`, and `npm run test:desktop:sidebar-overflow`.
No existing test is retired. The two storage scenarios protect distinct
retention and admission boundaries; the HTTP scenario adds routing/authority;
the renderer scenario adds user actions; real graph export adds graph retention.

## Actual runs and results

Final gate results and adversarial assertions are recorded in the PR for its
exact source head. The capture manifest certifies only its named source hashes,
binary and scenarios; it is not packaged/release or paid-inference proof.

Early failures were retained during development: the shared Cargo output held
an app-server library from another worktree (missing route and migration 0042).
Package-only cleanup rebuilt the current app-server; the compatible warm
Ladybug/dependency outputs remained. No cold native build or unverifiable
artifact restore was used. Initial capture against an app-server without a
runtime could not boot the permission picker; the final capture uses a real
GraphComplete runtime with a deterministic fixture harness.

The full suite also required existing export-menu stub and provider-demo API
fixtures to include the new controls and explicit startup thread read. The sealed
module inventory now includes the archive module. Annotation and social-preview
receipts were regenerated through their real capture runners.
