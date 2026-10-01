# Subscription model refresh

The September 30, 2026 product decision selects GPT-6.1 Sol as the first model in the shipped Codex managed family, followed by GPT-6 Astra and GPT-6 Luna. Claude subscription choices display Sonnet 5.5, Opus 5.5, and Fable 5.1; their native execution identities remain `sonnet`, `opus`, and `fable`. Sonnet remains first. PRD section 2 is authoritative.

## Changed seams and checkpoints

| Executable seam / promise | Smallest deterministic checkpoint |
| --- | --- |
| Codex policy v4 prefers discovered 6.1 Sol even when Astra is the native default; hidden and missing models are omitted | `model_policy::tests::codex_policy_v4_prefers_6_1_sol_without_inventing_catalog_members` |
| Shipped Codex Basic loads policy v4, revision 10, medium reasoning | `packages/harness-host/test/configuration.test.ts` |
| SQLite refresh replaces the managed v3 family with v4, preserves the provider and custom-family members/revision, rejects the retired selection, and falls back to Astra when Sol is unavailable | `service::tests::codex_v4_upgrade_selects_6_1_sol_and_preserves_custom_families` |
| An explicitly selected custom default survives the v3-to-v4 upgrade | `service::tests::policy_version_change_never_replaces_a_custom_default` |
| Historical policy v2/v3 semantics remain valid | Existing `model_policy` and staged-provider migration tests |
| Claude version labels preserve aliases and Sonnet preference | Production adapter descriptor checkpoint in `test/provider-adapters.test.mjs` |
| Codex and Claude runtime requirements and update metadata name the exact reviewed SDK recipe | `test/managed-runtime-requirements.test.mjs` |
| SDK plus native closures use reviewed target-specific hashes on macOS arm64/x64 and Windows x64; no vendor-latest lookup | Exact app-owned recipe and supported-runtime-target checkpoints in `test/managed-runtime-installer.test.mjs` |
| Declared picker runner unwraps settled startup discovery results and checks discovered eligibility rather than native-default count | Live `npm run evidence:model-selector`; existing `test/model-catalog.test.mjs` startup/availability contracts |
| Secondary shared-runtime effects: Anthropic API also loads the updated Claude SDK; OpenAI API, OpenRouter, and Vercel AI Router load the updated Codex runtime; preparation/activation failures preserve authority | Existing managed-runtime installer, resolver, updater, readiness, provider-composition, Eval runtime/setup, publication metadata, and Claude harness tests in `npm run check` |
| Saved interaction models, final-send validation, and compatible follow-up changes retain their existing contract | `crates/relayer-app-server/tests/product_persistence_flow.rs` and model catalog flow in `npm run check` |

No tests are deleted. Policy-level omission tests protect catalog construction; the SQLite scenario protects persisted defaults and actual selection validation. These are distinct boundaries.

## Required verification

Run the focused in-process policy/service, provider/catalog, configuration, and runtime requirement/installer tests while editing. Before handoff, run `npm run check`, `npm run build`, and the model-picker evidence README's declared opt-in `npm run evidence:model-selector`. Live catalog discovery does not establish paid execution capability. The declared picker runner uses deterministic completion, with zero paid inference.

There is no declared Claude clean-root heavy entry point equivalent to `test:prime-managed-runtime`; Codex/Claude cross-platform execution remains indeterminate until its declared platform/release context. Signed Preview/Stable release proof is separate and is not part of this development change.

## Runtime identity evidence

The pinned SDK package `0.3.286` reports `claudeCodeVersion: 2.1.286`. Its macOS arm64 SDK and native archives were verified against their recorded SHA-512 identities, and the native `--version` probe returned `2.1.286 (Claude Code)`. An isolated SDK initialization with no prompt and no credentials reported `sonnet` resolving to `claude-sonnet-5-5` and `opus` to `claude-opus-5-5`. This made zero inference calls. The unauthenticated catalog did not expose Fable, so it is not account-entitlement evidence. The pinned native artifact contains `claude-fable-5-1`; the official Claude Code mapping documents the `fable` alias as Fable 5.1. Fable account availability and paid execution were not tested.

Primary sources: [OpenAI GPT-6.1 Sol](https://developers.openai.com/api/docs/models/gpt-6.1-sol), [Claude Code model configuration](https://code.claude.com/docs/en/model-config), and versioned npm package metadata/artifact identities locked in `desktop/main/managed-runtimes/recipes.mjs`. Sonnet 5.5 requires Claude Code 2.1.284 or newer, Opus 5.5 requires 2.1.280, and Fable 5.1 requires 2.1.257; the previous 2.1.250 runtime was insufficient.

The previous Codex 0.147.0 account-aware catalog returned only the older 5.6 family for this account. The SHA-512-verified macOS arm64 Codex 0.159.3 artifact returned visible, available `gpt-6.1-sol` (native default), `gpt-6-astra`, and `gpt-6-luna` through Relayer's production catalog adapter using the same connected account. Other native catalog entries remain discoverable, while the versioned managed family uses the requested preference order. This was account/read plus model/list, with zero inference.

## Observed picker evidence

[codex-picker.png](./codex-picker.png) is the real Electron product picker backed by the freshly built Rust app server, live account-aware catalog, and shipped Codex policy v4. It shows GPT-6.1-Sol selected first, followed by GPT-6-Astra and GPT-6-Luna. The source screenshot was visually inspected. [codex-catalog.json](./codex-catalog.json) records the credential-free model projection; [claude-initialization.json](./claude-initialization.json) records the isolated no-prompt SDK initialization.

The declared full `evidence:model-selector` run is **not passing**. Its final run completed two accepted deterministic interactions, and the persisted model-selection checkpoint passed: `gpt-6.1-sol` followed by `gpt-6-astra`. [accepted-models.json](./accepted-models.json) preserves that console checkpoint. The full run then timed out at `rendered nth-turn model identity and enabled composer`; the old `#interactionModelIdentity` selector is absent from the current renderer. There is no new historical-banner, light-theme, or Settings capture claim. The previously recorded Issue #34 evidence is preserved.

Initial runner failures exposed stale discovery/window/renderer IPC interfaces and a fixture provider lease missing its required adapter descriptor. The latter caused a persisted failed execution attempt even though the interaction displayed `not_started`. Runner repairs use the production Codex descriptor and current deterministic lease contract, preserve zero paid inference, record `completionError`/`latestAttempt` diagnostics, correct the thread-detail identity, and validate saved model receipts before the later UI checkpoint. They do not weaken the remaining historical-banner checkpoint or change product behavior.

## Verification results

The tested code/test diff against `33da5d371b1a1c6e5cdb1246228ebab88f6964d3` has SHA-256 `d32a0dded25feb81b80491a03108071808065334646b6075dcb72ae7588cd80e` (`git diff -- crates desktop harnesses packages scripts test`). The final PRD has SHA-256 `82354f43b53b8c7858d28fbb758b40a956a7e938c9c51fa20a6956acd64ad21e`.

| What actually ran | Result / practical limit |
| --- | --- |
| Focused configuration/provider/catalog/runtime tests | 203 passed |
| Focused policy tests and v4 SQLite upgrade scenario | 21 policy tests plus the v4 upgrade test passed |
| Updated Eval/publication consumers | 67 passed |
| `npm run check` | Rust fmt/Clippy/default/crash tests, package/type checks, 3,389 main Vitest tests, 2 secret-boundary tests, 66 Python tests, and Ladybug receipt checks passed. The earlier outer command exited 1 at its final PRD readability step: one new sentence had 31 words. After the documentation repair, the full command was repeated and exited 0, including all inner scenarios and readability. |
| PRD repair and `npm run prd:check-readability` | Split the sentence without changing product meaning; targeted recheck passed. No checked sentence exceeds 25 words. The full outer command was subsequently repeated and passed. |
| Final `npm run build` | Exit 0, on the final production/configuration source |
| `npm run evidence:model-selector` | Real picker and two accepted deterministic model-selection receipts verified; full command still fails at the unchanged historical-banner checkpoint |

The earlier full suite exposed four stale expected runtime pins in Eval/publication tests; their current-release assertions were repaired before the final test run. An initial Clippy range-pattern failure was corrected to `2..=4`. No tests were deleted. Node 22.23.2, three Cargo/Vitest workers, and the previously verified compatible Ladybug cache were used. No paid inference, signed release, or non-arm64 execution was run.

## Adversarial review assertions

All three reviews below name the exact code/test diff digest above. They are source/evidence reviews and are **non-certifying without a PR**; transcripts are not test evidence.

| Reviewer | Reviewed scope | Verdict / unresolved findings |
| --- | --- | --- |
| `/root/review_diagnosis` | Codex policy v4, revision 10, persisted default upgrade, custom defaults, native availability fallback | No unresolved source finding |
| `/root/review_preview` | Runtime hashes/requirements, shared API runtime effects, Eval consumers and publication metadata | No unresolved source finding; paid/cross-platform/release execution remains unverified |
| `/root/review_retest` | Proof-runner repairs, real picker image, catalog and saved model projections, historical evidence preservation | Qualified partial evidence is accurate; full historical-banner proof remains failed |
