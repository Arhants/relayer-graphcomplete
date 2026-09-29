# Second review corrections for PR 560

Base: `c5820a6bb86c4d23b39801fb78a0b9f53c033852`. Product meaning remains PRD 7.2B, READ-001 and ADRs 0011/temporal-current. These five corrections preserve those promises; they add no graph authority, scheduler or response-selection policy.

## Required plan and changed seams

| Finding | Promise / boundary | Production observation |
| --- | --- | --- |
| Presentation reread loses own drafts | AN-002/003: stale repair uses accepted controls plus caller pending controls, without another caller's draft | Existing concurrent replacement/reopen scenario now repairs from reread inventory; exact IDs include winner and self, exclude third caller |
| Cross-chat graph selection retains automatic follow | READ-001 / AN-006: explicit navigation cancels result-follow intent before asynchronous work | Real controller deferred POST and owner load; automatic intent must be false, Back and later refresh retain old reading selection |
| Active origin blanks workspace | AN-006: selection loads response root; active current is not terminal response | Production workspace disables active-origin card; same-thread known-current/no-response and cross-thread authoritative no-response reads preserve workspace/history; layout runner captures disabled card in light/dark |
| Generic layerless capability compilation | AN-001/003 and ordinary source-layer provenance | Ordinary builder/checkpoint/submit reject layerless navigation before and after replacement; dedicated replacement compiles without seeding finalization; exact binding assertions retained |
| Repeated metadata timeouts | AN-005: incomplete provenance stays truthful without indefinite extra B3 projection work | Real thread-detail and state routes with 20 turns and pending metadata; advance time once, return all turns and incomplete empty sources with one metadata request |

Secondary seams: Python-to-Prime replacement now carries a dedicated target/revision operation through the real TS replacement method. Python emits no direct replacement HTTP envelope. The bridge test verifies the actual host POST has only expectedRevision/authoredDetail and retains old/new binding provenance; ordinary checkpoint/submit remain strict. Three package-admission hashes follow the production Python `.py` digest. The layout fixture retains all previous bounds, selection and legacy assertions while adding nonselectable-origin screenshots.

The five-second deadline bounds only additional B3 enrichment for the whole response. It is not a new end-to-end endpoint SLA: pre-existing workspace reads keep their own timeouts. Expiration starts no further metadata reads; previously completed scope-checked projections remain, while an unfinished turn reports incomplete sources.

Required final checks: full `npm run check`, `npm run build`, gated/default zero-inference first-message, context lifecycle, project restart/selection, compiled Eval, Prime integration and interaction-graph layout evidence. Native keyboard remains outside the declared first-message skip mode. No paid/live inference or release proof. Independent Spec/authority, Standards and renderer/evidence reviews must pin the exact source manifest. Planned tests are not results.

## Reproduction and focused results

Baseline reread failed because its inventory omitted the caller action. The delayed-POST regression reproduced automatic following remaining true; the active-origin scenario reproduced a null workspace; ordinary layerless checkpoint incorrectly compiled. The 20-turn route failed to settle after one advanced metadata timeout. Earlier fixture attempts using an unavailable private pending map / pre-refresh pending value were corrected to observe the real public controller sequence; history canonicalizes the restored selected node ID to a string. These fixture errors do not certify production behavior.

Rust compilation initially encountered ENOSPC before executing the latency test. Only this checkout's disposable target/debug/incremental cache was removed; source and live profiles were untouched. The test then reproduced the actual latency failure in 2.10 seconds, and both corrected graph-projection scenarios passed in 0.22 seconds. All nine attached-navigation scenarios passed. The seven focused JavaScript suites passed 146 tests, and Python passed 60. Existing positive layerless binding coverage now observes the dedicated replacement transport with the same exact binding assertions; separate before/after ordinary-submission negatives protect cache isolation. No tests or capture assertions were deleted.

Final source and full/heavy results follow separately after qualification.

The first full check passed preceding Rust suites but caught an older route assertion expecting an empty authoring inventory after drafting. The test now requires the exact caller-owned pending action and separately verifies ordinary layer reads exclude it before publication. The focused real route passed. This test-only addition changes the source manifest to 22 files (`91ed1beb30f0ce5467bc4c91528e1f33472feca98abfc075c71506b1a2bb85bf`); the preceding 21-file review snapshot is superseded. The failed full-check log is retained and a new full check runs on the final source.

The next full check passed all ordinary Rust suites, then compilation of the crash-test-support variant failed with ENOSPC while writing a liblbug archive. Immediately afterward the filesystem reported 19 GiB available. The raw failure is retained in `check-disk.log`; the exact transient disk consumer is not established. A source-identical retry limits Cargo build jobs to one to reduce peak simultaneous artifact usage. This is a build-resource control, not a test, timeout or coverage change.

## Final source results

Final `npm run check` exited 0 on all 22 manifest hashes at `91ed1beb30f0ce5467bc4c91528e1f33472feca98abfc075c71506b1a2bb85bf`: all Rust/default/crash suites, workspace/types, 3032 JavaScript tests passed (three skipped), native credential-boundary 2/2, Python 60/60, receipt and PRD checks. Build concurrency was one; Rust test concurrency and Vitest workers were two. No assertion, timeout or coverage changed for resource control. The final source hashes were reverified after completion. Build and heavy results are recorded separately below.

`npm run build` exited 0 on the same source. All seven declared heavy entry points exited 0 (`heavy-results.json`): gated/default first-message inner markers passed with no ancillary failures and zero inference calls; context lifecycle passed with zero inference; project restart and layer-selection persistence markers passed; compiled Eval passed 3/3 and Prime integration passed 2/2. The layout runner passed all 13 captures plus interaction/legacy assertions. Primary-agent inspection of the new active-origin light and dark images confirms readable running status, retained graph topology and preserved workspace; the runner asserts the card is disabled and clicking changes no selection. Native keyboard remains unverified in the declared skip mode. Fixture IPC missing-handler warnings do not certify those integrations.

Required-control image inspection: Product 12 and reopened Product 14 show both retained and required controls. Eval 13 shows the Attached response destination instead of the pre-click controls. Its DOM visibility/activation and exact-destination markers passed; the screenshot does not prove visible controls. The capture discrepancy's cause remains unknown and differs in surface from the prior batch. No all-screenshots pass or capture repair is claimed. The unchanged first-message capture helper awaits capture/write before activation; an unawaited-click explanation remains unsupported.
