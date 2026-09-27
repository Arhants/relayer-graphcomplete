# Explanatory presentation V4

## Approved product change

V4 adds generic, task-adaptive explanatory presentation to the existing personal
presentation graph. It asks authors to make meaningful relationships visible,
without prescribing images, a layout, node counts, or domain-specific diagrams.
Production Codex Basic and Prime Basic plus internal Prime Deep select V4 for new
threads. V0–V3 and historical selections remain unchanged.

## Required checkpoints and executable seams

- Migration32 adds one hidden version; runtime validates/materializes V4 without
  rewriting historical graphs or active policy. Rust personal-presentation tests
  cover publication identity/topology; migration/reopen tests cover persistence.
- Production YAML selection and Prime configuration integrity pin agree. Host
  completion ingress admits V4 and rejects unsupported keys. Configuration,
  host, runtime preflight and production integration cover this boundary.
- Shared preference rendering retains custom text and historical V3 normalization.
  The new V4 preference is rendered verbatim and redacted through the existing
  trace contract. Renderer tests use the actual Rust-defined preference text.
- Every harness root receives the capability overview and appropriate API recipe.
  Minimal examples teach mechanics instead of prescribing presentation structure.
  Native parents are instructed to pass preferences and recipes to graph-authoring
  children. Composed-prompt tests observe these instructions; they do not prove
  an actual native parent obeyed them.
- Existing V1 and V3 Codex threads retain follow-up/invoked-child pins after reopen
  under V4 defaults. New threads pin V4. The two migration cases protect distinct
  legacy-default and immediately-preceding-default boundaries.
- Prime Basic/Deep production integration covers Python authoring, asset
  persistence/export/import/reopen and fresh V4 pinning. The explicit V2/V3 Eval
  comparison stays unchanged. Eval recognizes V4 compiled output as authored;
  that structural check makes no visual-quality claim.

Required assembled gates: npm run check and npm run build. Relevant real native
KernelManager integration runs with RELAYER_TEST_PRIME_PYTHON pointing to the
verified existing managed installation. No cold build or fresh worker is needed.
No tests are deleted. Paid proof is the user-authorized fresh sky-blue query,
Prime Basic/Qwen3.8 Max Prime, medium reasoning, Auto, No folder, ten-minute cap.
This repeats the product smoke; it is not a controlled efficacy experiment.

## Results

Focused harness/configuration tests passed 159/159; host/product integration
passed 91/91, including V1 and V3 history retention. Rust personal-presentation
passed 8/8. Real Prime KernelManager integration passed 2/2. Build passed.

Initial aggregate check exposed a stale test expecting 31 migrations; corrected
to 32. A subsequent check hit the existing Git-environment test's 500ms timeout;
its focused unchanged rerun passed. The final aggregate attempt is recorded below.
One native-test setup attempt overlapped package rebuilding and could not import
the rebuilt Eval package; after build completed, both native scenarios passed.

Final source review by /root/presentation_evaluation: no actionable findings in
28 files (tracked implementation/test/doc/config diff plus migration0032,
excluding evidence). SHA256 over sorted path + NUL + bytes + NUL:
`94d9cbb1f500e5b0caf0bfc6326a2f606e0293e79bcb16d17025592c541c183d`.
This final review was source/mapping/hash inspection; its prior independent
51-test run predates final changes. It confirms semantic policy, historical
version retention, V4 ingress, API recipe and sealed configuration consistency.

/root/presentation_availability found the original missing V4 ingress acceptance
and noncanonical JS example; both were fixed. Its final scoped review had no
remaining findings and independently passed 218 tests. Reviewed scope digest:
`7dfa394296dee5586af0d8b0a9a899e81167f0b350311fa5db24d731d276096c`.
Scope: four guidance/adapter files, host.ts, runtime.rs, migration0032,
eval-service.mjs, renderer/Codex/Prime/Claude/host tests, and Prime/first-message
integration tests. Configuration integrity changes were covered by the final
whole-diff review above. Reviews are local/non-certifying until attached to the
exact PR source snapshot.

Root prompt delivery, actual child behavior, image inspection and rendered
communicative value remain separate proof claims. No dynamic native authoring
child execution is claimed by these deterministic prompt tests.

Final aggregate attempt: Rust format/Clippy/workspace/crash tests, package builds,
and TypeScript checks passed. Vitest passed 2,388 tests with 17 skipped; one suite
failed setup at the known default Cargo source-tree integrity mismatch. The
aggregate is failed, not green. Its isolated-Cargo artifact suite passed 14/14.
The remaining stages passed separately: secret-boundary 2/2, Python 34/34,
Ladybug receipt lint and PRD readability. Final build passed. Runtime preflight
confirmed the sealed Prime configuration is available. Live V4 proof follows in
the PR after this reviewed source snapshot is pushed.


## Live run on 8ae1c02e

Fresh product interaction7, graph42, Prime Basic, Qwen3.8 Max Prime, Auto,
No folder. The stored pin was V4 (version node36); native user instructions
contained Explanatory presentation, the capability overview and mechanics-only
example framing. Native history retained medium reasoning.

The ten-minute watchdog checked every20 seconds and cancelled at617 seconds;
the attempt finalized execution_failed at617.553 seconds with no final accepted
output. Cancellation acknowledged true. The run made58 tool calls and authored
19 nodes across5 layers. It generated HTML/CSS comparisons, radiation diagrams,
and wavelength/transmission charts; it did not call native image inspection.
These observations come from public tool code/results, not a rendered-quality
judgment. The final Product UI showed Failed: execution and no partial graph.

The agent spent many calls inspecting APIs/compiler source before authoring.
It eventually submitted layers and advanced current to layer15, then attempted
to add actions to now-accepted nodes. The boundary rejected immutable_action_source.
Graph final submission did not succeed. V4 delivery and visual authoring were
observed; completion, rendered communication quality and native image inspection
were not established. This is a failed smoke, not promotion evidence.

Local ignored receipt: .relayer/live/pr500/live-smoke-v4-2026-09-27.json.

## CI blockers on 8ae1c02e

CI run36351386058 failed. GitHub's merge snapshot includes main's newly merged
0032_interaction_stop_requests.sql, colliding with this branch's0032 V4 migration.
This causes duplicate _sqlx_migrations.version failures in Rust and Vitest. The
branch-local migration proof does not establish compatibility with current main.

macOS packaged Prime verification also rejected a transitive closure mismatch:
expected7d25b7c2c5aa3ede2cf731770f11f37e0de0eaba454dc3c62cbe561e4b2f4160,
observed1253fd136c0d63e751fffdae68327a1b5cbb3176f2b9780de372744f8b83ef41.
Read-only review by /root/presentation_availability confirmed prior retry resealing
updated its pins and CI passed root-package identity checks before this failure.
The differing transitive files remain unidentified. Current main changes dependency
layout, which is a hypothesis, not proven cause. Do not accept the observed digest
without comparing actual packaged inventory and dependency provenance.

PR remains draft. No merge or release readiness claim. These failures are preserved
rather than weakening integrity checks or retroactively changing the live snapshot.
