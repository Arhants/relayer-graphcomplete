# Prime context and reasoning repair — 2026-09-27

The user approved both fixes after the bounded live run at 05fa64ea. This change
does not claim the next live run will complete faster.

## Required verification and changed seams

- Standalone context: native instruction files admitted to model context must be
  inside the selected workspace or managed private agent directory. Parent app or
  development-repository AGENTS files cannot leak into No folder conversations.
  Workspace-owned instructions still apply, including when the workspace is a
  selected project. Canonical path checks reject symlink escapes.
  `prime-agent-context.test.ts` invokes the installed native context loader and
  the production factory's filter against realistic nested directories. It
  covers empty standalone context, workspace instructions, rediscovery, symlinks,
  and trusted managed private instructions. The unfiltered production behaviour
  first failed this test by admitting the ancestor AGENTS.md. Native reload and
  inline-child reuse of the resource loader are additionally inspected in source.
- Model capabilities: provider discovery, the execution-access broker, immutable
  host admission and Prime model construction must preserve discovered reasoning
  support. Effort-capable and toggle-only models must remain distinct; model IDs
  must not imply capabilities. Provider and runtime-broker tests cover this path.
- Native reasoning preference: session construction without an ambient model must
  not erase the harness-configured preference. The preference and native session
  record agree, while each run retains its selected model and credentials.
  Native SDK tests exercise request payloads without transmitting inference.
- Mixed fixtures: deterministic native-session doubles must implement the new
  explicit configuration boundary. Existing visual acceptance and assets proof
  remain mapped to the real Prime KernelManager integration runner.

The PRD records these approved promises. `npm run check` is the deterministic
fallback across all changed seams, with `npm run build` before handoff. Focused
harness/provider/broker tests and real-kernel visual integration supplement it.
Paid live-model performance proof remains separate. No tests are deleted.

## Actual results

Focused context tests: 2/2 passed after observing the ancestor leak fail before
applying the filter. Focused harness/provider/broker/host tests: 236/236 passed.
Harness-host typecheck passed. Final aggregate and real-kernel results follow.

## Review assertions

`/root/review_context_boundary`: no unresolved findings. Scope: instruction-filter
source block, complete context test, architecture section, PRD private-state
paragraph. SHA-256 over sorted compact JSON of those named source slices:
`1205554c4f2bcbe39a2f911575a8be9a913fd3f785ce332727037fe29497e568`.
Independently ran 2/2 context tests. Reload and native-child resource-loader reuse
are source-inspection evidence, not dynamically executed child proof.

`/root/review_reasoning_fix`: no actionable findings. Seven-file digest:
`ee2859cf6e39a45d7bcc39d5145d295c5cd3103f8f2201b3b1f0dc8e6756daba`.
Digest is SHA-256 over sorted path + NUL + bytes + NUL for openrouter.mjs,
graphcomplete-runtime.mjs, prime-agent.ts, types.ts, prime-agent.test.ts,
provider-adapters.test.mjs, and graphcomplete-runtime-access-broker.test.mjs.
Independently ran 150/150 tests. Scope covers reasoning propagation, native
request payloads, capability validation and run-scoped authority. Excludes
live latency and dynamic native-child execution. Native child reasoning
inheritance was inspected in the pinned installed runtime.

These local review assertions remain non-certifying until recorded in the PR
against the exact source snapshot. No native vendor package was changed.

## Limits

The provider capability mapping added here is for OpenRouter, the provider used
by the failing runs. Unknown capabilities remain conservative. Other providers
need their own verified discovery contract; this change does not infer reasoning
support from model names. The catalog at https://openrouter.ai/api/v1/models on
2026-09-27 reported Max Prime default effort xhigh and Flash toggle-only support.
That makes the omitted setting a plausible latency contributor, not proof of
what a prior provider request actually did internally. A new live comparison is
still needed; none was run as part of these deterministic checks.

## Final validation

`npm run check`: Rust, Clippy, crash reconciliation, package builds and TypeScript
checks passed. Vitest reported 2,385 passed and 17 skipped; its only failed suite
was ci-lbug-artifact setup because the default local Cargo source tree differed
from its sealed digest. Its 14 artifact tests passed with the previously verified
isolated Cargo home. The aggregate failure remains a failure, not a green check.
The check stages after Vitest were run separately: secret boundary 2/2, Python
34/34, Ladybug receipt lint and PRD readability all passed.

`npm run build` passed. No paid inference was used for validation. The real Prime KernelManager visual runner passed 2/2 for Basic and Deep,
including the composed Python example, accepted authored details, assets,
controls, import/export and reopen.
