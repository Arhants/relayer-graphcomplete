# Bounded renderer image resolution

Base: `e6bb4bdd46c903f646bd8da8789d84ca978792ac`.

Checkpoint: opening a valid detail with distinct images must not decode every response concurrently. Preserve per-asset deduplication, fallback rendering, trusted control availability, and release ownership. Observe the actual renderer mount seam with gated resolvers; maximum two resolutions may be active while every image still completes. Existing repeated-asset and cleanup tests protect distinct cache/ownership boundaries.

Required verification: focused renderer tests, independent exact-source review, full check, desktop visual proof including build, fresh CI. No paid inference or release operation. Results recorded after execution.

## Executed evidence

67 focused tests passed. Independent source review is clean at the recorded hashes. Normal full check passed 2,361 Vitest tests plus 2 secret-boundary tests; build and desktop image proof passed. Screenshots match the previously inspected captures. The first full run had the intermittent recursive teardown failure; an isolated diagnostic passed. A diagnostic full run then exposed the diagnostic preload conflicting with a restricted filesystem subprocess. Minimal reproduction confirmed that instrumentation failure. The final normal command passed. All failures and logs are retained; no runtime deadline or assertion was weakened. Fresh CI remains required.
