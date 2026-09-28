# Concurrent execution-lease reconciliation

The app server's direct cleanup and background reconciliation can read the same
outstanding debt before either acknowledges the provider release. A shared,
per-attempt guard now covers debt lookup, provider DELETE, and acknowledgement.
Busy callers return unresolved and use the existing retry path. The guard drops
on success, failure, or cancellation; it never changes durable debt itself.

## Checkpoints and executable seams

Product authority: PRD PROV-003 (removal and recovery without a second release)
and PROV-004 (execution-access lifetime). No product decision or eligibility
rule changes. The changed seams are ProductService's shared in-flight guard
and `reconcile_terminal_execution_lease`'s busy outcome.

| Checkpoint | Deterministic production-seam test |
| --- | --- |
| Concurrent clones send one DELETE while the first response is held; another attempt progresses independently; acknowledged debt sends no new DELETE | `concurrent_terminal_lease_release_is_coalesced` |
| Cancelling the cleanup caller releases its guard and preserves retryable debt | `cancelled_terminal_lease_release_can_be_retried` |
| Provider failure preserves debt and allows retry; an already-absent provider lease can be acknowledged | `terminal_lease_reconciliation_retries_release_and_accepts_host_absence` |
| Quarantine/reopen settles accepted output without releasing again | `opening_a_quarantined_thread_accepts_its_attempt_without_releasing_again` |

The first two tests share a fixture but cover distinct success and cancellation
boundaries. The existing failure test remains necessary. No tests were removed.
The fixture uses real SQLite, ProductService, reconciliation, and RuntimeClient;
only the HTTP provider endpoint is faked. Notifications control overlap; timeouts
bound hangs and never count as a pass.

## Verification commands

```sh
cargo test -p relayer-app-server --lib terminal_lease
cargo test -p relayer-app-server --test product_persistence_flow opening_a_quarantined_thread_accepts_its_attempt_without_releasing_again
npm run check
npm run build
```

These commands are the required plan, not by themselves evidence of a pass.
The original ignored diagnostic observed two overlapping requests in three
consecutive runs. The enabled regression failed before the guard was added.
After the fix, all three focused lease tests passed (0.24 seconds).

The original quarantine/reopen integration test also passed (4.01 seconds).
Both full-check attempts passed formatting and Clippy, then stopped in the app
server library suite. The default run had 287 passes and three Git-inspection
failures; `RUST_TEST_THREADS=4` had 288 passes and two failures. The remaining
failures were `repository_identity_allows_selected_subdirectories_and_linked_worktrees`
and `shadow_worktree_diff_supports_sha256_split_indexes`, which observed
`Unavailable` instead of `Git`. The first run also observed `git_timeout`
instead of `git_failed` in the missing-object inspection test. Repository
inspection has a two-second deadline; machine load averaged about 40 during
these runs. The repository-identity test passed alone (2.91 seconds).
This is evidence of timing sensitivity, not a full-check pass. Later stages of
`npm run check` were not reached.
`npm run build` completed successfully in a separate invocation, including both
Rust servers, the root TypeScript build, and all four workspace package builds.

## Source review

Reviewer `/root/review_mapping` found no unresolved correctness, checkpoint,
or test-subsumption findings for the following source snapshot. This is a
non-certifying source review without a PR; it does not replace test evidence.

```text
crates/relayer-app-server/src/app_server.rs
22b9a21840354bc395c66f76efe51d48bfbbd72b6946ef0696e0a7c6b4367194
crates/relayer-app-server/src/product/service.rs
aeaf32cf2db617938c4bdf720da8620e40517a29ba1e1eae3412ccc2d9b11d10
crates/relayer-app-server/src/storage/sqlite/attempts.rs
b384f7f757b133a96592d75c4b89f1a371251041214fe0b668e51745c3744b48
```

## Limits

This is in-process exclusion among clones of the app server's ProductService.
It is not cross-process exclusion or exactly-once network delivery. A crash,
cancelled response, or failed durable acknowledgement can still require an
idempotent provider retry. This reproduction does not identify which original
caller pair caused the intermittent quarantine-test failure.

No paid-provider, packaged-app, or real Desktop restart proof is claimed. The
change introduces no new UI or restart protocol.
