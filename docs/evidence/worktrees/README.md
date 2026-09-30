# Worktree checkpoint and evidence plan

Product authority: PRD §3.2, §3.4, SCP-004–006 and SCP-022–026. The human approved
P1–P8 individually, W1–W2 individually, W3–W9 as a batch, and all C/M/L cases.
The final M3 choice keeps both intentional subfolder projects. Later corrections
supersede the original matrix: branches are automatic random hashes, creation
choices stay inside Checkout, and custom-location/branch-name UI is removed.
Production implementation and an open, verified PR are now authorized; merging
remains the human gate. The throwaway prototype is design input only.

## Changed executable seams and checkpoints

| Promise / changed seam | Smallest production checkpoint |
| --- | --- |
| Ordinary folder / No folder keep their semantics; Git discovery blocks Send, preserves draft and rejects stale replies | `worktree-controller.test.mjs` deferred/failure lifecycle; `worktree-renderer.test.mjs` renders real composer HTML through loading, ordinary folder, failed inspection and Git states |
| Registered roots, linked worktrees, subfolders, nested repositories and independent clones | `worktree-service.test.mjs` real temporary Git identity/inventory fixture; Rust `root_alias_grouping_keeps_cwd_graph_identity_clones_and_intentional_subfolders` |
| Dirty, detached and removal-locked entries remain selectable; missing/inaccessible/escaping subfolders do not fall back | Git lifecycle inventory and selection tests use real directories, permissions, symlinks and commits; renderer controller retains the prior choice after failure |
| Shared-use warning covers intentional subfolders in the same checkout and permits Send | Production `checkoutSharingThreads` checkpoint includes sibling subfolders, a separate linked checkout and a nested repository; renderer queries matching threads' current interactions |
| Changed branch/SHA requires acknowledgment, including the API admission boundary | Git service validation; controller acknowledgment and server-error normalization fixtures; Rust `expected_checkout_blocks_branch_and_commit_changes_before_thread_storage` and API `checkout_changed` response fixture |
| Base choices include committed Checkout HEAD, local branches and cached remote branches; unknown defaults require a choice | Real Git default/base/HEAD tests; controller refreshes Checkout base when switching trees; Electron driver verifies cached origin/main default and selected committed base |
| Creation choices live inside Checkout in the existing composer; no branch-name/location inputs; only Send mutates | Production renderer DOM test plus Electron `sendOnlyMutation` and screenshot `01-checkout-menu.png` |
| Durable ownership and recovery use one random branch/destination, reject occupied/mismatched receipts and retain partial success | Git service receipt/concurrent-create/reconcile fixtures, including foreign plan selection rejection; controller persists before mutation and recovers the same ID after lost replies/reopen |
| Failed persistence cannot authorize creation; edited prompt/model/permission intent renews thread ID, acknowledgment retains it | `composer-drafts.test.mjs` durable oversized/write failure; controller/`stableNewThreadRequest` checkpoints; no overlapping test was deleted |
| Exact saved cwd survives reopen; missing locations block provider execution while history remains readable | Rust `scope_persists_across_reopen_and_missing_checkout_never_falls_back`; Electron actual harness context, app-server reopen and missing-cwd follow-up checkpoints |
| Legacy bindings precede initial/later root grouping; intentional subfolder projects remain distinct; unresolved records and rollback preserve data | Rust migration `legacy_thread_scope_is_backfilled_before_project_grouping_and_reopen`, grouping fixture, and `consolidation_failure_rolls_back_every_alias_and_name` |
| Root grouping does not rewrite graph provenance or accepted visibility | Electron `rootConsolidationAcceptedLayerVisibility` seeds a legacy linked-root project, accepts through the production API/runtime, and compares the exact graph layer read before/after consolidation |
| Duplicate first Send and zero-effect startup retry cannot fork execution | Rust creation receipt fixture verifies same thread/root, changed payload rejection, safe restoration only without graph node/attempts, and single-winner preparing claim; controller retains the created worktree across retry |
| Thread Environment uses the saved checkout and rejects stale same-project thread responses and foreign-thread project authority | Rust Environment HTTP scope fixture; `environment-rail.test.mjs` thread cache/presentation checkpoints; Electron three Environment checkpoints |
| Shared workspace module dependencies remain in sealed public share artifacts; telemetry module inventory remains complete | `public-share-viewer-artifact.test.mjs` complete imported module closure; `desktop-telemetry-module-inventory.test.mjs` inventory contract |
| Existing recursive-child failure cleanup completes its separate durable recovery-marker boundary | `an_ambiguous_preparation_fails_the_claimed_child_in_both_stores` retains failed graph/product and clear-marker assertions, with the suite's existing bounded asynchronous wait |
| Authenticated transport retains recovery errors; migrations preserve schema integrity | Production Electron IPC/API path, existing app-server API authority suite, full deterministic check; updated partial-index rejection fixture includes current columns and still rejects partial unique indexes |

Project consolidation is display grouping through aliases. Original thread project
IDs and graph partitions remain intact; no cross-root graph sharing is introduced.
Removing a project or abandoning creation choices performs no worktree deletion.

## Required verification plan

- Warm loop: targeted `npx vitest run test/worktree-service.test.mjs test/worktree-controller.test.mjs`
  and the affected app-server Rust tests. Record individual scenario results.
- Before commit: `npm run check` and `npm run build`, as required by AGENTS.md.
- Existing scope desktop proof: `npm run test:desktop:project-new-thread` covers
  its documented draft/navigation behavior. It does not automatically certify
  new worktree controls or full Electron restart recovery. Production-rendered
  worktree interaction/screenshots and interrupted-create restart proof need an
  explicitly named driver before they can be claimed.
- CI: run every planner-selected chapter and require `check`; docs/evidence
  changes currently select the conservative full portfolio. Selected skipped
  chapters are failures. Source changes retain the complete fresh Vitest portfolio.
- Before cold native compilation, inspect trusted Ladybug/runtime artifacts per
  `docs/agents/ci.md`; verify source/platform/profile identity and byte hashes.
  Record a miss/rejection before source fallback. Cache hits never replace tests.
- Development packaging uses its verified cache and fresh afterPack checks when
  selected by CI. No signed release, live-provider or release-candidate proof is
  implied by this development PR.

## Actual execution and evidence

On September 30, 2026, targeted Git lifecycle tests passed 7 scenarios. The warm
controller, renderer and composer persistence run passed 20 scenarios. These use
production seams and isolated temporary data, without paid inference.

Both production Electron runners passed: `scripts/run-worktree-test.mjs` (14
independently reported checkpoints) and `scripts/run-project-new-thread-test.mjs`
(existing draft/navigation scope proof). The worktree driver records per-source
and binary SHA-256 values in `.relayer/evidence/worktrees/result.json` and captures
six production screenshots. The final rerun receipt is preserved beside this
README when verification finishes. Main service/settings/renderer recreation and
an app-server child restart are observed; a complete Electron OS-process restart
is not claimed. Windows native directory syncing and platform UI remain
unverified locally and rely on their declared platform contexts.

The first full check failed Clippy after Project grew beyond the large-error
threshold; the error variant is now boxed. The next check reached the persistence
suite and failed the old partial-index fixture because its recreated tables
omitted migration 38 columns. The fixture was updated without weakening its
partial-index rejection boundary, and its exact persistence/restart test passed.
A later full check exposed the public-share module closure missing the new Environment helper and asynchronous composer tests asserting before durable pre-Send persistence. The closure and awaited fixture boundaries were repaired; the three affected files passed 69 tests without unhandled errors. Two real Git lifecycle scenarios exceeded their default 15-second limit under the full portfolio; they now have explicit 30-second budgets and all seven lifecycle scenarios pass. The unrelated sealed Homebrew runtime scenario also timed out under overlapping machine load; its boundary was not weakened and the full portfolio is being rerun. The production build passed. The frozen `npm run check` passed formatting, Clippy, Rust, crash reconciliation, package builds and TypeScript checks, then exited with two unrelated Vitest timeouts (sealed Homebrew Node and autonomous calibration). The unchanged complete portfolio rerun `npx vitest run --maxWorkers=2` passed 241 files / 3,195 tests, with the same 1 skipped file / 3 skipped tests. This does not rewrite the outer `npm run check` failure as a pass. The remaining outer-command gates were run explicitly: secret boundary 2/2, Python 60/60, Ladybug receipts and PRD readability passed. No timeout budget was widened for the unrelated scenarios. The final production driver passed all 14 checkpoints, and the existing project-new-thread driver passed its restart and layer-selection markers. Two driver failures were retained and diagnosed: returning a function across Electron's serialization boundary, then treating hidden retained branch text as ready. The driver now waits for selected thread identity, ready Environment state and visible facts before releasing the delayed response. Production sources were unchanged by these driver repairs.

The full portfolio and remaining gates used executable/test digest `3feb8c7fbc8c3221b8a7c7de74f89f086b202da1038873360d5932ec978bc3e5`; only `scripts/test-desktop-worktrees.mjs` changed afterward. The final 14-checkpoint run observes that changed seam under digest `c0ef4848f530e88f2d0452dbfe508523e55c8b56d535cd4752f655d0790f1369`. All result source hashes and both binary hashes match the committed manifests. The screenshots beside this ledger came from that final run. Adversarial reviewer `/root/adversarial_review` independently verified the final 48-file digest, all 12 source hashes in the production receipt, both current binary hashes and all six screenshot copies. Verdict: pass for source authority, retry/storage and the 14 observed production checkpoints; no unresolved findings. This review is recorded in the PR as a compact assertion. Hosted CI and freshness remain separate pending gates.

The existing shared Cargo target was warm and contained trusted local prior
build outputs. Source was compiled against the current inputs; no external
Ladybug/runtime artifact restoration or cache-hit proof is claimed. Cache reuse
never substitutes for the fresh tests above.

## Integration with current main

PR #631 initially conflicted with main after the theme, agent-child lifecycle and readiness changes landed. The integration baseline is `3dc56dd9cff4bd1fd9c1faaf199ed195578a7224`. Conflict resolution keeps both System appearance and worktree IPC, Sticker × Cocoa and scoped Checkout styles, sidebar activity and exact thread scope columns, and all package scripts. The worktree migration is now `0040`; main's `0038` agent-child and `0039` readiness migrations retain their identities.

Integrated targeted checkpoints passed: 96 renderer/appearance/sidebar/artifact tests, 7 work-context tests, 119 storage tests, and the persistence/restart checkpoint with schema rejection. The integrated build passed. The current manifest is `e31c973560e9797e366b9a245ccb118013f16be1cf83f6fb03a0d50f63a262f0`, relative to that immutable main baseline. `VITEST_MAX_WORKERS=2 npm run check` is running without exclusions or altered scenario budgets; this is Vitest's supported concurrency setting. The integrated worktree Electron proof passed all 14 checkpoints; the existing project/new-thread proof passed both restart markers. Six refreshed screenshots and receipt hashes match the current manifest and fresh binaries. Independent reviewer `/root/integrated_review` verified all 48 manifest hashes, 12 receipt source hashes, both binary hashes and the six exact screenshot copies; source and observed evidence verdicts pass, with no unresolved findings.

The first integrated full check passed all native/package/type/workspace gates and 3,320 Vitest tests, then correctly rejected two newly introduced current-source visual receipts. Their declared social-preview and follow-up-annotation workflows were rerun with zero paid inference. The original annotation baseline A-to-B comparison and real accepted/running backend state were preserved; both evidence tests now pass. Only artifact receipts/raw images changed. The complete outer `VITEST_MAX_WORKERS=2 npm run check` passed after those artifact repairs: 255 Vitest files / 3,322 tests passed, with 1 existing skipped file / 3 existing skipped tests; the explicitly enabled secret boundary passed 2 tests; Python passed 60 tests; formatting, Clippy, all Rust and crash suites, package/TypeScript/workspace checks, Ladybug receipts and PRD readability passed. The production build and both Electron proofs cover the same unchanged executable digest. Hosted CI and freshness remain pending.

Independent secondary evidence review by `/root/integrated_review` verified social receipt `ed148340a2e2479de3bc2ae49bc6c318fe4d9a16ee837c9edb7c45d34ca2804b` and annotation receipt `2ad692154c36b3ffae8a091697c3e39f70b4bc8cb69a52ff773f1fc68f50912d`, including the original Git baseline, screenshot hashes and durable provenance. Verdict: pass, no unresolved findings. Earlier results above are historical and do not certify this integration.

## Hosted cleanup checkpoint repair

Hosted run `36689346800` passed the other selected chapters, but failed main's `an_ambiguous_preparation_fails_the_claimed_child_in_both_stores`. The production path first fences the child with a durable pending marker, fails the graph, observes terminal graph state, then clears the marker in a separate SQLite update. The old test observed graph/product terminal state before asserting marker cleanup; those observations can precede that last update. Independent review confirmed this synchronization race rather than a changed authority boundary.

The test now awaits the existing marker-cleanup boundary with the established two-second / 50-millisecond pattern before retaining its original assertion. No production behavior, timeout budget or assertion was removed. The exact test passed. The production build passed with both binaries byte-identical to the captured artifacts. Source/test manifest `a34dd8bb143dfcf65b84fd790222638fe982a06241bc7643ce03d98c39084c06` adds only these six test lines to the prior integrated snapshot. Independent reviewer `/root/integrated_review` verified all 49 file hashes and all unchanged production receipt/binary/screenshot hashes; verdict pass, no unresolved findings. The complete `VITEST_MAX_WORKERS=2 npm run check` passed for this last repair: all native, crash, package, type, workspace, receipt and readability gates; 3,322 JavaScript tests; secret boundary 2 tests; Python 60 tests. The existing 3 JavaScript skips remain unchanged. Hosted verification is pending on the repaired head.

## PR handoff gate

Open a main-targeting PR with a unique head commit and attach it to the task.
Address actionable CI/review findings before marking it ready. Report the exact
locally tested commit and GitHub's immutable merge/head identities separately.
Required CI includes `check` and `merge-freshness-status`: successful evidence is
valid for less than 12 hours from the original CI run creation, not a rerun's
completion. Human merge approval was provided after the production desktop trial and approved scrolling correction. Merge is authorized once current-head required checks and freshness pass.

## Final human-gate integration

The user tried the production app, requested a bounded scrollable Checkout list, approved the resulting UI, and explicitly authorized merging PR #631. The registered-checkout list now has a 320px maximum (further bounded by viewport height), independent vertical scrolling and keyboard focus. New worktree and base controls remain outside the scrolling list. This maps to the renderer fixture and the production Electron `registeredCheckoutListScroll` checkpoint: fourteen real registered checkouts overflow, the last row is reachable, and the creation footer stays fixed and visible. No existing test was removed. The worktree runner now requires fifteen independently passing checkpoints.

The final main baseline is `58242373`; integration retains main's agent preview and layer edge shapes alongside worktree controls. Package-script conflicts preserve all commands. Main's visual-evidence artifacts were retained as the newer provenance and are refreshed if current-source validation requires it. There is no new product-schema collision. Source-review digest is `cb67366c35c8b3e37cef82556cc2c295d58d0851158ddbd7b027324eb128d7a0` (49 executable/test files relative to this main). Reviewer `/root/merge_finish/review_merge` inspected durable Git plans, controller acknowledgment, API admission/idempotency, immutable cwd, grouping, migration 0040, scroll behavior and conflict resolutions: source verdict pass with no unresolved findings. Earlier evidence above remains historical. Fresh build, complete check and production evidence results are recorded below when completed. The compatible local Cargo target remains warm; native outputs are rebuilt for current source, without external cache restoration or paid inference.

The shared target's first default build failed with missing new-main core symbols while current source exports existed and all-feature native tests passed. A concurrent unrelated checkout used the same target. That cache/source mismatch was rejected; compatible dependency artifacts were APFS-cloned into a task-specific target and the three local packages cleaned. Fresh isolated compilation passed. The first worktree capture ran while the isolated check rebuilt native binaries; adversarial review correctly rejected its binary binding. The runner was repeated against a frozen, hash-verified `target/debug` copy, and all fifteen checkpoints then matched both native manifest hashes.

The first complete isolated check failed only `command_runner_clears_hostile_git_repository_environment` at its 500ms timeout. Exact repetition failed; a diagnostic five-second budget also timed out, so this was not dismissed as suite contention. An independent fresh-shell launch measured 4.326 seconds cold versus 3ms on subsequent same-file launches, and an instrumented exact test observed 3.100 seconds with the correct sanitized output. This identifies macOS first-execution scanning of freshly written scripts. The fixture now warms its harmless executable in setup; the production sanitizer call retains the original 500ms budget and every hostile-environment assertion. No production runner behavior or test assertion was weakened. The exact repaired test passed. Temporary diagnostic edits were restored before the final test-only repair. Complete build/check and independent delta review are repeated for this final source.

The next full check passed all 347 app-server unit tests but failed the unrelated approval-recovery integration fixture's fixed thirty-second epoch-reset deadline during parallel suite execution (37/38 integration tests passed). The exact unchanged scenario passed in 0.18 seconds and had passed in the earlier complete 38-scenario run. No deadline or assertion was changed. The final full check uses the supported native test-harness `RUST_TEST_THREADS=2` alongside `VITEST_MAX_WORKERS=2` to reduce fixture contention; every scenario still runs. The approval fixture sets its reset flag only after a post-completion poll with cursor 2; the failing run did not establish that observation. The exact scenario passes, but scheduling alone is an inference, not an independently proven root cause; current-source hosted CI remains mandatory.

Final local verification passed for executable/test digest `8749bea2e7f7021eb61f6ebe32661ff6c7bd7d3c67de9bd320454132a7aa3ed8`: complete outer `RUST_TEST_THREADS=2 VITEST_MAX_WORKERS=2 npm run check` (3350 JavaScript tests across 263 files; 3 existing skips, secret boundary 2 tests, Python 63 tests, all native/default/crash/package/type/workspace/receipt/readability gates). The production build then passed after the check finished. Its two native outputs were atomically copied into an otherwise frozen local target, with verified hashes in `runtime-build.json`. The final worktree Electron runner passed fifteen checkpoints and produced seven raw screenshots against those exact bytes. The existing project/new-thread runner passed both restart markers. Annotation A→B capture was repeated against the final binaries with zero paid inference, and both current-source visual evidence tests passed after final receipt regeneration. Source hashes are unchanged by the refreshed artifacts. Complete Electron OS-process restart, Windows-native and signed/live-provider proof remain outside this local result. Hosted current-head checks and freshness are the remaining merge gates.

Final independent review `/root/merge_finish/review_merge` verified all 50 file hashes at digest `8749bea2e7f7021eb61f6ebe32661ff6c7bd7d3c67de9bd320454132a7aa3ed8`, fifteen worktree checkpoints, thirteen receipt source hashes, both final runtime/binary bindings, annotation images/baseline and social source/renderer/images. Complete-check and build logs agree with the ledger. Source and observed-evidence verdict: pass, no unresolved findings. The first rejected binary receipt and earlier incomplete checks do not certify this final result.
