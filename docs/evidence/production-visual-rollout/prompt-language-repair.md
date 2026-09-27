# Prime composed-prompt repair — 2026-09-27

## Diagnosis and scope

The latest live Max run made 45 tool calls over 306 seconds without an accepted
output. The composed prompt combined Python authoring guidance with the immutable
V3 preference's TypeScript recipe. This mismatch is confirmed; its contribution
to latency remains a hypothesis until a fresh live comparison.

The user approved separating presentation requirements from harness API examples.
The shared renderer normalizes only the exact known built-in visual preference;
it does not rewrite stored versions, pins, or custom preference text. Codex owns
the TypeScript recipe, and Prime owns Python guidance and a runnable one-node
example. Native recursion and graph acceptance authority are unchanged.

## Changed seams and checkpoint mapping

- PPG-003: exact built-in normalization, custom-text preservation and graph
  immutability → personal-presentation-guidance.test.ts using the actual Rust V3
  definition, rather than a separately maintained fixture.
- PPG-003: composed default/layered Prime prompt has consistent Python APIs;
  final submission remains explicit → prime-agent.test.ts.
- PPG-004: historical and normalized preference text remains redacted from
  provider/tool traces → shared trace aliases and actual Prime event tests.
  Codex and Claude consumers retain those same aliases.
- V3 visual output and acceptance: prime-visual-integration.test.mjs extracts
  and executes the actual composed Python example for newly V3-pinned threads,
  through the Python client, canonical compiler and Rust graph acceptance.
  Existing V1 asset/control/repair/export/import/reopen coverage remains intact.

Warm tests cover renderer, composed prompt, and trace boundaries. Heavy proof is
`npm run check`, `npm run build`, and the existing process integration runner.
The optional real Prime KernelManager mode additionally checks the actual native
host-request envelope without paid inference. No tests were deleted.

## Results

- Focused harness/renderer suite: 126 passed before the two additional composed
  profile cases; final Prime/renderer subset: 59 passed.
- Product integration: 2/2 passed for Basic and Deep.
- Real Prime IPython kernel integration: 2/2 passed, including execution of the
  actual V3 prompt example and accepted visual output.
- Final complete Vitest suite: 2,392 passed, 3 skipped (183 files passed, one skipped), using the verified isolated Cargo home. Build passed. Aggregate history and remaining limitations are below.

Reviewer `/root/review_prompt_fix` reviewed the twelve changed implementation,
verification and contract files at workspace digest
`1ee3d7591247636a75b73978be38ece84aafcc1d8ecd81a7faf402e611ce7371`.
Digest is SHA-256 over sorted changed paths, NUL, file bytes, NUL. Verdict: no
actionable findings after resolving historical trace redaction aliases;
independently verified 59 tests. Scope excludes live effectiveness and latency.
This local review is non-certifying until recorded against the exact PR source.

No live success is claimed. PR #500 remains draft and must not merge on these
deterministic results alone.

## Aggregate validation history

The first `npm run check` passed Rust, Clippy, crash reconciliation, builds and
TypeScript checks, then reported 2,377 Vitest passes, one obsolete Eval assertion
failure and 17 skips. The artifact suite also failed setup because the default
Cargo-resolved Ladybug source tree differed from its sealed contract. The Eval
assertion was updated to the approved neutral-rendering contract; its executable
TypeScript assertions now live at the actual Codex prompt boundary. The reviewer
confirmed this mapping change preserves both semantic and executable coverage.

An intermediate Eval rerun passed 63 tests but one product-runtime startup failed
because a concurrent build temporarily removed package outputs. This was a test
orchestration error, not accepted proof. The final suite runs after build completion.
`npm run build` passed. The otherwise short-circuited check stages were run
separately: secret-boundary 2/2, Python 34/34, Ladybug receipt lint, and PRD
readability all passed. The final Vitest run uses the previously verified isolated
Cargo home to avoid changing or trusting the contaminated default source cache.

Final Vitest rerun passed all 2,392 executed tests, with three expected skips.
This includes the corrected Eval assertion and all 14 artifact cases. The original
`npm run check` failure is preserved above rather than relabeled as a pass.
