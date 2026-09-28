# Attached navigation qualification ledger

Status: **implemented, default off, awaiting draft-PR review and human/product gates**. Full production-source check/build and independent reviews passed. Three live root attempts were accepted; the third used actual Desktop temporal flags and a supported complete trace export. Fresh canonical readback and production-renderer capture passed. Native keyboard/account and human acceptance remain unclaimed.

Current proof is separated into [compatibility replay](compatibility-replay-2026-09-28/README.md), [actual Desktop root generation and capture](desktop-root-live-2026-09-28/README.md), and [deterministic desktop qualification](current-heavy-2026-09-28/README.md). Historical failures and their exact sources remain in the dated directories. The rich-detail/no-replacement policy below remains undecided.

## Required plan and changed seams

PRD 7.2B and ADR 0011 define the approved slice. The compiled-rich-detail/no-replacement case below remains a product decision.

| Checkpoint | Changed production seams | Smallest deterministic observations |
| --- | --- | --- |
| AN-001 | Frozen permission enforcement in GraphWriter and dedicated presentation HTTP route | Existing typed-permission authority fixtures; `typed_permissions_freeze_exact_combined_authority_and_reject_false_provenance`; `presentation_route_stages_only_authorized_full_replacement_until_acceptance` |
| AN-002 | CompletionPlan detached closure traversal, accepted-current Return, atomic publish, pending-action isolation | `attached_navigation_advance_is_inert_and_terminal_cycles_are_atomic`; `attached_navigation_reference_targets_keep_reference_authoring_restrictions` (including response-root backlinks on direct Return and after Advance, with non-root mixed-arrival restrictions intact); `attached_navigation_without_replacement_preserves_plain_detail_and_reference_cycle` |
| AN-003 | Presentation read/stage/revision and asset storage; compiled binding schema/client; renderer resolver | `attached_navigation_concurrent_replacements_preserve_controls_and_reopen_occurrences` observes stale repair, concurrent controls, parsed mounts, nonempty asset reopen, forced transaction rollback, consumed accepted staging and terminal-stop cleanup; HTTP staging fixture; graph-client detail compilation and compiled Eval runtime |
| AN-004 | Affected-closure search publication and export refusal | `attached_navigation_publication_matches_rebuild_without_widening_thread_scope` uses real Ladybug and reopen; add-only original/reused/mutating closure marker assertions; `portable_export_rejects_persistent_mutation_closures` exercises the guard shared by export and share |
| AN-005 | Trusted runtime feature projection and Product canonical owner/invocation grouping | `interaction_graph_projects_layer_owners_and_invocation_with_scope_and_read_failures` observes canonical owner distinct from presenter, grouped layers/nodes, invocation provenance, scope denial, mismatched layer identity, metadata/context failures, default-off |
| AN-006 | B3 disclosure/card rendering, CSS, accessible relationships, Product selection/history controller | `interaction-graph.test.mjs`, `interaction-graph-workspace.test.mjs`, and B3 scenarios in `workspace-navigation-integration.test.mjs`; actual gated/default Electron first-message journey |

Secondary seams include optional source-layer compiled capability bindings, Codex authoring guidance, Eval fixture validation, and the first-message runner's gated selector expectations. Packaged renderer and Rust module inventories and the immutable share-viewer resource list must include the new modules; the public viewer must load with B3 absent/default-off. `desktop-telemetry-module-inventory.test.mjs`, `public-share-viewer-artifact.test.mjs`, and the real ProductWorkspace boot in `public-share-viewer.test.mjs` observe those boundaries. The declared `evidence:public-share-viewer` runner checks nested navigation, turn selection, reload, mobile pan and loopback-only requests. Existing input/invoke source-layer requirements remain intact. No test has been deleted or retired. The snapshot/reopen test protects persistence and concurrency; the separate Advance/cycle fixture protects terminal acceptance; the route test protects the wire boundary.

Required handoff checks: `npm run check`, `npm run build`, gated and default-off first-message desktop runs, interaction-context lifecycle, project restart, and `npm run test:eval-compiled-runtime`. Desktop proof is run sequentially with full checks. Paid inference is excluded from these commands.

## Observed development results

Focused attached-navigation scenarios, the presentation route, Product projection, real Ladybug publication/reopen, and 101 renderer/compiler checks passed during development. Gated/default Electron first-message, context lifecycle, project restart, and compiled Eval checks also passed on their development snapshots. Final candidate evidence is recorded separately; these earlier results are not certification of later edits.

Preserved failures and corrections:

- Initial mandatory-HTML behavior narrowed #517 incorrectly. It was removed; plain-detail additions without replacement remain supported.
- A fake HTML comment initially satisfied mount matching. Parsed actual-element validation replaced substring matching; duplicate and hidden/disabled mounts are rejected.
- Review found missing accepted-current closure checks, add-only portability markers, optional-provenance binding support, incorrect reference arrivals, incomplete B3 reads, and premature cross-chat selection. Each has a production-seam regression.
- Full check found an export fixture counting the new feature lookup as an asset fetch. An explicit feature route fixes its mock boundary; its count assertion is unchanged.
- Full check found Eval's required-source-layer assumption and a graph-client test literal widening. Both were corrected.
- A concurrent desktop/full-check attempt failed two existing environment command timing assertions (500 ms and 1 s). No timeout or assertion was relaxed. The rerun uses `RUST_TEST_THREADS=2` and desktop checks run separately.
- Native first-message input failed to acquire keyboard focus. Native automation then reported the Mac locked and unavailable. The runner's declared non-native-input mode passed with `nativeKeyboardVerified:false`; this is not native input or human approval proof. No OS security/session setting was changed.
- Screenshot inspection found a clipped B3 count badge; gated container overflow was corrected.
- The new B3 capture initially expected one visible root breadcrumb. Product intentionally hides root-only breadcrumbs; the runner now checks the actual root nodes and hidden breadcrumb, preserving the existing contract.

## Frozen review failure and corrective evidence

The first freeze used source digest `acaa854e63b74572b9370ae32fae664da953f418b20806eeedc71b0306e15002`.
Hash method: SHA-256 of UTF-8 `JSON.stringify({base,files})`, with sorted `files` entries containing `path` and file-byte `sha256`; the digest field is excluded. All 47 individual file hashes were independently checked by the parent reviewer. This source state is superseded, not certified.

Its full check failed: three JavaScript tests failed while 204 files / 2677 tests passed (one file / three tests skipped). The missing renderer module broke the immutable share artifact's import closure and the telemetry inventory; the onboarding assertion still expected the old callback signature. Correcting the renderer inventory exposed one further missing Rust API module inventory entry. All production resource mappings are corrected; no assertion was weakened or test deleted. The source-wiring assertion now follows the callback signature while actual controller and viewer tests retain behavioral coverage.

Parent Spec/Standards review also rejected: an attached reference to the fresh response root was misclassified as mixed arrival; cross-component duplicate mounts could pass acceptance and fail the renderer; accepted staging retained obsolete HTML/assets. Review also identified unnecessary reconstruction of unrelated published closures. Corrections preserve real non-root mixed-arrival/reference-authoring/cycle checks, count matching mounts across the package and enforce runtime host kinds, atomically consume staging with rollback repair and Stop/Fail cleanup, and select affected occurrences before closure reconstruction.

The response-root, duplicate-mount and staging-retention regressions each failed before their fixes. After correction, all four attached-navigation production scenarios passed (0.21 s), the real Ladybug publication/reopen test passed (1.00 s), and the five packaging/viewer/onboarding/navigation suites passed 117 tests. The declared public-viewer Electron capture passed on desktop and mobile with nested navigation, turn selection, reload, pan and no external requests; captures and source hashes are under `.relayer/evidence/attached-navigation/review-fixed-share-viewer/`. Desktop screenshot inspection confirms the public viewer retains its ordinary turn selector. This is deterministic local proof, not hosted or live inference proof.

The corrected 52-file freeze `1c5bf9f952bbb5834e60c898c9948a42612380ed832959f29fa7010b72b24572` passed parent Spec and Standards re-review with no new actionable findings. Spec reviewed source and focused logs; Standards reviewed source statically. These are non-certifying until pinned to the PR. Its full check passed all workspace/crash-support Rust stages, 207 JavaScript files / 2680 tests (one file / three tests skipped), two Codex secret-boundary tests, 43 Python tests and Ladybug receipt checks. The final PRD readability command failed on two sentences exceeding 25 words. Only those sentences were split without changing meaning; the focused readability command then passed. Full checks/build and impacted heavy reruns are required on the next frozen snapshot. Native keyboard and live model proof remain unclaimed. Review assertions remain non-certifying until pinned to the final source and PR.

## Open product decision and live boundary

A new action without replacement on compiled rich detail may have no usable trigger. Existing renderer fallback would discard the rich presentation. Provisional qualification fails closed when retained HTML cannot bind all actions; this is not an accepted product decision or a completed AN-003 proof for that case. Plain-detail additions remain supported through existing native controls. Explicit full replacement is independent of this choice.

The authorized live Codex Basic / GPT-5.6-Sol demonstration ran after frozen source review and isolation checks passed. Its first two accepted completions used a new persistent profile; the old PR536 checkout, profile, and process were preserved. The failed post-check and corrective replay are tracked below. Native walkthrough remains unavailable while the Mac is locked. Do not substitute deterministic fixtures for live model receipts or human acceptance.

Independent reviews remain non-certifying until pinned to an exact PR snapshot with reviewed scope, verdict, and unresolved findings.

## Native provider isolation follow-up

The user authorized fixing the native blocker. PRD 1.4 records the existing credential boundary explicitly. Checkpoint SI-001 maps provider authentication and shell exclusion under overlapping runs to the real native `codex-secret-provider-process.test.ts` fixture. SI-002 maps preserved graph capability to that fixture and its existing parent/child scenario. SI-003 maps unchanged subscription overrides to the existing managed-access test in `codex-basic.test.ts`. The production seam is secret-backed `CodexBasicHarness.codexConfigOverrides`; no dependency, provider recursion, subscription configuration, or GraphComplete boundary changes.

The native regression replaces the single scenario with three concurrent independent scenarios and strengthens presence predicates. It preserves endpoint/authentication, exclusion, graph capability, and child assertions; no test is retired. The unit checks configuration selection while native scenarios observe actual shell behavior. Required follow-up proof is the original concurrent trigger after the fix, `npm run check`, `npm run build`, and fresh Spec/authority and Standards review. Those isolation checks and reviews passed before the two live calls. One final authorized root repair later used actual Desktop flags; the three-call budget is now exhausted.

## Live-discovered read and authoring boundaries

Two real Codex Basic / GPT-5.6-Sol interactions were accepted on their first attempts at source `63992a635b50ef6b2368e50ca4d0c283d13f862dec7df8e2542990fb72901447`. The post-check failed: a thread's cached source root omitted attached additions while direct root/child reads contained them. Fresh backend reopen reproduced this; it was not a timing-only read. This evidence is a failure of the pre-fix source, not a successful same-snapshot demo.

AN-003 now maps the Product cached-root refresh seam to `resolved_invoke_destination_is_readable_cross_thread_in_review_mode`: canonical attached-mutation lookup, fresh thread/state reads after reopen, failed lookup/output and mismatched identity, plus unchanged unrelated roots. The existing core replacement/reopen and plain-detail scenarios cover canonical affected-root membership, draft invisibility, both reused occurrences, gate-off history, and imported exclusion. The shared control-route test covers wrong/model tokens, invalid IDs and the 500-ID bound. The table-specific attached-navigation storage module owns this lookup. It is limited to requested native accepted root memberships; there is no graph-wide reconstruction.

AN-002 also maps reverse-order root-backlink authoring to `attached_navigation_reference_targets_keep_reference_authoring_restrictions`. The writer recognizes only the exact single canonical root Expand target. Ordinary source ownership/draft checks, non-root reference restrictions, mixed-arrival rejection and cycle checks remain. The same scenario verifies terminal acceptance with and without Advance. It does not authorize new writes to already-accepted own nodes after Advance.

Required new proof: focused Product/core/control tests, full check/build, affected Product/Electron lifecycle checks, independent Spec/authority and Standards review, and zero-inference navigation/reopen replay of the preserved accepted model artifacts. Generation source and replay source must be reported separately. The initial failed post-check closed the recorder before normal export; completed sanitized harness spools were recovered byte-for-byte and validated. The original in-memory graph-operation recorder is unavailable and must not be reconstructed or claimed complete.


## Final live evidence and test-harness correction

Production source `96530c5d31b0ca26d146a3ce7313246f4e57b5e8bee9384e3c99cc2a787f53f4` passed full check/build and parent Spec/Standards review. Gated/default first-message and context lifecycle passed again. The third live root preserved all prior controls and semantics while adding a fourth Reference, with supported trace export, fresh thread/direct/reused-node reads, B3 three-card/two-edge capture, Back and reopen. No inference ran during visual replay. The generated invoke label wraps awkwardly; screenshots retain that presentation for human review.

The live driver incorrectly expected a recursive-child execution receipt for a root-only call. Production and the declared recursive-live runner scope those rows to invoked children. Zero rows is expected here; the incorrect failed assertion is retained. Durable accepted attempts, actual runtime/configuration identities, supported trace and canonical graph reads establish the third root result. This is not recursive-child proof.

The final project-restart heavy initially timed out. A production-seam diagnostic established a test-harness hazard: composer IPC remained bound to the old settings store after restart while the test seeded and flushed through a new independent queue. This does not retrospectively prove the original timeout's cause. The runner now drains/rebinds the store and acknowledges renderer writes before destroying the old renderer and seeding the folder draft. The real restart and all persistence assertions are retained, with no sleeps, timeout increases, assertion relaxation or deleted tests. The repaired scenario passed its inner restart and layer-selection markers. Final full checks/build and independent addendum review cover this test-only delta separately from the prior production proof.
