# Interaction graph popover bounds

Scope: approved narrow fix for the left-cutoff B3 panel. Prior required-response implementation and evidence are retained unchanged. No paid inference, commit, push, merge, publication, or active-app restart.

The user reported successful required-response button navigation in app server 59885 on September 28 ("okay woohoo it worked now"). This is human-reported success, not replacement for the outstanding automated Product/Eval/reopen evidence in the required-response folder.

## Diagnosis

Production createProductWorkspace, production index markup and styles, at 1280x800 with collapsed sidebar reproduced outer panel x=-82, heading x=-81, first card x=-55, while graph scrollLeft=0. The panel width was 720px but right edge was the graph-column picker at638px. The outer heading displacement distinguishes placement from internal graph pan. Ranked hypotheses: viewport-wide width with narrow right anchor; ancestor clipping; focus-induced internal scrolling. A containing-block probe moved panel x to59 while preserving card width. The final implementation preserves the original picker containing block and right/top alignment, avoiding side effects on the connected-node popup.

A separate 320px-height regression showed panel bottom343. Remaining viewport height now limits the scrolling region.

## Executable seams and checkpoints

| Changed seam | Promise/checkpoint | Smallest relevant observation |
| --- | --- | --- |
| B3 CSS width, flex viewport and height limit | AN-006: visible disclosed graph, unchanged card size and hidden default | Actual production-renderer browser runner: collapsed/expanded desktop, responsive widths, short height, light theme |
| B3 open/render, banner ResizeObserver, window resize and disposal | AN-006: panel refits after sidebar/reflow/resize; selected content remains reachable | Same runner changes sidebar while open and window dimensions, wraps text and opens a tall graph at its last selected card; static lifecycle review verifies listener/observer cleanup |
| Shared picker containing block (unchanged) | Legacy turn/context placement preserved | Actual legacy 320px selector geometry and connected-node popup width/relative picker; existing workspace disclosure test |
| Deterministic browser fixture/server and package entry | Renderer-only evidence, no inference or canonical-controller claim | `npm run test:desktop:interaction-graph-layout`; standalone `node scripts/test-interaction-graph-layout.mjs --serve` |

No graph semantics, acceptance, authority, card layout or canonical navigation/controller behavior changes. The fixture selection callback verifies the disclosure's callback/dismissal only; existing workspace-navigation-integration coverage owns response loading and Back. No tests removed. Existing in-process tests retain hidden/default-off, accessibility and controller checks; this browser fixture uniquely observes computed layout, which happy-dom does not implement.

## Required plan

Run focused existing interaction-graph/workspace/navigation tests; new deterministic browser layout entry; full `npm run check` and `npm run build`. Independent renderer and Standards reviews are local/non-certifying. Parent inspects the separately served fixture with CUA while app59885 remains untouched. The browser layout entry is the affected visual proof for this presentation-only delta. Prior failed gated Electron screenshot evidence stays failed/indeterminate; this runner does not replace assembled Product/Eval/reopen navigation proof.

## Results

Frozen snapshot: `c37a7b3d24577349032edeb232859e4aa16523f06f3da25abbdcd9d00831b01d`, 36 paths in `full-source-manifest.json` (prior required-response source plus this layout delta). Individual changed-file bytes are in `source-manifest.json`.

- Focused in-process entry: 3 files, 47 tests passed, 591ms (`focused.log`).
- Declared browser layout entry: all 11 named layout captures and scrolling/selection/dismissal/legacy assertions passed (`layout-declared.log`). `red.log` fails against the preceding production CSS/workspace at x=-82 with internal scrollLeft0. Saved PNGs cover collapsed desktop, narrow, tall selected-last and light mode.
- `npm run check` was invoked twice and did **not** produce a clean outer-command pass. First invocation stopped because the initial dependency copy omitted workspace-local parse5; corrected by clean lockfile install. The second invocation completed format, Clippy, ordinary Rust, crash-recovery, runtime/package builds, TypeScript and workspace checks, then Vitest stopped on Electron's concurrent first-import installer race. Logs preserve both failures.
- Explicit Electron initialization succeeded. Affected renderer-error-reporting suite: 3 tests passed. The exact remaining declared phases then passed on the unchanged source: Vitest 207 files / 2684 tests passed (1 file / 3 tests skipped), Codex credential boundary 2 passed, Python 43 passed, receipt checks and PRD readability passed (`check-remaining.log`). Completed native phases were not repeated solely for dependency setup. Thus all required check components passed across recorded runs, not through one clean outer invocation.
- `npm run build`: exit0 on the frozen snapshot (`build.log`). Final verification found zero mismatches across all36 source-manifest paths.
- Both local independent reviews found no actionable issues; exact scope/hashes and limits are in `review-assertions.md`. Parent CUA independently confirmed initial hidden state and full visible heading/cards at1280x720 in fixture57362. Protected app59885's 31 source hashes were verified unchanged.

The preserved screenshot failures in the required-response folder remain indeterminate; this layout evidence does not replace that assembled navigation proof.
