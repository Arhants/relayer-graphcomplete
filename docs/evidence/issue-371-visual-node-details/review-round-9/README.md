# Require prepared content for authored image pins

Base: `d9438f851ef765158ff985257699e01648cabcc9`.

Checkpoint: every public graph-writer replacement entry point must reject a nonempty canonical asset inventory when prepared snapshots are absent. Rejection must precede draft mutation. Preserve asset-free packages, exact prepared inventory validation, and retain/clear semantics. Exercise the real writer API; do not rely solely on HTTP admission.

Required verification: focused regression, independent exact-source review, full check and build, then fresh CI. This core acceptance boundary changes asset publication and therefore the desktop visual proof is also required. No paid inference or release operation. Results recorded after execution.

## Executed evidence

Independent standards/spec review is clean at exact source hashes. Focused authored-detail tests passed 7/7; graph database suite passed 75/75. Full check passed on its first run (2,361 Vitest, 3 skipped, plus 2 secret-boundary tests and all native/repository checks). Build and desktop visual proof passed. Original/imported screenshots match previously inspected captures. Fresh CI remains required before merge.
