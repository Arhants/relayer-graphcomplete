# Issue 544: Versioned setups and calibration lineage

Authority: PRD §13.2.4 and issue #544's approved 2026-09-30 decision.

## Required verification plan

| Checkpoint | Changed executable seams | Deterministic boundary |
| --- | --- | --- |
| CAL-001 | SetupRegistry publish/select/persist/reopen; human feedback snapshots | `test/eval-setup-registry.test.mjs`: revision/predecessor validation, immutability, independent kinds, exact historical feedback, corrupt state and persistence rollback |
| CAL-002 | Actor preflight, HumanTaskService creation/export; EvalService initial/import/rerun pins; local graph judge; native prompt substitution and disabled filesystem/delegation authority | `test/eval-setup-registry.test.mjs`, `test/eval-service-simulated-user.test.mjs`, `test/eval-imported-review-judging.test.mjs`, `test/simulated-user-electron-adapter.test.mjs`, `packages/eval-runner/test/simulated-user-judge-runner.test.ts` |
| CAL-003 | Dashboard operations; actor and judge projections | `test/eval-setup-registry.test.mjs`, `packages/eval-runner/test/simulated-user-judge-runner.test.ts` disabled shell/delegation and rejected command trace, existing `test/eval-task-actor.test.mjs` scoped actor capability and judge-only tests |
| CAL-004 | CalibrationService freeze/persist/reopen/export, immutable task/matrix source exports, human native labels, partition and feedback-contamination checks | `test/eval-setup-registry.test.mjs`: frozen snapshots, native scales/subjects, later annotations, disjoint partitions, failed-write rollback, held-out publication without setup-store mutation, idempotent evidence exports; `test/eval-service-simulated-user.test.mjs`: original immutable matrix evidence |
| CAL-005 | Pinned comparison pair/set, actor case/profile/harness/model/endpoint/budget checks, native graph criterion/result/coverage agreement; explicit human promotion | Same tests: human realism independent of satisfaction and target agreement; compatible native v11 agreement, legacy/incomplete results remain unknown; saved results and earlier runs unchanged |
| CAL-006 | Dashboard publication, actor setup selection, promotion, frozen set/comparison and explicit actor-arm controls | `npm run test:eval-web` inference-free setup/calibration chapters plus existing nine chapters |

Required heavy gates: `npm run check`, `npm run build`, `npm run test:eval-web`, `npm run test:eval-compiled-runtime`. Run tests freshly; build caches are acceleration only. No paid inference is authorized. Preview/Stable release proof is not due.

All three increments are implemented. Comparison creation and evidence recording spend no inference. Explicit actor-arm and graph-judge buttons use the existing task or judge-only execution routes and their authorization; they do not execute a dataset automatically. Humans rate actor realism after a finished task. Graph agreement compares independently produced native v11 criterion scores with frozen human labels on their matching scale. No cross-scale conversion or aggregate pass threshold is introduced. Manual promotion is available independently of calibration and remains a human default-selection decision, not an automatic quality claim. Graph-presentation setups remain v11/v6. Versioned judges disable shell/filesystem and delegation tools to isolate target labels; their available artifact boundary is bounded host evidence. Overall trajectory judging and observers remain undelivered. Judge initial/import selectors and the explicit judge-arm UI handler have service/adapter coverage and source review, but no dedicated browser chapter; their end-to-end control proof remains unverified. No tests were deleted.

## Executed verification and evidence

Verified source scope: [review-scope.txt](review-scope.txt), digest `ca81a4f246fb10495e742f3769ffd08d3db103f726ee9e64481cd7b7b62c8a24`. The digest hashes sorted changed paths, a NUL delimiter, and each file's binary SHA-256; evidence records themselves are excluded. Tests ran freshly on macOS arm64. A verified, Cargo-pin-compatible Ladybug artifact accelerated compilation; native binaries were rebuilt in a private target directory. No existing live profile or primary checkout was used for proof.

| Actually executed | Observed evidence |
| --- | --- |
| `npm run check`, bundled Node 24.19.0 | PASS: all Rust workspace and crash-reconciliation result blocks passed; type/workspace checks passed; 245 Vitest files passed, 1 skipped; 3,304 tests passed, 3 skipped; separate secret-boundary 2 passed; Python 60 passed; receipt lints and PRD readability passed |
| `npm run build`, local Node 25.9.0 | PASS: native app/graph builds and root/workspace TypeScript/package builds completed |
| `npm run test:eval-web`, local Node 25.9.0 | PASS: every named [browser chapter](browser-chapters.txt), including real dashboard setup publication, selection, promotion, frozen set, independent actor comparison, explicit actor arm, export/reopen, and existing lifecycle/authority chapters |
| `npm run test:eval-compiled-runtime` | PASS: 4 recursive fixture tests exercised the compiled external entry point |
| Focused service/adapter/import/native portfolio | PASS: 88 tests across 5 files; subsequent native forbidden-shell checkpoint 10 passed; canonical optional-field persistence and setup-selector portfolio 10 passed |

Retained failure: a full check under local Node 25.9.0 passed 3,303 Vitest tests but failed the existing exact-port IPv4 egress test with `ERR_ACCESS_DENIED` for `127.0.0.1`. The same test passed under bundled Node 24.19.0, followed by the full successful Node 24 check. Earlier edit-loop failures included a missing private `target/debug` path, an outdated selector fixture, a browser refresh race, and optional undefined control fields changing shape on reopen; those were diagnosed and corrected before this verified snapshot. They are not pass evidence.

[Log digests](verification-log-digests.json) identify the local execution logs; chapter outcomes and counts above record the inner results rather than relying only on outer exits. [Setup lineage screenshot](setup-lineage.png) and [actor comparison screenshot](actor-comparison.png) were captured from the passing inference-free production browser scenario. The 2/3 realism scores are fixture human inputs, not empirical model-quality findings. Native/live model calibration, judge UI end-to-end control proof, trajectory judging, and observers are unverified or undelivered as described above.

Adversarial review assertions for the PR: `/root/calibration_authority` reviewed this exact digest for execution pins, privacy/authority, feedback lineage, partitions, native scales, completeness, historical immutability, and promotion: no unresolved findings. `/root/calibration_evidence` reviewed the same digest for changed-seam/checkpoint mapping and evidence scope: no actionable mapping gaps within declared coverage; judge UI end-to-end proof remains explicitly unverified. Both are read-only source reviews, not runtime evidence. These assertions are non-certifying without their PR record and invalid if any scoped source changes.
