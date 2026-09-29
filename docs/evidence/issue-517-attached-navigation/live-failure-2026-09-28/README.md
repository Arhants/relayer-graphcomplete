# Live generation and post-check failure

Generation source: `63992a635b50ef6b2368e50ca4d0c283d13f862dec7df8e2542990fb72901447`. The production Codex Basic harness used GPT-5.6-Sol and the standard managed subscription route in a new persistent profile. Both root interactions were accepted on attempt 1. No third completion was requested.

The driver then failed its both-occurrence assertion. The source root in the thread response retained actions 6 and 7; a direct child read showed original invoke 6, reference 11 to response root 9, and expansion 12 to checklist 8. Fresh backend reopen reproduced stale thread output versus canonical root actions 6, 7, 11 and 12 with zero execution requests. These files preserve that failed source state.

Two pre-inference setup failures are separately preserved: a required readiness callback was missing, then the profile's existing model-family name conflicted. The operator driver was repaired to use the production callback and reuse its exact matching family. Neither setup failure launched inference.

## Draft repairs within the two accepted attempts

The model repaired compiled-detail helper calls and retained invoke identity before terminal submission. In the second interaction it also encountered `reference_layer_authoring_restricted` after staging the attached backlink. The writer treated even the already-established response root as reference-only, although terminal validation exempted that root. The model temporarily changed the draft order/relations, authored the remaining control, and restored the reference before acceptance. This was same-attempt repair, not first-pass tool success or an additional completion.

Deterministic regressions reproduce the stale Product root and reverse-order root authoring failures. Their red logs are preserved here. The fixed writer uses the exact canonical root identity; ordinary draft ownership, non-root reference restrictions, mixed arrivals and cycles remain. The fixed Product reader requests bounded canonical mutation membership and refreshes affected roots only. Further checks and zero-inference replay are recorded separately; model generation is not retroactively attributed to that later source.

## Recovered trace limitation

The driver failed before normal export and closed the runtime. The two completed, policy-sanitized harness spools were copied byte-for-byte from this run and validated against their original manifest SHA-256, byte length and event counts (396 and 633). A scan found no provider-key, private-key, bearer-value, JWT or user-home-path patterns in those event files. Native credential files and native session artifacts are excluded.

This is recovered spool evidence, not a successful supported trace export. The host's export index and graph-operation recorder were in memory. Reopening the same trace store would clean abandoned spool data, so it was not done. Original graph-operation recording is unavailable; it is neither reconstructed nor claimed complete. The preserved harness events still contain the model's tool rejections and repairs. Durable execution/attempt receipts and later zero-inference replay provide separate evidence.
