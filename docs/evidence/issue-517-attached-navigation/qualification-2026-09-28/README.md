# Qualification record — September 28, 2026

**Blocked. Live demo NOT RUN. No commit, push or new PR was made.** The prepared feature remains gated off by default. Native secret-boundary behavior requires a separate decision; rich HTML without replacement also remains an unapproved product choice. This is not human-gate readiness.

## Required plan, execution and evidence

The parent ledger maps PRD AN-001 through AN-006 and secondary executable seams. All handoff commands were attempted as required. The results below distinguish the failed full command from its passing inner stages.

| Command or boundary | Actual result | Evidence |
| --- | --- | --- |
| Final `RUST_TEST_THREADS=2 npm run check` | **FAIL** at native secret-boundary test; cause unknown. Prior Rust/workspace/crash-support/type/build stages and 207 JavaScript files / 2680 tests passed; one file / three tests skipped. | `final-check-secret-boundary-failed.txt` |
| One isolated `npm run test:codex-secret-boundary` diagnostic | 2/2 pass; does **not** clear prior failure | `isolated-secret-boundary-pass.txt`, `native-boundary-diagnosis.md` |
| Prior executable-identical full check | Inner stages, 2/2 native checks, 43 Python checks and Ladybug receipt checks passed; final PRD readability failed. Two sentences were split and focused readability passed. | `review-fixed-check-readability-failed.txt` |
| Final `npm run build` | PASS | `final-build.txt` |
| Gated first-message Electron runner | PASS, typed-permission journey true, native keyboard false, zero inference, no ancillary failures; actual B3 current-card root reset and Back | `desktop-gated.txt`, `desktop-gated-result.json`, B3 PNGs |
| Default-off first-message Electron runner | PASS, gate false, native keyboard false, zero inference, no ancillary failures | `desktop-default.txt`, `desktop-default-result.json` |
| Interaction-context lifecycle runner | PASS, zero paid inference | `context-lifecycle.txt` |
| Project-new-thread runner | PASS, project and layer-selection restart persistence true | `project-restart.txt`, `project-restart-result.json` |
| Compiled Eval runtime | 3/3 PASS | `compiled-eval.txt` |
| Production core regressions | Four attached-navigation scenarios passed; root reference, duplicate mount and retained staging each reproduced red before fixing | `focused-core.txt`, `*-red.txt`, `*-green.txt` |
| Real Ladybug publication/reopen | PASS | `focused-ladybug.txt` |
| Packaging, artifact imports, public-viewer boot, onboarding, navigation | 117/117 PASS | `packaging-viewer-controller.txt` |
| Declared public-viewer Electron smoke | Desktop and mobile inner assertions pass, unchanged URL, no external requests, zero inference | `public-viewer-smoke.txt`, `public-viewer-manifest.json`, prefixed PNG copies |
| Authorized real Codex explicit-replacement run | **NOT RUN** due unresolved native boundary | Driver prepared locally only; no model receipt or live profile graph |
| Native keyboard/account and human acceptance | **NOT PROVEN**; Mac locked; no OS/session settings changed | No substitute claim |

The desktop runners emit existing missing fixture IPC-handler diagnostics for unrelated local preferences. Their explicit inner result markers passed; project restart independently exercised layer-selection persistence. These fixture runs do not establish real model-authored attached mutations or native interaction.

## Snapshot and artifact identity

`source-acaa.json` preserves the failed first freeze. `source-1c5b.json` is the independently reviewed corrected candidate. `source-29eeda.json` is the final tested 52-file source snapshot: digest `29eeda14452e722400023f2482855a4f0b573122b8592bce336152daaea20b01`, based on `015e5058a25b7f191da3a3addf56454d0e34b6d0`. The method is SHA-256 of UTF-8 `JSON.stringify({base,files})`; sorted entries contain path and file-byte SHA-256. PRD readability and ledger edits alone distinguish 29eeda from 1c5b; all executable hashes are equal.

This qualification directory and the parent ledger's final status were added after those runs. They change documentation/evidence only, so they are not silently included in an older digest. `artifacts.json` binds the archived evidence bytes. The copied public-viewer manifest retains its original runner paths; the three `public-viewer-*.png` files here archive the corresponding images with a prefix, without changing their bytes.

The three B3 PNGs were visually inspected: the badge is unclipped, the popup is closed initially and after selection, and the open popup contains four fixture interactions and one invocation edge. The selected screenshot shows the response root restored. They do not prove a live attached-context edge. Public-viewer inspection confirms the ordinary turn selector remains visible with B3 off.

## Independent review and remaining work

Parent chat `01a0d9c7-e4af-7112-a0f6-92226b2a4201` coordinated Spec (source and logs) and Standards (static) reviews of 1c5b: both PASS, no new actionable findings. The parent verified all 52 hashes and the documentation-only 29eeda addendum. Reviews cover implementation scope only and are **non-certifying without a pinned PR/final source**. New qualification metadata needs its own final addendum. See `PR-draft.md` for compact assertions and prepared PR text.

Remaining: decide how to address the native secret-boundary failure without weakening it; obtain an approved full-check disposition; resolve the rich-detail/no-replacement product choice; then run the already-bounded real Codex demo, inspect actual context-graph/navigation/reopen visuals and execution counts, and obtain human review. No paid inference, native unlock, merge, deployment or PR536 modification was performed.
