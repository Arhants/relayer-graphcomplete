# Slice 1: human task sessions and graph review

This slice provides the human workflow for issue #544. A person selects a case
and harness, works in the production graph, saves ratings and anchored feedback
without ending the task, explicitly finishes, and reopens or exports evidence.
The existing matrix and objective checks remain separate from satisfaction.

The interactive Europe-trip variant is a manual intent-discovery exercise: its
opening request is vague, private constraints stay out of product thread inputs,
and the human answers naturally. It does not implement a simulated user or an
automatic semantic judge. Those remain later slices.

## Verification plan

The evidence README maps all changed seams. Required final commands are
`npm run check`, `npm run build`, and `npm run test:eval-web`. Browser proof uses
real Rust storage, the production renderer, deterministic task harnesses, and
fixture authentication/discovery. It does not purchase model inference.

Final review also covers per-thread timing qualification, grading history,
failed finish rollback, draft preservation on refresh/save failure, profile
credential isolation, and all surface authority boundaries. Existing private
binaries keep the user's host independent of verification builds. Cargo reuses
its warm local dependency cache; no unverified downloaded native artifact is used.

## Human evidence

The user connected Codex, ran both the autonomous and interactive trip cases,
opened graph nodes, and saved a node-anchored comment on “Start with the trip
brief”: “why is this only 1 question when its clear there are like 4 questions
here”. The saved annotation and its node anchor were read back in an exported
session bundle. No agent-created satisfaction score is represented as the user's
opinion. This is human usability evidence, not proof of calibrated simulation.

## Stabilization changes

- Review & grade is a visible workspace control. Save grade and graph-moment
  annotation stay independent of Finish task. Archived graph review supports
  grading without execution authority.
- Status refresh and failed saves preserve feedback drafts when status is unchanged.
- Timing qualification is tracked per thread, so opening a later case step late
  cannot inherit a prior thread's observer coverage.
- Legacy finish requests that include a rating retain grade history; failed export
  restores previously saved grades.
- Prime native payload tests use an isolated in-memory discovery registry. The
  previous failures came from ambient provider credentials influencing the test's
  unconfigured baseline. Real request payload assertions remain unchanged.

- Settings discovery now preserves the current editor at response application.
  A request-time snapshot had discarded newly created drafts, reverted typing,
  or resurrected cancelled drafts. The actual renderer regression failed before
  the fix and covers all three cases; 28 focused model/provider tests passed.
  This repairs existing Settings custom-family behavior rather than introducing
  a new product decision.

## Results

2026-09-28, initial stabilization run (retained failure history):

- `npm run check`: Rust formatting, Clippy, workspace tests, crash reconciliation,
  package builds, and TypeScript/workspace checks passed. Vitest reported 2,648
  passing, three skipped, and one failed test across 207 files. The unchanged
  sealed Homebrew Node closure test exceeded its 30-second deadline under suite
  load (38.4 seconds). This command failed; it is not an unqualified pass.
- The exact failing test passed unchanged when isolated: one passing test in
  7.5 seconds. This supports a contention-related timeout, not a source fix.
- The checks short-circuited after Vitest were run explicitly: Codex secret
  boundary (two tests), Python (43 tests), Ladybug receipts, and PRD readability
  all passed.
- `npm run build` passed. Browser-proof private binaries exactly matched the
  newly built binaries by SHA-256: app `45c20a0386b5cd522acd882c757c638a2d87713e83820020b960bea86cb1e154`,
  graph `a46c1e60a7ddeced5686b9a07943c9fafd126eba52c1c8c292eb3cf09e8e021f`.
- Browser proof passed interrupted startup, human-task lifecycle, and host/restart
  chapters, then reproduced a Settings Save-button detachment timeout. Final
  diagnosis confirmed the stale editor snapshot described above.

Final frozen-source rerun:

- `VITEST_MAX_WORKERS=3 RUST_TEST_THREADS=1 npm run check` passed in full,
  using the same warm Cargo target and SSD temporary directory. Vitest: 207
  passing files, one skipped; 2,652 passing tests, three skipped. Secret-boundary
  two tests, Python 43 tests, Rust workspace/crash checks, types, receipts, and
  PRD readability also passed. Worker count bounds contention; no tests or
  assertions were removed or relaxed.
- `npm run build` passed after the full check.
- `npm run test:eval-web` passed all five chapters: interrupted startup;
  human task with live grading, finishing, archived grading, export, and draft
  retention; host/restart/authority; production Settings; and isolated judge
  capture. This replays the original failing Settings workflow after the fix.
- `workspace-review.png` was captured by that passing browser run and visually
  inspected. It shows the production graph and expanded Review & grade panel.
- `git diff --check` passed.

Earlier reports retain their failures as historical data. The screenshot is a
deterministic fixture session, not a user-authored satisfaction rating.


## Source review

Frozen source/config/test/PRD scope: 35 changed paths, excluding this evidence
folder. SHA-256 `c07aa963e2510b06c1cf88e9418b108663efa9dab5c5d26e04c8ac56e392638e`,
computed as sorted repository-relative path + NUL + bytes + NUL.

- `/root/slice1_authority`: reviewed lifecycle, scoped authority, live/archived
  grading, per-thread timing, private case, immutable export, checkpoint mappings,
  and the Settings asynchronous edit-preservation fix. No unresolved blockers.
  Tests were not independently rerun by this reviewer.
- `/root/provider_backend`: reviewed provider/credential composition, gateway
  separation, model resolution, Rust catalog preference, PRD, and browser mapping.
  No unresolved findings; independently passed 44 focused tests. Its 15-file
  source digest is `04db510afe995bd58f01f4ebecb380ad490ab4c6634eeb5cd4d92da3b712aa95`.
  The subsequent Settings fix was authored by this agent and reviewed separately
  by `/root/slice1_authority`.
- `/root/eval_facts`: isolated ambient model discovery in the Prime test fixture;
  all 58 Prime tests passed without weakening actual request payload assertions.

Scoped source changes invalidate these assertions. The assertions become durable
PR evidence only when recorded in the PR; reports alone do not certify a release.
Real OAuth, Keychain interaction, and paid model execution are not established by
fixture tests. The user's observed login and annotation are separate manual evidence.

Provider review's exact 15-file scope: `crates/relayer-app-server/src/storage/sqlite/catalog.rs`;
`desktop/eval-main/{credential-store,eval-service,index,provider-setup,web-host}.mjs`;
`desktop/eval-renderer/{product-settings,web-bridge}.js`;
`docs/decisions/0003-shared-product-eval-workspace.md`; `docs/prd/index.html`;
`scripts/test-eval-web.mjs`; and `test/{eval-credential-store,eval-provider-setup,eval-service-simulated-user,eval-web-host}.test.mjs`.
