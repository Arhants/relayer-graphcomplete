# Issue 517 Slice 1 verification ledger

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
- Paid inference, signed binaries, and release proof are outside this context.

## Actual results

The exact changed source is recorded in [source-snapshot.json](source-snapshot.json).
The manifest includes the base commit, every changed non-evidence file hash, and
an aggregate digest. Evidence-directory edits do not alter that source identity.

- `npm run build`: passed on the final production source with pinned Node 22.23.2.
- `npm run check`: passed. Vitest: 203 files passed, 2,619 tests passed,
  3 skipped; separate secret-boundary suite: 2 passed. Rust workspace and crash
  reconciliation, Python, receipt lint, and PRD readability also passed.
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
  background-throttled behavior is not claimed. No paid inference ran.

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
and final verification outcomes for the refreshed source snapshot.

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
