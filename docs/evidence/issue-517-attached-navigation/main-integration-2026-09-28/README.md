# PR 560 integration with merged main

Integration starts from published PR head `c48d5db5e90529069f0c0e6ab3ae139ad7de68ef`
and merges main `c6813890b2fc3f5c0cb2807f3ce509ef31673931` (#536).
The actual merge parents are retained. Because #536 was squashed, content
reconciliation uses its former head `015e5058a25b7f191da3a3addf56454d0e34b6d0`
as the logical feature base. Files untouched by #560 retain main's bytes.
Thirty ancestry conflicts reduced to nine content overlaps. No live profile,
existing demo checkout, provider inference, merge of #560, or deployment is included.

## Changed seams and required verification

The current PRD 7.2B and ADR 0011 remain authoritative. AN-001 through AN-008
retain the detailed production-seam mapping in the parent qualification ledger.
This integration additionally checks these overlapping boundaries:

| Seam / promise | Smallest deterministic checkpoint | Required heavy proof |
| --- | --- | --- |
| Frozen V2 authority, exact response-root obligation, atomic attached action/presentation acceptance, V1/off compatibility | Seven `graph_database` attached-navigation scenarios; full core/server suites | Gated first-message Product/Eval/reopen |
| Converted actions and changed attached nodes republish only affected scoped closures; SQL remains storage-owned | Ladybug attached-navigation publication/reopen scenario and core tests | Full check including crash reconciliation |
| Product cached roots, read-only projections and exact layer ownership | Product persistence attached-root refresh and interaction-graph projection scenarios | Context lifecycle and project restart |
| READ-001 preserves pending source; B3 selects response roots through existing controller, cancels automatic selection, retains draft guards | Interaction graph, workspace navigation, reading-context/layout suites | First-message in both gate modes |
| Main automatic-camera/inspector fit and split coexist with bounded B3 disclosure | Graph viewport resize and interaction-graph workspace suites | Browser layout portfolio and both first-message modes |
| Canonical frozen input and exact-node detail guidance across harnesses | Interaction-input and Codex/Claude/Prime prompt tests | Full check and compiled Eval runtime |
| Native credential exclusion retains main's parser/real-turn snapshot regression; presence detection uses `printenv` | Native secret-provider process tests; managed-access unit tests | Declared secret-boundary entry in full check |
| Project restart fixture retains main diagnostics and rebinds/drains its settings store | Existing production renderer/persistence suites | Project restart; node-input actions for merged input/inspector behavior |

No tests or assertions are intentionally removed. Independent persistence test
tails from both branches remain. The native snapshot fixture follows main's
deterministic parser check plus real native turn, rather than relying on overlap
timing; the existing child-capability scenario remains.

Required pre-commit gates are `npm run check` and `npm run build` using Node
22.23.2. Dependencies and Electron are initialized before those checks. Native
desktop entries run sequentially after the build, with isolated temporary
profiles and zero paid inference. First-message uses its declared non-native
keyboard mode, so it cannot certify native keyboard input. One bounded gated
capture is planned; capture failure is preserved and diagnosed before any retry.

Fresh Spec and Standards reviews must bind to the integrated source manifest.
Earlier human acceptance, native captures, CI and review assertions describe
their historical snapshots only. Parent #536 failures remain in its integration
ledger; they are not relabelled as passing evidence here.

## Actual execution

| Check | Observed result |
| --- | --- |
| Focused attached core | Seven production scenarios passed (`logs/core-focused.log`). |
| Focused UI/input | 73 tests passed (`logs/ui-focused.log`). |
| Inspector/composer/input contract traces | 86 tests passed, including the added sidebar/Close regression (`logs/contract-traces.log`). |
| Initial full check/build | Both exit zero before native-only fixture corrections; 228 JS files/3027 tests, native credential 2, Python 59, Rust/default/crash, workspace/type, receipt and PRD stages passed. |
| Gated first-message | Corrected run exit zero, inner passed/typed journey true, no ancillary failures, zero inference. Omission rejected; controls visible and navigated to response node46/layer14 in Product, Eval and service reopen (`gated-fixed-result.json`). |
| Default-off first-message | Exit zero, inner passed true, no ancillary failures, zero inference (`default-result.json`). |
| Project restart | Corrected run exit zero; passed, restartPersistence and layerSelectionRestartPersistence all true (`logs/project-fixed.log`). |
| Context lifecycle | Final wrapper exit zero and inner zero-inference success marker (`logs/context-final.log`). |
| Node-input actions | Corrected wrapper exit zero and inner zero-inference success marker (`logs/node-input-fixed.log`). |
| Compiled Eval | Declared entry exit zero, 3 tests passed (`logs/compiled-eval.log`). |
| Popover layout | Declared entry exit zero, 11 layout cases and selection/dismissal/legacy checks passed (`logs/layout.log`). |
| Final full check/build | Both exit zero on final source `5d978570...`: Rust/default/crash, 228 JS files/3028 tests (1 file/3 tests skipped), native credential 2, Python 59, workspace/type, receipts and PRD passed (`logs/final-check.log`, `logs/final-build.log`). |

Required-control Product, Eval and reopen screenshots were visually inspected:
each shows the Results store source with its retained Plan the next improvement
control and new Open attached response control. B3 is bounded within the current
split layout. The prior Eval wrong-state capture did not recur; that historical
failure is not retrospectively explained. First-message reports native keyboard
unverified. Fixture IPC-handler warnings remain in logs and do not certify the
missing settings handlers.

First-message, compiled Eval and layout proof preceded only subsequent runner
and trace-test edits; all production bytes and those entry points stayed unchanged.
The final manifest lists the exact remaining source. All inner failures below
remain failures; wrapper status alone is not treated as scenario proof.

## Drag fixture diagnosis

Full check and build passed at source `648ee0a7999707867d80861451691b6b8ac4a6729b2de504953b0a4ef6af20c0`.
The first gated run failed the existing drag/inspector assertion. Its synthetic
mouseMove delivered buttons=0, so main's intentional lost-release guard ended
the drag. A bounded event probe reproduced that exact failure. An intervening
larger diagnostic stopped earlier at initial fixture acceptance; its timeout
has no established cause and does not establish anything about dragging.

A one-second Electron probe against the actual production workspace fixture
then reproduced buttons=0/inspector-open. Adding only the held-left-button
modifier produced buttons=1/inspector-closed. The runner now sends that modifier,
retaining every existing assertion and all production behavior. Red and green
logs and the diagnostic source are retained. Final source is
`9984a2dfc9815a6f58fe043edf49cfe1456bf9df6df9913a1d545ac0df009a0d`.
The earlier full check/build used unchanged production/package/test inputs;
the changed desktop runner is verified by its separate native entry points.

## Main-contract runner reconciliation

The first project restart, context lifecycle and node-input attempts failed their
inner scenarios. Their wrappers correctly rejected these results even where the
Electron process exited zero. Compiled Eval (3 tests) and all 11 layout cases passed.

Current main already defines three contracts the old native assertions missed:

- PRD SCP-020 restores a failed-send retry when its overriding draft is cleared.
  The project runner now first observes the exact retry text, then explicitly
  clears that retry before retaining its original empty-draft/tombstone checks.
  The corrected native run passed this transition, restart persistence and
  layer-selection restart persistence. An intervening diagnostic timed out at
  an earlier pending-draft checkpoint; its cause remains unestablished.
- PRD 6.3/#514 lets the latest Close supersede a sidebar change waiting on draft
  persistence. The context runner now observes the source thread and closed
  inspector, then reopens the node and checks its saved editable draft. A new
  in-process test exercises that exact production selection boundary. It adds
  cross-thread selection preparation to the existing close-during-flush trace;
  no trace or previous assertion was removed.
- PRD 7.2/#521 keeps Send ready during a pending authored-input commit. The input
  runner retains its cross-thread isolation checks, then presses Send while the
  commit is held. It requires no interaction POST before release and checks the
  eventual request's exact committed draft revision and persisted answer.
  Existing pending-Send isolation and cancellation checks continue afterward.

The focused production inspector/composer/input portfolio passes 86 tests.
No product source or PRD meaning changed. Corrected native results and fresh
source-bound reviews remain separately recorded below.

The first corrected context run passed the Close checkpoint, then found another
old expectation: it assumed a queued turn request disappeared when confirmation
failed. The final runner observes that latest request, returns to the source,
and retains the original inline error, exact saved draft and retry assertions.
The final native context lifecycle passed. No production behavior was changed.

## Final local qualification

All 71 source-manifest hashes were rechecked after the final commands and before
commit. Final `npm run check` and `npm run build` both exited zero on that exact
snapshot. No tests were deleted, no timeout increased, and no production behavior
changed to satisfy native fixtures. The earlier default/gated, compiled Eval and
layout entries retain byte-identical production and runner inputs. Corrected
project, context and input entry points passed their independently visible inner
scenarios. Parent #536 and earlier #560 failure evidence remains preserved.

The integration commit will bind this manifest to PR #560. Hosted CI/freshness
is separate and will be recorded in the PR after pushing and retargeting main.
Merge of #560 and deployment remain outside this work.
