# Production authoring contract repair

The prior V4 Prime live run advanced current before adding actions, publishing
nodes that it then attempted to mutate. The shared prompt also lacked the
compiler vocabulary needed to author richer details without source inspection.

## Changed seams and required checkpoints

- The graph client's public and packaged agent exports expose a detached authoring
  reference generated from compiler allowlists and limits. The compiler test
  verifies callers cannot widen validation by changing the returned vocabulary.
- Shared harness prompts deliver that reference, icon vocabulary, and publication
  contract. Composed Codex/Prime prompt tests observe delivery. The reference
  describes existing validation; it grants no authority or new HTML/CSS support.
- Prime's actual prompt example declares two layers and a bound expansion, writes
  all actions before optional current publication, then submits. Production
  integration executes that exact example through the Python bridge and Rust
  acceptance, checking the root mount and reachable child's compiled detail.
  Existing asset persistence/export/import/reopen and draft repair coverage stays.
- Native author handoff instructions include the reference and lifecycle contract.
  Prompt delivery is tested; actual native child compliance is not claimed.
- Both harness pointer recipes now require a complete closure and actions before
  publication. Graph semantics and native recursion are unchanged (ADR0005 and
  temporal ADR0008; PRD graph acceptance and immutable publication boundaries).

Required checks: focused compiler/composed-prompt/production integration tests,
real managed Prime KernelManager fixture, npm run check, and npm run build. Reuse
of the existing verified installation and warm native build avoids provisioning.
Paid proof remains the authorized fresh 'Why is the sky blue?' query with Prime
Basic, Qwen3.8 Max Prime, medium reasoning, Auto, No folder, up to ten minutes.
Acceptance and rendered usefulness are separate observations. No merge is authorized.

## Results

Focused checks passed 163/163. Final native KernelManager integration passed 2/2.
Build passed. Full check passed Rust/Clippy/crash/type/workspace stages, then
2,389 Vitest tests passed with 17 skipped; the artifact suite failed setup at the
existing default Cargo source-tree integrity mismatch. The isolated-Cargo artifact
suite passed 14/14. Remaining stages passed separately: secret boundary 2/2,
Python 34/34, receipt lint and PRD readability. The aggregate remains failed.

Adversarial review by /root/contract_review found no blocking findings across the
11 tracked implementation/test files. Digest (sorted path + NUL + bytes + NUL):
`fdca6f92635255150b3bf6b461b44dd389d41dfaa994cbc9993aaf94b590cf4b`.
Review covered lifecycle, reference correctness, child handoff and production
integration mapping; it did not independently run tests or certify live output.
Existing PR CI migration-number collision and packaged dependency closure findings
remain unresolved. No test was deleted. Fresh live result pending.
