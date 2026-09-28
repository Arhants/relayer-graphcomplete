# Issue 517 Slice 1 verification ledger

This is the typed-permission and invoke-transition slice of #517. Persistent
attached-node mutation, general detail replacement, B3, migration, and portability
are not claimed. The graph qualification flag defaults off.

## Required plan and changed seams

| Checkpoint | Changed production seam | Smallest deterministic observation |
| --- | --- | --- |
| IP-001 | trusted preparation, combined invocation/context, immutable description, terminal authorization | `typed_permissions_freeze_exact_combined_authority_and_keep_mutation_dark` |
| IP-002 | atomic Return, conversion receipt, node-owned cycles, storage rollback, replay/reopen | `typed_leased_completion_atomically_resolves_invoke_once_and_survives_reopen`, `typed_leased_completion_storage_failure_rolls_back_closure_and_resolution`, `typed_invoke_rejects_expand_cycle_atomically_and_stop_revokes_authority`, `typed_invoke_snapshots_same_completion_occurrences_and_rejects_reused_cycle` |
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
- `npm run check`: passed. Vitest: 190 files passed, 2,483 tests passed,
  3 skipped; separate secret-boundary suite: 2 passed. Rust workspace and crash
  reconciliation, Python, receipt lint, and PRD readability also passed.
- The seven focused typed core cases passed, including rollback, frozen authority,
  temporal/child isolation, same-completion occurrences, and atomic cycle rejection.
- The real Ladybug publication/reopen fixture passed. It compares canonical and
  physical inventories and checks source/result thread entitlements.
- Gated Electron journey: [machine result](gated-result.json), passed. It requires
  the compiled control, holds the same DOM button through acceptance, navigates in
  Product and read-only Eval, restarts both services, selects the distinct second
  occurrence, and checks that navigation creates no new interaction.
- Default-off Electron journey: [machine result](default-off-result.json), passed.
  It verifies the legacy retained-invoke representation and navigation.
- Both Electron runs used `RELAYER_INVOKE_EVIDENCE_SKIP_NATIVE_KEYBOARD=1` and clicked
  production Send. Native keyboard/focus proof is excluded, explicitly recorded as
  `nativeKeyboardVerified: false`. No paid inference ran.

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

## Review and remaining dependencies

Adversarial authority and renderer reviews found no unresolved static findings.
The PR records their exact scoped digests. Reviews are not test execution evidence.
No test was deleted or subsumed. Slice 2 remains required for portable snapshots,
identity remapping, legacy migration, and inert imported provenance. Persistent
attached-node editing and B3 remain off and outside this proof.

