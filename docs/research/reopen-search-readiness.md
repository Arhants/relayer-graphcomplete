# Reopen search publication readiness

Base: `bebda510ff78a265ca348b44857ab74b27d79179` (live `origin/main`, includes PR #494).
Scope: Rust completion publication and target-local Ladybug readiness; no model defaults, Prime bridge, provider failure attribution, deployment, or paid inference.

## Diagnosis

Ordinary Return copied `plan.root_action()` into its search publication after accepting SQL records. The plan retained the action's draft state. SQLite and Ladybug revision receipts matched, but Ladybug's root `EXPANDS` relationship had `state = draft`; the canonical rebuild snapshot reads `state = accepted`. Thus startup inventory comparison detected a logical mismatch even after an ordinary successful save. This is an inventory mismatch, not evidence of a numeric revision mismatch or Issue #429's startup reconciliation defect.

The new `ordinary_return_reopens_without_logical_repair` regression failed before the correction: actual normalized relationship state was `draft`, expected `accepted`. Return now reloads the root action from its canonical transaction after finalization. The regression checks matching revisions, accepted relationship state, and immediate Ready on ordinary reopen.

A genuine damaged target can still need background rebuilding. Completion publication now waits on that target's readiness notification before taking the publication barrier or SQLite transaction. It retains the per-target ordering guard. Rebuild never needs that guard, and unrelated targets proceed. The existing five-second search budget bounds readiness and subsequent indexing together; it does not bound total submission latency including ordering and lock queues. Dropping the readiness future publishes nothing. Stop/Fail bypass the readiness wait; the delayed publisher revalidates authority, lifecycle, and revision transactionally. CanonicalUnknown remains eligible for existing exact-publication recovery; failure stays closed. No search bypass, scheduler, sleeps, or retries were added to production.

## Product promises and executable seams

Authority: PRD 11.9 (per-target readiness, searchable acknowledgement, canonical SQLite) and ADR 0008 (atomic current transitions, authority epoch cutover, terminal states); ADR 0005 governs invoke's sole accepted-action target transition.

| Changed seam / checkpoint | Deterministic production-seam coverage |
| --- | --- |
| Completion Advance/Return waits before publication/SQLite locks; no partial output | `completion_waits_for_target_rebuild_without_blocking_other_targets` uses real HoldLogicalRebuild and actual `writer.complete` |
| Unaffected target progresses; release yields searchable acceptance | Same scenario accepts another thread while repair is held, releases repair, and queries the accepted target immediately after acknowledgement |
| Bounded wait, dropped future, revoked authority and Stop cannot publish later | `readiness_wait_deadline_drop_and_authority_changes_do_not_accept` checks no output/current after successful rebuild |
| Failed background repair wakes pending submit without acceptance | `failed_rebuild_wakes_pending_submission_without_acceptance` changes the active pointer so real rebuild validation fails |
| Canonical accepted root action reaches Ladybug, ordinary reopen needs no logical repair | `ordinary_return_reopens_without_logical_repair` |
| Real Product restart/follow-up/invoke retains saved graph/presentation | Adapted parent scenario in `test/first-message-composer-integration.test.mjs`; actual graph/app servers and host, zero-inference provider fixture |
| Existing crash, canonical-unknown recovery, corpus, temporal/authority boundaries | Required `npm run check`, including `check:graph-crash-reconciliation` |

No tests were deleted. Existing logical-damage tests cover query readiness and corruption; new tests cover submitting while repair is held. The small draft helper extraction preserves the existing second-target fixture. The process test polls Product completion state as before; it adds no submit retries or rebuild timing sleeps. New-thread V3 activation and promoted configuration compatibility remain the parent rollout's proof, not this branch's claim.

## Verification and review

Required plan: focused real lifecycle and process regression, `npm run check` (full deterministic fallback and heavy crash/corpus portfolio), `npm run build`, adversarial review. Release/signed/native other-platform and paid proof are not this local implementation context.

Reviewed executable/test diff SHA-256: `e11cb8ac912d07198f0cc5c5d5b2ce89a5788ed3933ec353a1eb6bf48000fb8b` (`git diff` against base, excluding this report).
Reviewer: `/root/review_readiness`. Reviewed readiness/locks/deadlines/authority, canonical root-action correction, all new lifecycle and process tests. Verdict: no blocking findings; budget caveat above. `git diff --check` passed. No PR exists, so this is explicitly non-certifying review evidence.

Actual results:

- Root-cause falsifier: failed as expected before root-action correction, `draft` versus `accepted` relationship state (`/tmp/readiness-root-cause.log`).
- `cargo test -p relayer-graph-server --features crash-test-support --test ladybug_search_lifecycle`: 23 passed, zero failed (`/tmp/readiness-lifecycle.log`).
- `npx vitest run test/first-message-composer-integration.test.mjs`: 2 passed, zero failed (`/tmp/readiness-first-message.log`).
- `npm run build`: passed (`/tmp/readiness-build.log`), Node 22.23.2.
- `npm run check`: **aggregate failed on local dependency setup**, not a green full gate (`/tmp/readiness-check.log`). Rust formatting, all-feature Clippy, workspace tests, crash reconciliation/corpus/lifecycle tests, package builds and TypeScript checks passed. Vitest reported 179 files passed, 2 failed, 1 skipped; 2,358 tests passed, 17 skipped. The failed suites were Electron install and Ladybug native source integrity.
- Electron failed during parallel first-use installation (`File exists`); the installed binary subsequently reports 43.0.0. Targeted `test/telemetry-evidence.test.mjs` then passed 2/2 (`/tmp/readiness-telemetry-recheck.log`).
- Shared Cargo registry `lbug-0.18.0` contained extra `.cache/lbug-prebuilt` files. All published files exactly matched the cached archive, whose SHA-256 matches the checked-in contract (`f52ee74966e323212747aa22fa8c01f73f1cbbb996187c3b08cbf96ff9f67562`). The shared cache was not modified. With an isolated Cargo registry containing a pristine extraction of that archive, `test/ci-lbug-artifact.test.mjs` passed 14/14 (`/tmp/readiness-artifact-pristine.log`). This is a targeted repaired-environment pass, not a retroactive aggregate pass.
- Remaining stages after Vitest were run explicitly: Codex secret boundary 2/2, Python 29/29, Ladybug receipt lint, and PRD readability all passed (`/tmp/readiness-remaining.log`).

Remaining integration limitation: the parent must combine this commit with its compatibility/trace/default changes and run its full old-pin/new-V3 promotion scenario. This branch deliberately uses unchanged baseline Codex settings and does not certify the promotion, the Prime bridge, provider attribution, signed release, or paid model behavior.
