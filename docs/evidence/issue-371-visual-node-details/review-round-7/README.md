# PR 494 compatibility and authority follow-up

Base: `d1a45f2e763916c0b6450d5836eae0b01891689e`. Eight delayed review findings require the checkpoints below. This is verification work for existing product promises, not production default activation.

| Changed seam | Checkpoint and deterministic observation |
| --- | --- |
| Streaming archive validator | Retain digest metadata, not full base64 payloads already staged in SQLite; export contract tests. |
| Portable archive protocol | Ordinary V1 remains readable; image content uses V2 and is rejected under V1; export contract and roundtrip tests. |
| GraphWriter asset reads | Active authority and visible node are both required in the read transaction; graph-server import visual-asset test calls the real scoped writer. |
| File ingestion ownership | Buffer-backed caller mutation cannot alter queued durable bytes; visual-assets regression. |
| Generic resolver admission | At most 32 unique bounded identities before lookup; bridge regression observes zero lookups on invalid input. |
| Context preview image resolution | Use the context node's presenting interaction/layer after navigating elsewhere; renderer production-seam test. |
| Review accessible names | Native labels hidden by ancestors do not replace the compiler-approved fallback; renderer runtime test. |
| Native package closure | Exact locked Sharp addon, matching metadata and required libvips loaders/binaries; desktop packaging fixture rejects pruned/stale artifacts. |

Required verification: focused tests during edits, full `npm run check`, `npm run test:desktop:visual-node-details` including build, and fresh complete CI including macOS packaged verification. The actual Windows package remains outside this local execution context; Windows fixture verification does not claim a Windows launch. No paid inference or release operation is included. Independent reviews must bind final file hashes. Results are recorded after execution, separately from this plan.

## Executed evidence

Full check passed: 2,353 Vitest tests, 3 skipped, plus 2 secret-boundary tests; native, type, Python, receipt and readability checks passed. Desktop proof including build passed. The real image-bearing archive declares V2 and imports successfully. Original/imported screenshot pixels match the previously visually inspected round-6 images. Exact source hashes and independent clean review assertions are recorded here. Fresh complete CI is still required before merge.
