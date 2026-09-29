# Attached workflow and V3 portability rollout — PR #604

This extends the earlier navigator-only snapshot. Its historical evidence remains in
`../default-interaction-navigator/README.md`; those source-review assertions do not
certify the expanded change. PRD §7.2B and ADR 0011 define current accepted snapshots,
not historical HTML replay. No test was deleted; replaced export-rejection assertions
are superseded by positive V3 behavior and invalid-shape/authority rejection tests.

## Required plan and changed executable seams

| Promise / failure boundary | Checkpoint | Production seam and deterministic observation |
| --- | --- | --- |
| Packaged and development Desktop prepare new native permissions by default; generic hosts retain opt-in | AN-001/008 | Desktop factory used by main; temporal-runtime spawn test observes process arguments; first-message default and explicit-off journeys |
| Old frozen preparations, missing grants, terminal and read-only contexts cannot gain authority | IP-001/002, AN-001/008 | `typed_permission_storage_is_immutable_and_unknown_versions_fail_closed`, `required_attached_navigation_preserves_old_and_disabled_preparations`, `typed_imported_invoke_cannot_gain_authority_through_writable_occurrence` in full check |
| Current roots never mix revisions during one export | AN-004 | Core multi-root read transaction concurrent-commit regression; authenticated batch route and runtime response identity/cardinality tests |
| Converted and attached navigation, current rich details and pinned assets survive export/import/re-export | AN-003/004 | Real graph/Product/Eval attached-portability E2E; export-contract and core import tests; missing V3 asset test |
| Imported provenance is inert; wrong conversion target/origin, root marker and execution remain denied | IP-003, AN-001/004 | Contract validators, import-owned conversion table, immutable imported actions and E2E send denial |
| Imported authored keys remain durable and collision-safe without changing package bytes | AN-003/004 | Import-owned key tables; real repeated-key E2E plus `imported_converted_invoke_reopens_as_inert_navigation_and_is_removable` (reopen, key projection, scope, immutability and cleanup) |
| Public compiled controls retain exact aliases and integrity without private authored keys | AN-004 | Share binding projection tests, public snapshot parser and real compiled-control E2E |
| Older formats and published shares remain readable; V3 never goes to an incompatible pinned viewer | AN-004 | V1/V2 contract suite, companion service reservation-version checks and paired artifact verifier |
| Navigator topology, pending statuses, root reset, Back, keyboard, approval and reopen | AN-005/006 | Navigator/controller tests plus native context, restart, approval, first-message and layout heavy entry points |

Required deterministic heavy gates: `npm run check`, `npm run build`, compiled Eval,
Prime visual integration, first-message in both modes, interaction-context lifecycle,
project restart, approval and interaction graph layout. Visual captures must be inspected.
The new E2E uses real graph and Product servers with deterministic fixture completions;
it makes zero paid provider calls. Hosted deployment and signed desktop release remain
separate operations. The service must deploy with the exact V3-capable viewer before a
desktop release publishes V3 shares. Neither a source merge nor local proof updates it.

## Implementation results and retained progression

- Initial expanded build passed after integrating `origin/main` at `f9ce3209b`.
- Focused core snapshot, batch route and runtime client passed; export contract 26,
  imported graph 16, node-detail renderer 50 and share bindings 6 passed at their
  respective implementation snapshots. Final source qualification remains pending.
- Default native first-message: inner passed true, typed permissions true, native
  keyboard true, required-navigation omission rejected and repaired, Product/Eval/reopen
  controls navigated, no ancillary failures, zero inference calls.
- Companion service: 103 tests and TypeScript passed, including exact contract parity.
  Its source is a separate PR; final paired artifact verification is pending.

## Retained failures and repairs

- Initial expanded full check caught one missed `ImportedAction` test initializer in
  the Ladybug search suite. Added explicit false conversion provenance; all-target
  Clippy passed afterward. This is not a full-check pass.
- Initial exporter focused run passed 32 and failed one because the new missing-asset
  error changed the established public error text. Restored that public text and added
  a separate V3 local rejection assertion; legacy local metadata fallback remains.
- Initial real portability E2E found duplicate authored layer keys across distinct
  native completions. V3 closures legitimately combine those scopes. The fixture is
  retained to verify portable identity and import behavior; V3 now preserves scoped authored keys with distinct portable identities. Import-owned key provenance retains exact compiled packages while storage keys remain unique. The same real fixture passes after repair.
- Native fixture setup previously depended on an environment flag instead of frozen
  input permissions; it now follows the actual production input description.
- Artifact builder refused dirty source as designed. No provenance guard was bypassed;
  final artifact verification waits for the tested source commit.

- Joined real runtime/Product/Eval portability E2E passed: converted invoke plus attached
  rich SVG controls, repeated authored keys, ordinary V3 export/import/re-export,
  inert imported history, public aliases and compiled navigation, and a second pure
  attached-edit journey without conversion provenance. Five fixture completions,
  zero provider calls; both journeys passed in 5.8 seconds.
- Prime visual integration: 2/2; compiled Eval runtime: 4/4.
- Explicit-off native first-message passed with typed permissions false and no ancillary
  failures. An earlier incorrectly named environment variable reran enabled mode;
  only the corrected `RELAYER_TEST_INTERACTION_PERMISSIONS=0` run counts as off proof.
- Interaction-context lifecycle passed its inner zero-inference success check.

The native reopened capture below was inspected: both existing and added buttons are
visible in Node Details, with the navigator present. This is local deterministic UI
proof, not signed-release or human acceptance evidence.

![Attached controls after reopen](attached-controls-after-reopen.png)

- Independent review found and repaired V3 root Reference backlinks incorrectly rejected
  as mixed arrivals. Rust contract 28/28 and public viewer 46/46 passed; nonroot mixed
  arrivals, V1/V2 behavior and expansion cycles retain explicit negative coverage.
- Review found imported V3 could downgrade when neither native mutation provenance nor
  converted/layerless actions remained. Re-export now retains the stored import version;
  V3 asset checks remain strict. Published import version storage has deterministic proof.
- Review found source-layer provenance outside the exported closure could index a missing
  mapping. Import now materializes inert provenance records and validates key conflicts;
  final core/E2E proof is pending. These records add no response topology or grants.
- Expanded full check next reached Product persistence and found an obsolete converted-
  export rejection expectation plus a no-accepted-root mock read. The expectation now
  observes real V3 export/share; empty root inventories need no graph snapshot read.
  An intermediate replacement test used the wrong decoder return shape and failed
  compilation; repaired before rerun. No passing full-check claim yet.
- Project restart evidence exposed unreliable pointer delivery. Focus-only and pointer
  movement retries failed; the driver is being repaired without removing hover assertions.

- Final joined portability fixture passed with real companion service handlers from
  [Relayer #411](https://github.com/vishaltandale00/Relayer/pull/411), source `fddecf52`.
  Desktop transport published actual V3 bytes, recovered a lost finalize response, and
  retrieved the immutable public HTML. No network publication occurred; backing storage
  and auth keys were isolated test fixtures. External source provenance and marker-free
  imported V3 re-export passed in that same run (6.36 seconds).
- Core imported suite 17/17 passed, including external provenance, missing target and
  provenance-only target rejection, immutable key ownership, reopen and cleanup.
- Product persistence 38/38 passed after the expectation/empty-root fixes. The input-
  draft scenario took over 60 seconds under host load; no timeout or assertion was removed.

- Public V3 Chromium capture passed four cases: light/dark at desktop/mobile sizes,
  pinned SVG available, both converted and added controls enabled and navigating to
  their exact destinations, URL unchanged and no external network requests. Captures
  were visually inspected. Initial hidden-window capture returned blank painted frames
  despite functional checks; showing without focus and waiting two frames repaired
  capture synchronization. The earlier output is not counted as visual proof.
- Full check attempt 3 was interrupted by SIGTERM during graph query conformance when
  this chat received a new user turn. Completed test output is retained; the whole
  command is not a pass. A clean full rerun is in progress.

![Public V3 on mobile](public-light-mobile.png)

- Final project restart runner passed inner `passed`, `restartPersistence` and
  `layerSelectionRestartPersistence` with all original hover, focus, draft and selection
  assertions retained. Its driver uses hidden Electron windows and consistent Chromium
  pointer dispatch. Unexpected earlier visible-window closes remain unexplained; user
  confirmed no manual closing. The repair avoids foreground interference and does not
  certify physical OS pointer input. A painted hover capture was inspected.
- Native approval runner passed: accepted final status, queue/history/layout/session-grant
  assertions and zero inference calls. Layout runner passed bounds, resize/sidebar,
  scrolling, selection, dismissal, light theme, active origin and legacy placement.

## Final independent source review

Manifest `source-manifest.json` contains 54 changed source/test/spec files; evidence
outputs and this ledger are excluded. SHA-256:
`a9cebb9972d6e712e4563839c35b1e5a1d53476792be18c3d6d4092f30b46c9d`.

- `/root/navigator_standards`: all hashes verified; PASS for standards, imported
  authority/provenance, current export coherence, test subsumption and PRD/ADR mapping.
  Independently reviewed the hidden-window/CDP driver; no assertion weakening and no
  unresolved source findings.
- `/root/portable_import`: all hashes verified; PASS for coherent export snapshots,
  asset failure boundaries, public aliases, Desktop policy, V3 Rust/JavaScript validation,
  compatibility and capture mapping. Native project driver excluded from this review.
  No unresolved source findings. This reviewer did not certify its own import changes.
- Companion `/root/navigator_review`: PASS on 11 changed service files at commit
  `fddecf52b03e542659cd74b887d1b77503de185c`; authority, privacy, format versions, pinned
  old reservations and immutable shares; no unresolved findings. Manifest digest
  `a39e1db55dea8435ee0162797463e6a087ac3281d61ac58292f57daeb4ec9ae0`.

These are source assertions and separately mapped observations, not release certification.
Any manifested source change invalidates the matching assertion. Paired viewer artifact
identity and verification are recorded on the PR after its clean source commit exists.

## Final qualification

`npm run check` completed successfully: workspace Rust, crash reconciliation, all-target
Clippy, package builds/type checks, 240 Vitest files passed and one skipped (3,225 passed,
three skipped), both secret-boundary tests, all 60 Python tests, receipts and PRD lints.
`npm run build` passed afterward. The receipt's upstream-artifact NO-GO wording is retained;
this is not upstream bundle or release certification.

Final default/off first-message runs passed their inner checkpoints with native keyboard
true, no ancillary failures and zero inference calls. Default mode also verified required
navigation rejection/repair and reopened controls. Compiled Eval passed 4/4 and Prime
visual integration 2/2. A final context rerun failed at its focus prerequisite; the fixture
now requests web-content focus after the production workspace has loaded. Its subsequent
standalone result is recorded below; this fixture-only delta follows the full-check run.


The final context rerun passed with zero paid inference calls. Both reviewers reverified
all 54 final hashes after the three-line fixture focus repair. No production source changed
after the successful full check/build. CI must qualify the exact pushed head separately.

Reproduce public visual proof with the joined test's
`RELAYER_ATTACHED_PORTABILITY_CAPTURE=docs/evidence/attached-workflow-rollout/synthetic-snapshot.jsonl`,
then `RELAYER_CAPTURE_ATTACHED_PORTABILITY=1 npx electron scripts/capture-attached-portability-evidence.mjs`.
The optional `RELAYER_PRIVATE_SHARE_SERVICE_ROOT` points at the companion checkout for
in-memory production-handler publication proof. Neither command publishes a live share.
