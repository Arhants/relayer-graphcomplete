# Issue 517 Slice 1 verification ledger

## Current integration status

The user approved the live gate at `dd7e5a18`: "okay i've verified myself that it works good job".
That acceptance applies to the pre-integration source; it is not fresh live proof
of this merge. Integration with main `17b50d95` is recorded separately in
[integration-verification.json](integration-verification.json) and
[integration-source-snapshot.json](integration-source-snapshot.json).
The sections below retain historical evidence and failures. Their source manifest
and migration filenames describe their original snapshots, not the integrated head.
No additional paid inference is authorized or performed for merge readiness.

This is the typed-permission and invoke-transition slice of #517. Persistent
attached-node mutation, general detail replacement, B3, migration, and portability
are not claimed. The graph qualification flag defaults off.

## Required plan and changed seams

| Checkpoint | Changed production seam | Smallest deterministic observation |
| --- | --- | --- |
| IP-001 | trusted preparation, combined invocation/context, immutable description, terminal authorization | `typed_permissions_freeze_exact_combined_authority_and_keep_mutation_dark`, `typed_imported_invoke_cannot_gain_authority_through_writable_occurrence` |
| IP-002 | atomic Return, conversion receipt, node-owned cycles, storage rollback, replay/reopen | `typed_leased_completion_atomically_resolves_invoke_once_and_survives_reopen`, `typed_leased_completion_storage_failure_rolls_back_closure_and_resolution`, `typed_invoke_rejects_expand_cycle_atomically_and_stop_revokes_authority`, `typed_invoke_snapshots_same_completion_occurrences_and_rejects_reused_cycle`, `typed_conversion_updates_legacy_occurrences_atomically` |
| IP-003 | compiled binding compatibility, mounted button refresh, workspace dispatch, destination API | `test/node-detail-runtime.test.mjs`, `test/workspace-actions.test.mjs`, deterministic desktop first-message |
| IP-004 | default-off preparation, persistent-node writer denial, export boundary | original `leased_completion_*` fixtures, combined-authority fixture, export suite |
| IP-005 | per-publication index entitlements and source closure refresh | search portfolio and typed index fixture |

The migration adds only new empty permission/receipt tables and a default-off
qualification setting. Historical records are not backfilled. Frozen descriptions
and conversion receipts survive local database reopen. Portable export of converted
actions fails explicitly instead of producing a partially functional imported detail.

No tests were retired. The paired legacy/typed lease cases protect different
representations; the storage failure case protects rollback after graph publication,
while the cycle case protects semantic rejection before acknowledgement.

## Required assembled evidence

- `npm run check` is the deterministic fallback for mixed graph, index, runtime,
  product API, and renderer changes; no narrower portfolio is claimed.
- `npm run build` is required before commit.
- After build, run `electron scripts/test-desktop-first-message.mjs` with
  `RELAYER_INVOKE_EVIDENCE_DIR` for default-off evidence and with
  `RELAYER_TEST_INTERACTION_PERMISSIONS=1` for gated evidence.
- Scoped live inference is explicitly authorized for the final gate described below.
  Signed binaries and release proof are outside this context.

## Historical pre-integration results

The pre-integration changed source is recorded in [source-snapshot.json](source-snapshot.json).
The manifest includes the base commit, every changed non-evidence file hash, and
an aggregate digest. Evidence-directory edits do not alter that source identity.

- `npm run build`: passed on the pre-integration production source with pinned Node 22.23.2.
- Pre-integration `npm run check` retry: main Vitest 203 files and 2,629 tests passed,
  3 skipped; Rust workspace, crash reconciliation, and package checks passed.
  The outer command failed during final isolated secret-boundary cleanup
  (`ENOTEMPTY`). An unchanged focused retry passed both secret-boundary tests.
  The first full attempt instead timed out in an unchanged managed-runtime
  cancellation test, which passed on its focused retry. Both failures are retained
  in [live-verification.json](live-verification.json); no outer full-pass claim is made.
  The remaining chain ran separately: Python 43 tests, receipt lint, and PRD
  readability all passed.
- The nine focused typed core cases passed, including rollback, frozen authority,
  temporal/child isolation, same-completion occurrences, and atomic cycle rejection.
- The real Ladybug publication/reopen fixture passed. It compares canonical and
  physical inventories and checks source/result thread entitlements. Its source now
  starts with the gate off and an omitted second-occurrence action.
- Gated Electron journey: [machine result](gated-result.json), passed. It requires
  the compiled control, holds the same DOM button through acceptance, navigates in
  Product and read-only Eval, restarts both services, selects the distinct second
  occurrence, and checks that navigation creates no new interaction.
- Default-off Electron journey: [machine result](default-off-result.json), passed.
  It verifies the legacy retained-invoke representation and navigation.
- Both Electron runs used `RELAYER_INVOKE_EVIDENCE_SKIP_NATIVE_KEYBOARD=1` and clicked
  production Send. Native keyboard/focus proof is excluded from those automated runs, explicitly recorded as
  `nativeKeyboardVerified: false`. Test windows disable background throttling;
  background-throttled behavior is not claimed. No paid inference ran in these automated journeys.

The existing broad runner required setup repairs for current IPC/provider contracts,
visible-navigation waits, and Electron's all-windows-closed lifecycle. Earlier runs
failed those boundaries. The assembled test also found a real missing invoke in a
same-completion second occurrence; the gated publication fix and named regression
above repair it. The earlier 760px camera assertion failed in both modes because it
compared screen coordinates while the stage moved by 110 pixels. The final runner
compares camera coordinates relative to the stage, retaining stage-width and
canonical-layout checks. The final results contain no ancillary failures.

## Visual evidence

- [Unresolved compiled control](gated/01-unresolved.png)
- [Running disabled control](gated/02-running-disabled.png)
- [Same control after conversion](gated/03-resolved.png)
- [Read-only Eval destination](gated/06-eval-cross-interaction-destination.png)
- [Reopened second occurrence](gated/07-reopened-second-occurrence.png)
- [Reopened navigation destination](gated/08-reopened-destination.png)

[Review-fix run summary](review-fixes-verification.json) records the red observations
and verification outcomes for the prior review-fix snapshot at `57b3afaa`.
Current live-gate verification is in [live-verification.json](live-verification.json).

## PR 536 review fixes

Review of the first head found two real gaps. A writable presentation could lease
an imported action, and conversion could miss a legacy occurrence without an action
membership. Permanent regressions reproduced both failures before the fixes. The first full
check also caught an error-classification regression in the new guard. Keeping
existing source validation before provenance validation repaired it. A desktop
run stalled after acceptance and was terminated; the final runs disable background
throttling and passed. Source-turn selection now awaits the production selection
function before capture; visual inspection confirmed the stable source header.

The provenance check now inspects the action, source node, and their owners during
preparation and authority use. Acceptance rechecks it, so a previously persisted
unsafe lease cannot mutate imported history after reopen. Conversion atomically adds
only the exact converted identity to accepted, native occurrences within its scope.
It preserves existing ordering, source provenance, and compiled binding identity.
The legacy fixture checks cycle rejection, injected storage rollback, successful
conversion, idempotent replay, and durable membership after reopen.

Search refresh now selects affected currents by reverse traversal from the exact
action membership before reconstructing closures. The traversal follows accepted
navigate edges, matching canonical publication. This avoids reconstructing unrelated
history; history-size performance remains unmeasured, and no scale proof is claimed.

## Review and remaining dependencies

Adversarial authority and renderer reviews found no unresolved static findings.
The PR records their exact scoped digests. Reviews are not test execution evidence.
No test was deleted or subsumed. Slice 2 remains required for portable snapshots,
identity remapping, legacy migration, and inert imported provenance. Persistent
attached-node editing and B3 remain off and outside this proof.


## Second review pass: recovery, immutability, and projection

Changed executable seams and checkpoint mapping:

| Checkpoint | Changed seam | Smallest permanent regression |
| --- | --- | --- |
| IP-001 | SQLite migration 0022 prevents permission DELETE downgrades | `typed_permission_storage_is_immutable_and_unknown_versions_fail_closed`; historical unsafe-lease fixture explicitly removes/restores the guard |
| IP-002 | cycle traversal follows accepted actions after exact-plan publication, excluding discarded sibling drafts | `typed_permissions_temporal_return_and_semantic_child_have_distinct_authority`; genuine cycle/rollback tests remain |
| IP-002/003 | prepared-child retry accepts an exact converted receipt only with its existing non-reserved durable execution | `broker_exact_retries_launch_once_after_the_durable_fence` |
| IP-004 | real export checks typed receipts before legacy invocation shape | `conversation_export_uses_real_accepted_graph_and_rejects_read_only_authority` |
| IP-003/004 | Product selects missing cached memberships using a graph-owned receipt lookup, up to 500 requested IDs per batch | `resolved_invoke_destination_is_readable_cross_thread_in_review_mode`; `unrelated_offline_and_imported_outputs_keep_cached_freshness` |
| IP-001/003 | receipt lookup is control-only and bounded; gate-off reopen retains conversion identity | `resolved_invoke_roots_require_control_and_bounded_valid_ids`; paired typed/legacy atomic lease fixture |
| IP-003 | retained human launcher seeds two legacy occurrences then reopens with typed preparation enabled | `scripts/run-interaction-permissions-human-gate.mjs`, local desktop qualification and human gate |

Product caches only the root layer in `completion_output`; descendant layers are read
canonically when navigated. Therefore the batch selector checks the accepted root's
membership. A successful lookup does not fetch unrelated legacy outputs. Imported
threads are excluded from new lookup eligibility, and an unconfigured runtime keeps
prior offline behavior. A configured runtime whose lookup fails cannot establish
freshness: all requested native accepted outputs are explicitly marked stale.
This availability tradeoff is covered separately from selected-output failure and
wrong-root rejection. No new persisted cache or invalidation architecture is added.

The permission guard is a new migration so existing databases upgrade. Native
permission-bearing interactions have no deletion workflow; imported canonical cleanup
has no permission rows and remains covered by the import suites. No test was deleted.

The human launcher retains its explicit data directory, releases fixture invocations
normally, registers no input blocker, and leaves production keyboard handling intact.
Closing it stops its services without deleting data; the same command reopens it.
Human acceptance is pending, regardless of automated evidence.

The separate retained launcher was qualified with native CUA typing and Shift+Enter,
original and repaired-occurrence navigation, and service reopen. See
[qualification](human-launcher-qualification.json) and the [human walkthrough](HUMAN-GATE.md).

## Integration with main

The PR integrates main at `ac7657e1`. The glossary conflict preserves both
interaction-permission and immutable shared-snapshot terms. Automerged renderer
theme/share changes are included in the final source manifest and desktop runs.
Adversarial integration review found the new share-export path needed the same
early Slice 2 refusal as ordinary export. The real graph-backed export test now
checks both GET export and POST share-export; its share assertion first reproduced
the generic invocation-shape error, then passed with the shared early guard.
No network publication or public viewer change is claimed by this refusal fix.

## Final review: receipt integrity and visited descendants

Migration 0023 blocks UPDATE and DELETE of exact invoke-conversion receipts. The
existing `typed_leased_completion_atomically_resolves_invoke_once_and_survives_reopen`
fixture attempts both operations after real
acceptance, then verifies durable identity and replay after reopen. The UPDATE
assertion failed before the guard and passed afterward. This maps to IP-002
replay/provenance continuity, IP-003 compiled identity, and IP-004 export refusal.

The root receipt selector remains root-only because completion output contains only
the root layer. Descendant layers are read through their canonical layer endpoint.
The final review separately identified an in-memory cache gap for previously visited
legacy descendants whose old membership omitted the converted action. The renderer
revalidates the selected descendant on navigation/history entry and existing state
refresh, including without local invocation records. It reads only the visible or
requested layer, adds no polling, and leaves unrelated history untouched. This maps
to IP-003 occurrence continuity. The controller regression
`revalidates an omitted legacy descendant action on %s without invocation metadata`
covers refresh, navigation, and history separately. The tradeoff is one canonical layer read per such
entry or refresh. The required full checks and both desktop modes apply again.

The first final desktop run failed with Electron `UnknownVizError` during capture
after the source/revisit screenshots. One unchanged retry passed, followed by the
default-off run. This capture failure is retained in the verification JSON. Native
CUA then repeated typing, Shift+Enter without Send, and reopened descendant-button
navigation to Turn 2 of 2 on the final repaired source.

Visual inspection caught an earlier reopened screenshot without its inspector, even
though the hidden compiled control satisfied the old wait. Its precise cause was
not established. The runner now requires a selected node, visible inspector, and
visible enabled control. The image at the earlier review-fix snapshot was inspected and showed all three.
The current live-display rerun image 07 shows the nested layer without its inspector
despite the DOM wait passing. That image is non-certifying for control visibility;
its limitation is preserved in live-verification.json. Review
also removed a redundant temporal read; focused tests cover single-read temporal
reconciliation and a newer selection during an ordinary pending descendant read.
The prior full check passed its main portfolio but failed isolated secret-boundary
temporary-directory cleanup with `ENOTEMPTY`; that failure is retained separately.

## Live-model final gate

The user rejected the visually repetitive fixture as the final gate and explicitly
authorized scoped real-model validation. The retained fixture remains historical
evidence; it is not the current acceptance scenario. See [LIVE-GATE.md](LIVE-GATE.md).
The production Desktop entry point now forwards the trusted qualification option
only for development launches with `RELAYER_TEST_INTERACTION_PERMISSIONS=1`.
Packaged/default launches remain off. This maps to IP-001 frozen preparation and
IP-004 default-off behavior. The existing runtime suite observes actual spawn
arguments for omitted, string, and boolean options; only boolean true enables it.
No provider execution, authentication, catalog, readiness, or IPC is mocked in
the live gate. Production setup discovers the real Codex subscription and model.
Conversation/graph data and managed binaries are isolated; existing native login
is used through the supported `RELAYER_CODEX_HOME` path without copying secrets.

The live run exposed an automatic result-display bug hidden by repetitive fixture
content. The selected turn ID represented pending intent while its visible source
layer belonged to the prior hydrated interaction. `refreshState` now uses the
hydrated owner. `shows the invoked result distinct root` exercises the real
controller across normal, recovered, already-accepted, and deliberate Back paths.
This maps to IP-003 destination presentation without inventing a new graph action.
The initial live failure remains recorded in [LIVE-GATE.md](LIVE-GATE.md).

## Integration with main 17b50d95

The text conflicts preserve both the permission and layer-selection imports, and
both complete Rust test blocks. The hydrated interaction remains the owner used
for invoke-result refresh; main's default/remembered selection runs within that
correct result layer. The four invoke controller cases now use authored default
node 27 and verify its selection; deliberate Back keeps source node 22. Their
prior null-selection assertions failed because main intentionally opens details.
No failure boundary was removed; this updates the expectation to NDT-003.

Main already owns migration 0021 for layer defaults. The unpublished permission,
DELETE guard, and receipt guard migrations are now 0024, 0025, and 0026 with
unchanged SQL bytes. Historical 0021/0022/0023 review scopes above remain historical.
The main-baseline upgrade test applies the real migration registry through 21,
reopens through GraphDatabase, preserves the stored default node, and verifies the
gate remains off with no historical permission or receipt backfill. It maps to
IP-001/IP-004 and NDT-001. Existing typed acceptance/reopen tests protect IP-002.

The retained pre-merge qualification databases used the unpublished old numbering.
They are untouched and must not be opened with the integrated migration registry.
Their original proof remains tied to dd7e5a18. Reopening those historical profiles
requires matching pre-merge source/runtime; no checksum override or implicit data
migration is provided. Fresh integrated deterministic profiles qualify the new
registry. Ordinary main databases upgrade through the tested production path.

Semantic auto-merge review also checks main's portable default-node transport
alongside Slice 1 export refusal, selected descendant revalidation alongside
remembered/closed detail state, and actual input/context/history behavior. The
required assembled portfolio adds main's three declared node-input,
interaction-context, and project-new-thread desktop runners to both invoke modes.
Build is shared once; each runner's inner result remains independently reported.

Current integration results: build passed; full check passed Rust/crash/package
checks and 2,670 Vitest cases but failed two graph-start timeouts and one undersized
provider frame. An unchanged focused run passed all 34 cases in those three files.
The remaining secret-boundary (2), Python (43), receipt lint, and readability checks
passed separately. This is composite checkpoint evidence, not an outer check pass.
Earlier compiler integration failures are retained in the machine record.

All five deterministic desktop journeys passed their inner results. Project reopen
confirmed both restartPersistence and layerSelectionRestartPersistence. The current
reopened invoke image visibly includes the selected compiled control. The node-detail
collapsed image shows an expanded sidebar and is not visual collapse proof, despite
passing DOM geometry checks. No claim extends beyond each observed boundary.
Independent standards/spec reviewers found no unresolved findings on source digest
`1eae477c40effc19cdeac99fd99f1beb6ca0bd236b1ffdae8b2a259a7f734b38`.
Their exact scopes and execution limits are in integration-verification.json.
