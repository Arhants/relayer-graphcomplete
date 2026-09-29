# Full Eval provider/model setup verification — 2026-09-28

## Plan and source identity

Required checkpoints and commands are mapped in [README.md](README.md) and PRD
§13.2.2. This addition also protects PRD §2.1's preservation of model defaults
when a provider catalog refreshes. Live authentication, paid inference, and
release proof are outside this deterministic run.

The 30 changed/new source and evidence files before this report had workspace
SHA-256 `383ef7d65691e6576710e7e7c468c02da5ec3ad2096e88f113214dc3b0b9fa99`.
Hash construction: sorted repository-relative path, NUL, file bytes, NUL.
The ignored local file `.relayer/full-provider-source.json` records that file list.

## Executed evidence

- `npm run build`: passed, including native binaries and all package compilation.
- Focused Vitest invocation: **244 tests in 12 files passed**. Files: Eval provider
  setup, credential store, web host, human task, simulated-user service,
  configuration paths, desktop telemetry inventory, affected CI planner,
  Eval app integration, production provider composition, provider settings
  connection, and provider adapters. Runtime: 32.06 seconds.
- `npm run test:eval-web`: **all five inner scenarios passed**: interrupted
  startup cleanup; live human task and authority; host/review persistence and
  trace; full provider/model settings; automated judge browser interaction.
  Settings proof uses the production renderer/controller/composition and real
  Rust persistence. Fake native login/discovery verifies cancel, connect,
  refresh, logout, reconnect, custom families, and defaults. The explicit family
  selection survives reload and `providerSetup.select()` resolves the expected
  family, named provider, and model. No inference was purchased.
- Rust regression `managed_catalog_refresh_preserves_a_separately_chosen_default_provider`:
  passed through provider selection, both catalogs refreshing, managed-family
  policy migration, and SQLite reopen. The existing legacy managed-family
  migration test also passed. These protect different default-ownership cases.
- `git diff --check`: passed.
- First `npm run check`: **failed** in
  `environment::tests::command_runner_clears_hostile_git_repository_environment`
  with `Timeout(500ms)` during a fixture shell command. That Rust package reported
  280 passed and one failed. Later check stages did not run. Formatting and
  Clippy completed before this failure. The serialized Rust retry is recorded below;
  the first failure remains evidence.

Private runtime copies used for the final browser proof:

- app server: `45c20a0386b5cd522acd882c757c638a2d87713e83820020b960bea86cb1e154`
- graph server: `a46c1e60a7ddeced5686b9a07943c9fafd126eba52c1c8c292eb3cf09e8e021f`

## Adversarial review

Reviewer: `/root/provider_backend`. Reviewed 16-file digest:
`cf1760e2bd426aba6f8ba69474545d107f6c233a962256dbbbe545ec764a777a`.
The final review includes the meaning-preserving readability edit below.
Runtime proof preceded that docs-only edit at 16-file digest
`5c1e1884a00054771a13bbc00c06f837675b89a9738d4f8a5714ddf0be1ef4d9`. Parent independently recomputed both reviewed digests.

Scope: Eval backend (`credential-store`, `eval-service`, `index`, `provider-setup`,
`web-host`); Eval renderer (`index.html`, `main.js`, `product-settings.js`,
`web-bridge.js`); PRD; the four provider/credential/service/web-host test files;
Rust SQLite `catalog.rs`; and the browser proof script. The review checked
secret handling, profile isolation, busy guards, settings authority, explicit
runtime preparation, abandoned-login cleanup, model identity pins, default-family
selection, and preservation of a separately selected provider during refresh.
Verdict: no unresolved source findings in this scope. This is **non-certifying
source review without a PR**, not release or live-provider certification.
Subsequent source changes invalidate this assertion.

## Limits

Actual macOS Keychain interaction is unverified. Injected-store tests exercise
restart, concurrent key creation, tampering, profile binding, missing/denied keys,
and unsupported platforms. No user credential or default Keychain was changed.
Native login callbacks and paid model execution remain manual proof. Human task
observations remain rendered-state evidence, not visual-quality judgments.

## Completed full-check retry and remaining commands

`RUST_TEST_THREADS=1 npm run check` passed formatting, Clippy, workspace Rust tests,
crash-reconciliation tests, native builds, package builds, and TypeScript checks.
The previously timed-out app-server test passed; that package reported 281/281.
The broader Vitest phase reported **2,641 passed, three failed, three skipped**
across 207 files (205 passed, one failed, one skipped). All three failures are
unchanged cases in `packages/harness-host/test/prime-agent.test.ts` named
“preserves configured thinking through the actual native request” (true/true,
true/false, false/false). They expect provider `unknown`, but receive `anthropic`.
These failures were already reproduced before the full-provider changes. The
full check therefore remains **failed**, not a pass based on isolated reruns.

Commands skipped by that failure were run separately:

- `npm run test:codex-secret-boundary`: two tests passed.
- Python graph-client unittest discovery: 43 tests passed.
- `npm run lint:ladybug-receipt`: passed, including its nested receipt checks.
- `npm run prd:check-readability`: initially found one new 27-word sentence.
  Splitting that list into shorter sentences resolved it; the rerun passed.
  This was a documentation-only edit after runtime proof, with no executable
  source change. The refreshed review digest is recorded above.
