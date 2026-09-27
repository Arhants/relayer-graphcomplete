# Prime visual authoring bridge

## Product contract and changed seams

PRD 6.2–6.5 and 12A govern canonical compilation, exact node/action/source-layer provenance, constrained rendering, persistence, portability, scoped assets, and terminal fencing. PRD 12 and ADRs 0001/0006 retain Prime-native recursion and `complete(inputGraph)` authority. ADR 0005 governs action provenance; ADR 0009 governs immutable presentation pins.

Changed executable seams:

- Prime factory registers a run-bound `relayer.graph.visual-authoring` handler and accepts validated presentation-version metadata. Prompt guidance teaches the supported Python API.
- Python `GraphSession` sends snapshotted declarations bound to its original token and interaction. Node helpers represent authoring intent, not compiled graph state. `ActionObject` supplies the same declaration to a visual mount and ordinary graph write.
- The host validates bounded envelopes, constructs canonical TypeScript objects, and invokes the existing compiler/client. A bounded per-run cache preserves frozen compilation across lost acknowledgments; fresh objects with stable keys express intentional draft updates.
- The TypeScript graph client's optional request scope checks authority before dispatch and after responses and supplies the run abort signal.
- Python visual-assets operations use existing authenticated graph routes and caller-read bytes. Downloads check base64 and digest integrity. No host filesystem reader is introduced.
- Presentation-only Prime configuration changes preserve native-session compatibility; saved Product presentation pins flow through Rust launch context and host trace metadata, including semantic child runs. The exact saved pin remains authoritative.
- Desktop telemetry inventory includes the new bridge module.
- Python trusted-package digests must match changed packaged source bytes. No runtime dependency closure changes are authorized by this implementation.

## Checkpoint map and required plan

| Promise / boundary | Smallest new proof | Existing required proof |
| --- | --- | --- |
| Canonical compile; closed input; exact source ownership | `prime-visual-authoring.test.ts`; Python `test_visual_authoring.py` | graph-client detail/objects/packaged tests |
| Retain, replace, clear; repair; concurrent submit; frozen retry | `prime-visual-authoring.test.ts` | graph-client objects tests |
| Stale Python session, native inherited scope, cancellation | actual factory handler assertions in `prime-agent.test.ts`; delayed asset fencing in bridge tests | Prime quiescence/cancellation suite; graph-server terminal authority tests |
| Python asset bytes, integrity, scope and pinned package | Python helper tests; `prime-visual-integration.test.mjs` | visual-assets bridge/client/module suites |
| Actual Prime factory → Python → accepted Product package → export/import → reopen | `prime-visual-integration.test.mjs` (only inference/session transport replaced) | conversation export/Eval tests |
| Shared Product/Eval rendered image and controls | Prime-produced export imported into Electron review | `npm run test:desktop:visual-node-details` |
| Packaged trusted Python assets | exact tree hash verification | Prime packaging/runtime tests |
| Immutable pin and presentation-only session compatibility | configuration/host tests; actual old-thread V1 continuation and new-thread V3 activation in integration test | configuration and Product activation proof |
| Default V3 promotion | pending all preceding proof | shipped basic/internal deep YAML unchanged |

The full `npm run check` remains the fallback for unmapped secondary consequences. Run `npm run build` before committing. No test retirement, paid inference, deployment, or release-candidate proof is part of this change. The parallel search-readiness fix must remain separate; any blocked reopen continuation is a dependency, not a reason to add retries.

## Results

The bridge is implemented locally on `codex/prime-visual-authoring`, based on `bebda510ff78a265ca348b44857ab74b27d79179`. Shipped V3 defaults are **not promoted**. No paid inference or release proof ran.

### Explicit integration dependency

The required promotion scenario accepts the first Python-authored package, exports/imports its image bytes, and reopens the exact package from disk. Continuing that old thread immediately after restart fails at ordinary `graph.submit()` with:

```
relayer_graph.exceptions.APIError: graph engine failed: search target thread:1 is rebuilding
```

No delay, retry, skipped assertion, or replacement search scheduler masks this boundary. Old-thread V1 continuation and subsequent fresh-thread V3 activation remain unproven in this branch. The separate readiness commit is `023a7bd5edbd95b297c20c2bad929814860cd546` in `codex/reopen-search-readiness`; it has not been incorporated here. The parent must integrate that prerequisite and rerun the unchanged promotion scenario before enabling defaults.

### Verification actually run

The final changed-source/test snapshot (25 files, excluding this evidence README) has SHA-256 `5d9141238991f9fdec1428861e02429c147f384376705b88cef09278e9f0b3c7`, computed over sorted repository path + NUL + file content + NUL. `npm run build` passed on this snapshot. `npm run check` failed only at the explicit promotion dependency: Vitest reported **2,381 passed, 1 failed, 3 skipped** across 184 files (182 passed, 1 failed, 1 skipped). The failing test is `test/prime-visual-integration.test.mjs`, with the exact rebuilding error above. Cargo formatting, Clippy, workspace tests, crash-reconciliation tests, build, package checks, and TypeScript checks completed successfully before Vitest. Log: `/tmp/prime-visual-final-check.log`.

Because the aggregate command stops at Vitest failure, its later stages were run separately on the same snapshot: secret boundary 2/2, Python 33/33, Ladybug receipt/contract lints, and PRD readability all passed (`/tmp/prime-visual-final-secret.log`, `/tmp/prime-visual-final-python.log`, `/tmp/prime-visual-final-lint.log`). No aggregate-green claim is made. Earlier focused promotion run: 167 tests passed, 1 failed at the explicit readiness boundary (`/tmp/prime-visual-promotion.log`). Python: 33 passed. Secret boundary: 2 passed. Ladybug receipt/contract lints and PRD readability passed. Final repair regression: 6 bridge tests passed.

Final-source Electron proof passed after the successful build, using `RELAYER_PRIME_VISUAL_EXPORT=/tmp/prime-visual-proof.jsonl node scripts/run-desktop-visual-node-details-test.mjs`. Manifest: `.relayer/evidence/visual-node-details/run-2026-09-27T05-12-15.299Z-121f8d3d/manifest.json` (SHA-256 `d05396fb83ddec5120349afd89c85e1eda72fcf65acec049b7ce9ab99a1da4bc`). Prime assertion: exact imported package integrity `d34b63cef60d6cd3dd641d1b524cf557007cb987cd65d5163bdd7c19c9428e73`, asset `available`, `blob:` protocol, complete image with natural width 150, and disabled read-only invoke control. Screenshot `shot-7e725654-ce1e-4dee-bd8f-e1751b896fe4` was visually inspected. This is functional renderer proof, not a design-quality assessment or promotion pass.

The final dedicated integration run (`/tmp/prime-visual-final-integration.log`) reproduced the same readiness failure at continuation. Its earlier acceptance/export/import/reopen assertions passed before that failure, and its exported bytes were the input to the final Electron proof.

### Parent integration notes

The Rust launch-context, host trace/types, and host-test presentation-pin edits overlap the parent's existing work and were reused directly. Combine the Prime-only `sameHarnessExecutionConfiguration` metadata exception with the parent's Codex exception rather than dropping either. This branch does not alter model-family/provider policies or shipped basic/deep defaults. The new integration test intentionally retains the failing prerequisite checkpoint.

### Adversarial review

Reviewer: `bridge_review`. Verdict: no remaining actionable findings after correcting local and host schema failure repairability, stale session binding, concurrent finalization, and per-request transport rebinding. Scope: bridge/factory, graph-client request scope, Python session/detail/actions/assets, configuration comparison, host trace context/types, and Rust presentation propagation. Source digest: `9dbb0aaef21acf909852029a2233a9df5657f86f9071265c1f0750765ee949c9` (sorted source path + NUL + content + NUL). Source changes invalidate this assertion. Static review is non-certifying without a PR and does not certify tests or promotion. Unresolved finding: required promotion proof depends on search readiness.


### Reproduction

Use the repository-pinned Node 22 runtime. The shared local Cargo registry had extra `.cache/lbug-prebuilt` files that failed trusted tree verification; an isolated copy under `.relayer/prime-visual-cargo` was restored from the digest-verified cached crate. No trusted dependency digest or shared registry was changed.

```sh
npm run check
npm run build
RELAYER_PRIME_VISUAL_EXPORT=/tmp/prime-visual-proof.jsonl npx vitest run test/prime-visual-integration.test.mjs
RELAYER_PRIME_VISUAL_EXPORT=/tmp/prime-visual-proof.jsonl npm run test:desktop:visual-node-details
```

The integration export is written after accepted-package/import assertions, before continuation. A generated export or Electron rendering pass does not imply that the later promotion assertion passed.

Reviewed digest paths:

```text
crates/relayer-app-server/src/runtime.rs
packages/graph-client/src/client.ts
packages/harness-host/src/configuration.ts
packages/harness-host/src/host.ts
packages/harness-host/src/implementations/prime-agent.ts
packages/harness-host/src/implementations/prime-visual-authoring.ts
packages/harness-host/src/types.ts
python/relayer-graph/src/relayer_graph/actions.py
python/relayer-graph/src/relayer_graph/detail.py
python/relayer-graph/src/relayer_graph/session.py
python/relayer-graph/src/relayer_graph/visual_assets.py
```
