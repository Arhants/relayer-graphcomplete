# Actual Desktop root completion and zero-inference replay

Source: `96530c5d31b0ca26d146a3ce7313246f4e57b5e8bee9384e3c99cc2a787f53f4`. The final authorized call used `productTemporalFeatures()` with all five flags, managed Codex 0.147.0 SHA `19c4f144c5226a9f17c58e6f0fa854843b0f77a6eb420f40e2745a12f10f5d37`, GPT-5.6-Sol through Codex Basic/subscription, and the same isolated persistent profile. Exactly one provider acquisition occurred. Three total accepted attempts exist; no fourth call or recursive child ran.

Interaction 3 / graph node 31 was accepted. A supported complete trace export (200 events) was saved while the originating host and graph-operation recorder were alive, before semantic checks and teardown. This differs from the recovered spools for the earlier two compatibility-config calls.

## Corrected driver expectation

The original repair driver then failed waiting for a root `completion_executions` row. That expectation was incorrect: production reserves these rows in `launch_prepared_child` (`crates/relayer-app-server/src/api/threads.rs`, reservation near line 1578), gated by invocation metadata and the completion broker. The declared recursive-live runner (`scripts/run-recursive-live-run.mjs`, lines 445–470) waits only for `invokedCompletionIds`, not root calls. Thus zero child execution rows is expected here, not a missing required root receipt. The failed assertion and failure JSON remain intact; no runtime implementation was changed to manufacture a receipt.

Fresh readback separately verified the durable three accepted attempts, original node identity and semantic text, all three prior action IDs/kinds/clientKeys/source provenance, the fourth Reference to the new response root, full compiled detail, and current root/direct root/reused-child projection. Supported trace and canonical graph output establish the root result; recursive execution proof is not claimed.

## Visual evidence and limits

Production renderer browser fallback verified all four mounted controls, new Reference destination, expansion, three interaction cards and two causal context edges, Back, and backend reopen. Screenshot/video receipts record zero inference and unchanged counts. Native keyboard and Desktop account flow are unverified. The generated original invoke label wraps awkwardly in its narrow button; this is visible model-authored presentation, retained for human review. No visual-polish approval is implied.

The first two generations used the earlier compatibility configuration/source, documented separately. This final call and its visual replay used the exact source above. The subsequent project-test-only repair does not alter production runtime behavior.
