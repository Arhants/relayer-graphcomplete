# PR 536 final main integration

User authorization: resolve the conflicts, validate, merge #536 into main, then
prepare #560 on that foundation. This does not authorize merging #560 or a release.

Pinned inputs: PR head `015e5058a25b7f191da3a3addf56454d0e34b6d0` and main
`18d6f23b9fd2c9ce897352b73fadfb53040b9288`. The isolated
`permissions-merge-ready` checkout preserves all earlier working trees, live
profiles and user acceptance. This is an actual conflict integration, not a rebase
for ordinary main movement. Historical evidence elsewhere remains historical.

## Changed integration seams and checkpoint plan

| Seam | Resolution and required observation |
| --- | --- |
| Runtime construction and release reconciliation | Retain both the default-off interaction permission option and main's unknown-provider-release acknowledgement hook. Temporal-feature and access-broker tests observe these production seams. |
| Graph persistence fixtures | Preserve legacy and typed acceptance, rollback, reopen, imported denial and occurrence tests. Adopt main's private temporary-directory isolation for every added database fixture; no assertions or cases removed. Full Rust/default/crash suites remain required. |
| Desktop fixture catalog preparation | Use main's generation-aware fixture-only `seedProviderCatalog`, retain the explicit fixture model family and real service-reopen journey. Run both default-off and gated first-message modes. |
| CI receipt and freshness | Preserve main's immutable checkout/status handling and PR head's observed-main validation. Paired current/stale event metadata, wrong head/SHA, nonmerge and observed-main mismatch remain covered by the real temporary-Git test. |
| Auto-merged graph/product/renderer seams | IP-001 through IP-005 remain authoritative. Full check/build covers authority, API recovery, export refusal, graph index and compiled controls. Node-input, interaction-context and project restart desktop entries verify integration with current main. |

Required before committing: `npm run check`, `npm run build`, the named heavy
entries above, and independent exact-source Spec/Standards review. Hosted required
`check` and merge freshness must pass on the published resolution before merge.
No branch-rule bypass, paid inference, release or deployment is part of this pass.

## Build preparation

Clean lockfile installation completed. The known sealed Ladybug bundle at
`/tmp/issue-371-lbug-bundle` was previously rejected for Cargo.lock identity and
was not reused; no compatible sealed runtime artifact was available. The inactive
build-output directory from the completed #560 candidate was APFS-cloned into this
checkout, not shared or symlinked. Its Cargo.lock differs, so it is only ordinary
compiler-cache acceleration: Cargo recompiles current sources, and all tests run
fresh. No old binary or prior test result certifies this integration.
Electron is initialized explicitly before test processes start. No dependency
version changed. Installation reported existing audit advisories, not repaired here.

## Observations, not yet a pass claim

The initial focused run passed all 45 freshness tests but three runtime-constructor
tests failed because the new checkout's harness-host package had not been built.
This is a missing build prerequisite, not a product fix or a timeout retry.
The original focused log is retained. The full check performs package compilation
before rerunning the production tests. Results and review assertions will be added
after completion; this plan alone is not proof.

The first full check stopped at Rust test compilation: two permission-refresh
fixtures still used the old function arity after main introduced an optional
interaction-execution service. Both now supply that parameter consistently with
the production caller. No assertion was removed.

Independent Standards review also found five direct SQL queries in graph behavior,
contrary to the documented storage boundary. The queries now live in the existing
action, current, completion and permission storage modules. Query predicates,
typed identifier validation, transaction ownership and graph orchestration are
unchanged. Existing IP-001/002/003/005 tests and full-check fallback cover these
extracted seams; both reviewers must revalidate this delta.

The second full check stopped on an incorrect fixture field name in the arity
repair. It was corrected to the existing `interaction_execution` field. The third
run begins on that final source. Both failed compile logs are retained; neither is
a test pass.

## Independent source-bound reviews

Both reviews used pinned main `18d6f23b9fd2c9ce897352b73fadfb53040b9288`.
The original whole-PR binary diff was
`5d700eaa45dc7344c7f154632241472b7a57147e89b5e7843357a6edccc6bda5`;
the reviewed storage/API-fixture delta produces
`846d7e2d66fe35b5ff81221f9417d1c6614a18094275ffa1954390154b8ad32a`.
The pre-desktop-fix source manifest bound 57 changed non-evidence paths at digest
`94a9e8dbe291dae431a622d34e8cf47338042ead32b529a041524d48d894c33a`.
Subsequent evidence-only additions do not change those source bytes.

- Reviewer `/root/merge_ready_spec`: full integrated PR plus narrow storage/API
  delta, PASS, no unresolved Spec/authority findings. Checked exact SQL and
  transaction equivalence, frozen grants, atomic conversion, scope, import/export,
  default-off behavior, main conflict reconciliation and test retention. No
  independent tests or UI actions were executed by this reviewer.
- Reviewer `/root/merge_ready_standards`: full integrated PR plus the same delta,
  PASS after the documented SQL-boundary finding was fixed. Verified all five
  queries moved to storage without predicate, ordering, transaction or validation
  changes; all 84 main and 93 prior-PR graph-database test names remain. No
  independent test execution was claimed.

These are code-review assertions, not substitutes for fresh check/build/heavy
results. Any source change invalidates the bridge until re-reviewed.

### Final navigation-fixture delta

The Node 26 full check passed Rust/default/crash suites but failed four navigation
cases and one exact-port launcher case. The launcher failure reproduced in 310 ms:
Node 26 denied loopback networking with `ERR_ACCESS_DENIED` (not a reported secret
leak). The identical test passed in 264 ms under the existing repository-pinned
Node 22.23.2. No security code, assertions or dependencies were changed. All final
commands set the existing Node 22 installation first in PATH; the failed ambient
Node 26 run is preserved and is not final qualification.

The four navigation cases also reproduced under Node 22. Main's explicit PRD
reading contract (section 7, READ-001) preserves the source while invoked work is
pending; the older cases expected an immediate empty-result switch. Their mocked
`setMainView` also left the view outside the thread. The fixture now models the
actual thread view and distinguishes pending source from an already-accepted
result. The browse-back variant visits the pending turn and returns to the source
instead of selecting the already-open source, which is a no-op. All four cases
and final conversion/default-node/source-preservation assertions remain.
The combined navigation/reading-context suites passed 56/56, and the earlier
freshness/runtime focused suites passed 51/51 after package build preparation.

Both independent reviewers re-reviewed this assertion change and found no
weakening, removed case, or production defect. Their full-review assertions bridge
to final whole-PR binary diff
`b6cd43838f0f093226176c1343e7a616cd2dac3aee11c6d04286f5b27f8fdd53`.
The final full check invokes its JavaScript suites after this fixture edit; Rust
sources and their completed prerequisite stages are unchanged.

## Desktop integration findings and final source

The first pinned-Node full check and build passed. The assembled first-message
runner then exposed an obsolete immediate-pending-turn expectation, superseded by
READ-001. It now explicitly verifies pending source preservation before browsing
to the pending interaction and back, preserving the mounted-button proof.

Desktop evidence also found a real final-pane fit defect when returning to a
layer: render hid and reopened details within one frame, measured full-width
bounds while hidden, and ResizeObserver could see no net size change. The failed
Eval screenshot and geometry show a 606px graph pane with nodes extending beyond
its right edge. `openInspector` now fits only automatic cameras at the actual
closed-to-open transition after the existing selection/draft-save guards. Manual
cameras remain unchanged. This maps to IP-003 and READ-002: the existing real
workspace runtime fixture now models visibility-dependent bounds, checks complete
horizontal glyph containment on initial/return-layer render, and verifies cached
manual zoom on return. The original case failed in 568ms (643px center outside a
400px pane); the strengthened 73-test layout/runtime portfolio passed. Existing
`workspace-keyboard` draft-save rejection coverage remains, and no guard moved.

The runner's old close-pane pixel invariant was replaced with settled closed-pane
containment and unchanged canonical positions because main expands the graph and
refits automatic cameras. Narrow geometry now uses one settled snapshot for both
stage and camera; the previous sample was taken before responsive sidebar layout
settled. Narrow details change graph height (636 to 409px in preserved evidence),
so automatic refitting is correct. The replacement still requires unchanged width,
canonical coordinates, full containment, and unchanged camera when height is
unchanged. The machine result names distinguish these boundaries. No test case
was retired, no failure converted into an aggregate pass, and no manual Fit click
was added to bypass the overflow.

An intermediate Electron run returned `UnknownVizError` during screenshot
collection; its log and partial captures remain failures. One unchanged retry
continued to the responsive assertion above. A separate default-off capture error
is also preserved. These native capture errors are not graph/authority passes.

Final source-manifest digest:
`c60aa5cf848c7264144ceb9dd4409639a3afccfcbf9681806a7c965af204d989` (58 paths).
Reviewed whole-PR binary diff before evidence-only additions:
`a1c6c0e74c21a257c85b612991e62feee4b00716c28da9dc7c4f2b72649ac119`.
Both `/root/merge_ready_spec` and `/root/merge_ready_standards` independently
reviewed the final fit and test-subsumption deltas: PASS, no unresolved findings.
Their source bindings are workspace `2d2e9feeb3d2e556c16d228ba8867c9f6ca10817d39d690f535464d2e2ddd3d4`,
runtime test `6d61a90025268614ed85cae4102b01b8802b73a87125190dad324f5df1298817`,
and runner `7eaa1fea4857083a31ccdd0c9c48eebc69f6ccb289a1bbc4609749f31f23a8e5`.
These bridge their earlier full integrated Spec and Standards reviews, without
claiming independent execution of the final tests.

The final gated desktop inner receipt passed with no ancillary failures and zero
inference calls. It observes compiled control continuity, canonical conversion,
Product/Eval navigation, second occurrence after service reopen, and no extra
interaction from navigation. Native keyboard is explicitly unverified because the
declared skip-native-keyboard mode uses the production Send control.

## Final deterministic result and preserved concurrency failures

The final `npm run check` passed Rust/default/crash suites, runtime/package builds
and type checks, then failed 2 of 2,909 executed JavaScript tests (220 files passed,
2 failed, 1 skipped; 2,907 tests passed, 3 skipped). Both failing files are unchanged
against pinned main and the earlier complete passing check:

- `graph-search-client-parity-e2e`: the first empty-draft query returned the real
  `wall_time_exceeded` boundary error under the default 250ms query budget.
- `recursive-live-run-transport`: the fixture's timed SQLite writer overlapped
  the polling reader and returned SQLite 5, `database is locked`.

The unchanged two-file diagnostic run with `--maxWorkers=1` passed 12/12 in 1.95s.
No timeout, query budget, security check, retry policy or database behavior was
changed. This distinguishes concurrency-sensitive failures from the pane fix;
it is not a claim to have repaired their underlying timing sensitivity. The failed
aggregate remains failed. Fresh hosted required `check` must pass before merge.

The remaining exact check chain ran separately and passed: isolated secret boundary,
Python tests, receipt/native/contract lint and PRD readability. Final `npm run build`
passed. All final commands use the repository-pinned Node 22.23.2, and no paid
inference was invoked. These results are bound to `source-manifest.json`, not to
future source edits.

The last runner-only change adds its existing two-animation-frame paint wait to
the Product capture after reload, matching its Eval capture. Both reviewers
approved this exact one-line bridge to runner
`54e1b80ddce661ed357a3a61ca13b1ce54013eb9fadd05ef8afcc0279c7147b0`.
Default-off completed with `passed: true`, no ancillary failures and zero inference
calls after that change. The two failed capture logs remain; one passing run does
not establish that native compositor failures can never recur.

### Final native environment and assembled results

A subsequent background run stalled before the Product screenshot while waiting
for paint. Only that verified test Electron PID was terminated; user profiles and
apps were untouched. The fixture now explicitly shows/focuses its own window and
reasserts disabled background throttling after reload. Both gated and default-off
runs then completed with `passed: true`, no ancillary failures and zero inference
calls on the final runner. Background-throttled behavior and native keyboard
remain outside these runs' proof scope. The terminated log is retained.

Both reviewers approved the final runner hash
`081159e8a8d315b012c2ebaca7ef02693cd592b897d1eb800ba4d189df0ae097`.
The final project/restart runner adds failure-only geometry diagnostics, retaining
the original error even if diagnosis fails. Its hash is
`fdced4632dd4c3dd8e5e4fef9e0991bc48a1509110c255936cdb304eedb674dd`;
both reviewers passed this delta with no unresolved findings.

| Assembled entry | Final observation |
| --- | --- |
| Gated first-message | PASS: compiled invoke conversion, Product/Eval destination, reopen/second occurrence; `pr536-final-gated-visible.log` |
| Default-off first-message | PASS: legacy retained invoke and navigation; `pr536-final-default-off-visible.log` |
| Node-input | PASS, zero paid inference; `pr536-final-node-input-complete.log` |
| Interaction-context lifecycle | PASS, zero paid inference; `pr536-final-context-complete.log` |
| Project new-thread/restart | PASS: thread and layer-selection restart persistence; `pr536-final-project-probe.log` |

The project proof had two preceding hover timeouts before any graph existed.
Its later pass used identical input, timeout and assertions, with error-only
instrumentation. The native hover cause is unconfirmed, not claimed fixed. The
subsequent null-guard/original-error-preservation edit affects only failed
diagnostic collection, not the passing path. All three logs are retained.

`desktop-results.json` retains the actual final first-message receipts. `logs/`
contains the named original failed and passing outputs. `screenshots/` includes
the failed Eval overflow and corrected Eval graph, plus the visibly selected
second occurrence and its destination after reopen; these were visually inspected.
Fixture IPC warnings in broad runners remain visible; those runners do not claim
coverage for missing account/share/settings fixture handlers. The applicable
production layout/context/restart seams have their separate named proofs above.
