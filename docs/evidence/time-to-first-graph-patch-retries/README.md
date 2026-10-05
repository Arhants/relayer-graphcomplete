# Patch retries: proof against the Eval runner

Date: 2026-10-05. Source: branch `patch-retries` (graph-client, harness-host and docs changes in PR #661) against `main` at `3fd7624d`. Both branches share the same Rust binaries; no Rust changed.

## Scope

Show that a retry can send edits to the last graph program instead of retyping it, through the real harness host and graph server, and measure what that does to time to first graph on a real model. No quality claim beyond the deterministic judge passing. Follow-up proposals (outline first, per-node detail) are not tested here.

## Checkpoint map

| Changed seam | Promise | Observation |
| --- | --- | --- |
| Graph client `fromEnv()` and `rerunGraphProgram` | The stdin program is kept; a patch applies in order; one match per find; missing base or bad match fails before anything runs | `packages/graph-client/test/program.test.ts` (real `node --input-type=module` stdin runs) |
| Harness host per-turn program folder | Granted to every run, removed with the turn | `packages/harness-host/test/draft-preview-bridge.test.ts` |
| Codex and Claude env and prompts | Fallback heredoc teaches edits; pinned launcher does not; env var passed only when granted; edits recognized only in the same heredoc form | `codex-basic.test.ts`, `claude-basic.test.ts` |
| Whole path, zero inference | Rejected program, patch heredoc, accepted graph, folder gone, through the real host and Rust graph server | `test/graph-program-patch-rerun-e2e.test.mjs` |
| Whole path, real model | A live Codex turn uses the patch on its own and the graph is accepted | `runs/` below, 8 traces |

## Live runs

Eval host from this checkout, built-in case `empty-project.hierarchical-overview.single-turn`, harness `codex-basic` (same configuration as the Sept 28 traces), judge `deterministic-graph-contract`, Codex subscription, model `gpt-6.1-sol`, Codex CLI 0.159.3. Four runs per branch, one at a time, same machine, no other load. `main` ran first, then `patch-retries` after `npm run build:packages`. Each `runs/<branch>/run-NN/` holds the turn's `events.jsonl`, `graph-operations.jsonl`, `manifest.json` and a `run.json` summary. Cash cost: $0 (subscription quota).

Read with `ttfg.py` (kept outside the repo): `python3 ../ttfg.py docs/evidence/time-to-first-graph-patch-retries`.

| Branch | Run | Accepted at | First draft sent | Full drafts | Patch reruns | Rejected | Retry typing | Retry chars | Output tokens |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| main | 01 | 184 s | 165 s | 3 | 0 | 1 | 5 s | 24,854 | 4,303 |
| main | 02 | 561 s | 187 s | 5 | 0 | 3 | 331 s | 49,462 | 14,653 |
| main | 03 | 322 s | 306 s | 4 | 0 | 1 | 5 s | 36,253 | 8,234 |
| main | 04 | 377 s | 335 s | 5 | 0 | 3 | 16 s | 57,336 | 9,447 |
| patch-retries | 01 | 230 s | 159 s | 1 | 6 | 4 | 32 s | 2,674 | 5,519 |
| patch-retries | 02 | 275 s | 198 s | 1 | 4 | 3 | 36 s | 3,499 | 6,737 |
| patch-retries | 03 | 250 s | 169 s | 1 | 4 | 3 | 54 s | 4,507 | 6,142 |
| patch-retries | 04 | 325 s | 230 s | 1 | 6 | 5 | 44 s | 4,170 | 7,840 |

All 8 turns accepted; the deterministic judge passed all 8. "Retry typing" is the time the model spent producing every draft after the first. "Retry chars" is the size of those drafts.

Medians: accepted at 349 s on `main` (184–561) and 262 s on `patch-retries` (230–325). Output tokens 8,840 vs 6,440. On `patch-retries` the model sent one full program per run and then only patches, 300 to 2,400 characters each, 4 to 27 s each, without being told to prefer them beyond the prompt text.

## What the baseline showed

On this Codex version and model, a full-program retry that changes only a few lines is already cheap: 1.5 to 6 s and 50 to 430 output tokens for a 12 to 14 k character program (`main` runs 01, 03, 04). Something in current Codex re-sends a repeated command without the model retyping it. Retries that restructure the program still cost the full price: `main` run 02 had three at 104 to 121 s each.

The Sept 28 traces behind the research doc (`docs/evidence/issue-517-attached-navigation`) were Codex CLI 0.147.0 with `gpt-5.6-sol`, where every retry retyped the program at about 57 tokens per second. The 58 s per small fix in that analysis does not describe the current pin. The estimate in `docs/research/time-to-first-graph.md` (run A 422 s to about 257 s) replayed those old traces and should be read that way.

## What this does and does not show

- It shows the mechanism works end to end with a real model, that the model picks it up from the prompt alone, and that every patched run was accepted.
- Four runs per branch is a small sample. The ranges overlap. The `patch-retries` runs were less variable and had no slow outlier, while `main` had one 561 s run caused by large rewrites. Do not read the medians as a measured speedup; read them as consistent with the mechanism removing the large-rewrite cost.
- `patch-retries` runs had more rejections (15 vs 8). The patches were cheap enough that the model iterated in smaller steps. Time to accepted still came out lower or equal.
- The case is a one-turn overview prompt, not an everyday task or the external ten-case catalog. The external cases are long coding tasks that end with the same graph-authoring step; they were not run.
- One machine, one day, one model. No Claude runs.

## Verification actually run on this source

- `npm run build`: passed (Rust from source including Ladybug, 13 min).
- `npm run check`: the `cargo test --workspace` chapter failed on 4 `relayer-app-server` git-environment tests at full parallelism on this laptop (2 s git timeout; issue #434). The same 357 tests pass at `--test-threads=4`, and no Rust changed on the branch. Every later chapter was then run by hand: `check:graph-crash-reconciliation`, `cargo build`, `build:packages`, `tsc --noEmit`, workspace checks, `vitest run` (3,433 passed, 20 failed), `test:codex-secret-boundary`, `lint:ladybug-receipt`, `prd:check-readability` all passed except the 20 Vitest failures, which are all environmental and also fail on `main` here: Python 3.9 on this Mac (`prime-visual-authoring`, `prime-agent`, `graph-search-client-parity-e2e`, `prime-visual-integration`), the Prime macOS sandbox boundary, rustup having no default toolchain at the time (`ci-affected-plan`, `ci-compile-inputs`, fixed by `rustup default`), `ci-lbug-artifact` under contention (passes alone) and one Mach-O probe in `evidence-capture-integrity` against this Node 23 binary (the repo pins Node 22).
- Python unit tests: not run, Python 3.9 cannot import the client (`str | X`).
