# Prime image capability repair — 2026-09-27

The live run on 239782d3 rejected image inspection before provider execution.
OpenRouter discovery advertises image input for qwen/qwen3.8-max-prime, but the
Prime model adapter unconditionally declared text-only input. The native
attach_image skill checks run-selected model.info before reading images.

## Required checkpoints and changed seams

PRD production harness capability contract: preserve discovered image input
support without guessing from model names. Unknown support remains text-only.
Provider discovery, execution-access validation/freezing, and Prime selected-model
construction are the three changed executable seams.

- Provider fixture covers image/video/text and text-only discovery.
- Broker fixture covers preservation, immutability, and malformed flag rejection.
- Harness fixture covers selected metadata with conservative fallback.
- Actual native serializer captures image-bearing payloads on two turns with
  supported, unsupported, and unknown capabilities, throwing before network IO.
- Native model.info selection and Python attach_image gate were source-inspected.
  A local replay of the installed Python skill produced the exact unsupported
  error for text-only metadata; adding image metadata reached file validation.

Four focused assertions failed before implementation, then all 151 focused tests
passed. Harness typecheck passed. No tests were deleted and no native vendor
package changed. Required aggregate check/build and authorized live proof are
recorded below when complete. This mapping supplements the full check fallback;
it does not establish provider acceptance or live latency.

## Review

/root/review_image_capability independently passed 151 tests and found no
actionable findings. Reviewed eight changed files including PRD; SHA-256 over
sorted path + NUL + bytes + NUL:
`bb508f4d53a78a5b93bbee991c833c7fd0c7816e83e9f6b0fef9866c96dbcd90`.
Native attachment execution is distinct from payload serialization proof.
This local review is non-certifying until attached to the exact PR snapshot.

## Actual aggregate and live results

- npm run check: Rust format, Clippy, workspace tests, crash reconciliation,
  package builds and TypeScript checks passed. Vitest: 2,386 passed, 17 skipped;
  ci-lbug-artifact failed setup because the default Cargo source-tree digest
  differs from the pinned contract. Aggregate remains failed.
- The affected artifact suite passed 14/14 with the previously verified isolated
  Cargo home. Separately ran the short-circuited stages: secret-boundary 2/2,
  Python 34/34, Ladybug receipt lint and PRD readability all passed.
- npm run build passed. No cold native build or fresh worker was provisioned.
- Live Prime Basic / Qwen3.8 Max Prime, Auto, No folder: fresh interaction 6
  completed with accepted output in 129.793 seconds, 26 tool calls. No manual
  cancellation. Product UI rendered authored HTML and its supporting-detail
  control opened a two-node physics layer.
- This live answer did not use images. It is completion/renderer evidence, not
  live image-inspection evidence or a causal latency comparison. The image fix
  is covered by discovery, metadata, gate replay and native payload checks.
- The model repaired invalid icons, a syntax error, capability/action mistakes,
  and a missing root action. After graph submission it attempted memory writes
  that confinement rejected; the interaction nevertheless finalized accepted.

Local ignored receipt: .relayer/live/pr500/live-smoke-image-fix-2026-09-27.json.
Source snapshot is the eight-file digest above, based on 239782d3. The evidence
file is outside that reviewed executable/PRD scope. Nothing pushed or merged.
