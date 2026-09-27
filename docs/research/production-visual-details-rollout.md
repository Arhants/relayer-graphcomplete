# Production visual Node Details rollout

## Approved behavior

New Codex Basic, Prime Basic, and internal Prime Deep threads select personal-presentation V3. Existing threads retain their saved presentation choice; accepted interactions, retries, and invoked children keep their exact immutable pin. The explicit Eval V2/V3 comparison remains unchanged.

Codex Basic prefers GPT-6 Sol, then Astra and Luna, with medium reasoning. Prime's provider-scoped router policy prefers Qwen3.8-Max (`qwen/qwen3.8-max` on OpenRouter, `alibaba/qwen3.8-max` on Vercel). DeepSeek V4 Pro and GLM-5.3 remain alternatives. The connected provider is not changed. Catalog visibility and availability still govern eligibility. Historical model receipts remain unchanged; existing policy-upgrade behavior retires old managed families and requires explicit reselection for subsequent execution. Custom families remain user-owned.

## Integrated work

Readiness commit `023a7bd5` was integrated as `b29ab117`. It fixes canonical accepted root-action projection into Ladybug, the source of the ordinary reopen mismatch, and adds bounded notification-driven readiness waiting before publication and SQLite locks. It retains transactional authority revalidation and does not block unrelated search targets.

Prime bridge commit `1b74761a` was integrated as `32f444f6`. Python declarative authoring uses the run-bound host transport and canonical TypeScript compiler; asset operations use authenticated graph routes. There is no second compiler or scheduler. Exact owner/source-layer provenance, terminal fencing, native recursion ownership, and `complete(inputGraph)` remain intact.

Integration preserves both Codex and Prime presentation-only session compatibility exceptions. Actual saved attachments determine trace attribution. Prime Basic revision 5 and Deep revision 4 enable V3; the exact trusted Basic configuration digest and Python package digest remain enforced by runtime and packaging manifests.

## Verification plan and checkpoint map

| Changed seam / promise | Required deterministic evidence |
| --- | --- |
| Accepted projection and bounded readiness; cancellation, failure, revocation, independent targets | Graph-server lifecycle scenarios and full crash reconciliation portfolio through `npm run check` |
| Codex old-thread follow-up and invoke retain pin; new thread selects V3 | `test/first-message-composer-integration.test.mjs` |
| Both real Prime configurations: Python authoring, accepted assets/controls, portability, old V1 continuation, new V3 thread | `test/prime-visual-integration.test.mjs` parameterized over Basic and Deep |
| Exact execution compatibility, immutable trace attribution, unrelated settings still rejected | Harness configuration and host tests |
| Model ordering, unavailable routes, router onboarding consistency | Product policy/service tests and `test/provider-straightforward-flow.test.mjs` with DeepSeek-first discovery and Qwen-first result |
| Trusted packaged YAML and Python bytes | Prime packaging suite |
| Shared Product/Eval rendering, image resolution, read-only controls and mutation rejection | `RELAYER_PRIME_VISUAL_EXPORT=/tmp/combined-prime-visual.jsonl node scripts/run-desktop-visual-node-details-test.mjs` after successful build and export integration |
| Secondary consequences | Full `npm run check` and `npm run build` before local commit |

No tests were removed. Existing reopen tests were extended to cover promotion. Prime's existing process scenario now uses both real configuration files instead of a synthetic YAML. No paid inference, release, signed packaging, deployment, or model-quality comparison is included.

## Actual evidence

- `npm run build`: passed (`/tmp/combined-build.log`). Existing warm native outputs were reused; no cold worker or native dependency provisioning was required.
- Focused configuration/host, Codex and Prime promotion, provider-flow and Prime packaging tests: 138 passed across six files (`/tmp/combined-focused.log`).
- Electron visual proof: passed (`/tmp/combined-visual.log`). Manifest `.relayer/evidence/visual-node-details/run-2026-09-27T15-09-24.701Z-eab313ab/manifest.json`, SHA-256 `c24de41acbfcab557c1865f9af337e9aa360dd138234fa49228b3f39d3cf2642`. Prime image resolves through a blob URL with natural width 150; exact package integrity survives import; read-only controls are disabled. The Prime screenshot was visually inspected. This fixture verifies functionality, not generated-design quality.
- First full check: Rust and crash portfolios passed; Vitest reported 2,375 passed, 1 failed, 3 skipped. The existing context-preview image test asserted before native WebCrypto package verification completed. Its unchanged focused rerun passed 44/44. The test now waits for the actual image mount while retaining exact presenting-interaction/layer assertions; the repaired suite passes 44/44. No production retry, delay, or assertion deletion was added.
- Final full `npm run check`: passed after the test synchronization repair (`docs/evidence/production-visual-rollout/check-final.log`). Vitest: 2,376 passed, 3 skipped; Python: 33 passed. Rust workspace and crash/lifecycle portfolios, Clippy, package builds, TypeScript, secret-boundary checks, receipt checks, and PRD readability passed.

The earlier draft and individual branch failures are historical evidence, not current verification. Their readiness dependency is resolved by the combined passing promotion scenarios. Static review is recorded separately and is non-certifying without a PR.

## Integration review and handoff

Reviewer `/root/integration_review` found no actionable integration defects and approved the test-only mount-readiness correction without lost authority coverage. Reviewed 41 tracked changed files against `b247529d`, digest `e3c7657c64a08176add56ad3e2fa266c042f320463c59560ec88e41c937d89e6` (sorted path + NUL + content + NUL). Exact paths and limitations are in `docs/evidence/production-visual-rollout/review.json`. Review is non-certifying without a PR. Evidence/report additions are outside the reviewed executable snapshot.

The combined implementation is ready locally. No push, merge, deployment, release candidate, or paid inference was performed. The earlier draft evidence directories remain historical local records; this report and the production-visual-rollout evidence directory describe the integrated result.
