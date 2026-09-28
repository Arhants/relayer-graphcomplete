# PR 560 merge-readiness pass

This pass consolidates the approved required-response navigation policy and popover fix onto existing PR #560, stacked on #536. Fixed base: `015e5058a25b7f191da3a3addf56454d0e34b6d0`; existing PR head: `c1db3d10825183c5ab7209b3abd22ef2ef7bbd97`. No main rebase, parent-PR change, merge or release is included.

## Preservation and candidate identity

The isolated `attached-popover-bounds` checkout contains every changed tracked/nonignored untracked path from `required-attached-navigation`: 38 exact matches, no missing or different files. All 17 original `attached-navigation` follow-up paths are present: 13 exact matches and four intentional supersessions (PRD, Codex guidance, Claude/Codex prompt assertions) implementing the later mandatory-button decision. The independent dirty `a82f` checkout is not part of this consolidation and is untouched.

The executable/documented source snapshot remains `c37a7b3d24577349032edeb232859e4aa16523f06f3da25abbdcd9d00831b01d` (36 paths, popover evidence `full-source-manifest.json`). `candidate-manifest.json` records the 79-path staged follow-up reviewed at freeze; it excludes itself and subsequent result records to avoid recursive hashes. Full-PR review compares fixed base to existing HEAD and includes the staged follow-up.

Seventeen historical `.log` files had been excluded by Git ignore rules during the isolated copy. They were restored byte-for-byte from the preserved required-navigation checkout; `restored-evidence.json` records SHA-256 values. Only known evidence logs are force-staged. Credential-pattern screening found no Bearer tokens, API keys or credential assignments in the curated logs. This is not a claim that historical failure evidence passed.

## Required verification plan

1. One clean `npm run check`, with the workspace dependencies and Electron binary already initialized.
2. `npm run build` on this candidate.
3. Sequential isolated, zero-inference desktop entries: gated and default-off `scripts/test-desktop-first-message.mjs`, `scripts/run-project-new-thread-test.mjs`, `scripts/run-interaction-context-lifecycle-test.mjs`; plus `npm run test:eval-compiled-runtime`. Reuse the completed build when invoking declared underlying entries. Every desktop runner creates a temporary independent profile. Native keyboard input remains explicitly excluded for first-message qualification.
4. One bounded gated Product/Eval/reopen attempt is authorized on this consolidated candidate. Preserve any failure and stop capture retries if `UnknownVizError` recurs. Do not relax assertions, capture, or timeouts to get a pass.
5. Parent-owned independent Spec and Standards reviews of the pinned full candidate, with exact scope/source assertions.

The previous desktop human acceptance remains valid evidence of the user's observed behavior. It does not waive missing automated checkpoints or convert blank CUA screenshots into visual proof. Keep PR #560 draft until required proof is complete or the user explicitly decides otherwise.

## Publication boundary

After local pre-commit gates and reviews, commit from this isolated checkout and use a normal fast-forward push to `refs/heads/codex/attached-navigation-b3`, verifying the remote head first. The existing branch-owning working tree and live demo remain untouched. Update the existing PR body to cite the user's superseding mandatory-button decision and current PRD/ADR; do not rewrite issue #517. Hosted CI and freshness must be assessed against the resulting exact PR head. Merge is not authorized.

## Actual results

All commands below ran on unchanged production/test source `c37a7b3d24577349032edeb232859e4aa16523f06f3da25abbdcd9d00831b01d`. All36 file hashes were reverified. The only change to the reviewed79-path candidate is the independently reviewed evidence-index correction, SHA256 `935fb3e909196b0655b90abbd9694e56c2cf6dd56c52eda3dd714dea51efd40b`; later additions record results/provenance.

| Required proof | Actual result |
| --- | --- |
| Clean `npm run check` | Exit0 (`check.log`): format, Clippy, Rust/default/crash, runtime/package builds, TypeScript/workspace checks;207 JavaScript files/2684 tests passed (1file/3tests skipped); credential boundary2 passed; Python43 passed; receipt and PRD checks passed. |
| `npm run build` | Exit0 (`build.log`). |
| Gated first-message Product/Eval/reopen | One authorized bounded attempt, exit0, `passed:true`, `typedPermissionJourneyPassed:true`, `ancillaryFailures:[]`, `inferenceCalls:0` (`gated.log`, `gated-result.json`). Omission rejected; required controls reported visible and navigated in Product, Eval and after actual service restart. Exact response node46/layer14 observed. |
| Default-off first-message | Exit0 and inner `passed:true`, no ancillary failures, zero inference (`default.log`, `default-result.json`). |
| Project restart | Exit0 and inner `passed`, `restartPersistence`, `layerSelectionRestartPersistence` alltrue (`project-restart.log`, `project-result.json`). |
| Interaction-context lifecycle | Declared wrapper exit0 and inner lifecycle pass with0 paid inference (`context-lifecycle.log`). |
| Compiled Eval runtime | Declared npm entry exit0;3 tests passed (`compiled-eval.log`). |
| Popover layout | The unchanged production/runner snapshot's earlier declared11-layout proof and47 focused in-process tests remain applicable; see popover ledger. |
| Independent review | Spec and Standards pass, including evidence-index delta. Exact scope/identities in `review-assertions.md`; execution evidence is recorded separately here. |

The first-message runs use the declared non-native-input mode (`nativeKeyboardVerified:false`). Logs preserve nonfatal missing test IPC handler messages for layer-selection storage and other fixture capabilities; these runs do not certify those unprovided fixture capabilities. The separate project-restart runner observes its declared persistence boundary.

## Eval image discrepancy and bounded comparison

Product and reopened-source PNGs visibly contain the preserved control and new required button. The gated Eval image `13-required-eval-button.png` instead shows the response destination. It is **not** source-button pixel proof. The helper's exact ordering is DOM source/button readiness, two animation frames, awaited screenshot write, then actual button click and canonical destination assertion. The discrepancy therefore cannot truthfully be labeled an after-click screenshot. Its cause remains unresolved; no assertion, capture, timeout or product code was changed, and the passing full journey was not repeated.

One separate minimal deterministic comparison created a fresh accepted source, resolved invoke and required response through the real Product/graph services. It opened one Eval window, captured once hidden and once with `showInactive()`, and measured canonical identity and button state before/after both captures. Both PNGs visibly show the source and both controls. WebContents identity matched its window; all four observations were identical: source interaction1, layer7, selected node24, enabled visible button entirely inside the viewport. Only the subsequent actual click changed the canonical layer/node to10/34. `eval-capture-probe-result.json` records those values; the diagnostic source is preserved as `eval-capture-probe.mjs.txt` (SHA256 `371943a1d80e3b667426fafe12d01142f0563a9c9b071349d9476980452d7780`). It ran from `.relayer/eval-capture-probe.mjs` against the same repository/runtime, with `RELAYER_TEST_INTERACTION_PERMISSIONS=1` and its own evidence directory/profile. The temporary fixture was cleaned up by its normal shutdown.

This comparison supplies independent current-source Eval control pixels and a measured source-to-response transition. It did not reproduce or root-cause the original capture mismatch; hidden-window staleness, async navigation and wrong-target hypotheses were not established. `probe-hidden.png`, `probe-shown.png`, `eval-capture-probe.log` and the result JSON preserve the observation. No further diagnostics or capture retries were performed. Human signoff and the original live-app CUA blank-capture limitation remain separate historical evidence.

