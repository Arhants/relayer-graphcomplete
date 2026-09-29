# Native provider isolation diagnosis and repair

This follow-up preserves the earlier failed full-check evidence. It does not turn an unchanged passing retry into resolution. No paid inference was used: a fixed loopback Responses server returned a presence-only shell probe, with synthetic credentials and fresh Codex homes.

## Causal experiment

Five isolated original scenarios passed. The stronger direct `printenv` predicate also passed once in isolation. Nine runs at concurrency three reproduced provider-variable exposure in eight cases. A minimal three-scenario batch then reproduced it.

The one-variable A/B/B/A experiment used `features.shell_snapshot` in the fixture configuration. Enabled snapshots exposed both provider variables in all three cases of baseline A and all three cases of baseline B. Both disabled controls passed all three scenarios. Passing console output was suppressed by Vitest, so the initial comparison JSON has empty observation arrays for those controls. A further disabled batch wrote three explicit observation files and passed.

After the production fix, the original concurrent diagnostic fixture explicitly enabled snapshots again. All three shells excluded both provider variables, retained graph URL/token/node variables, and matched their unique case marker. The production command-line override takes precedence. See `postfix-original-trigger.txt` and observations `1f17d7435947`, `1835b74e5f89`, and `f7c0f4f5a75c`.

The shipping regression failed before the production fix (`regression-red.txt`) and passed after it (`regression-green.txt`). It now exercises three simultaneous independent native executions. The existing parent/child graph-capability scenario remains. Unit checks pass 46 tests (`unit-final.txt`), including unchanged subscription overrides.

## Identity and mechanism

- Native: codex-cli 0.147.0, Darwin arm64; binary SHA-256 `19c4f144c5226a9f17c58e6f0fa854843b0f77a6eb420f40e2745a12f10f5d37`.
- Node: 22.23.2. Ambient provider-key, provider-URL, CODEX_HOME and binary-override variables were absent (presence only).
- Enabled fixture config SHA-256: `2f24c6f7610e55b55932efffe019eed4a0ccd16a10c2195d3cc244abdc5a5bb7`.
- Disabled fixture config SHA-256: `8302821c311b1830e12bda141e24fef5141ae9da78dcfc1b59a9da14a054285b`.
- A/B probe identity is recorded in `snapshot-comparison.json`. The archived diagnostic probe is its later observation-file-writing revision; it is evidence tooling, not a shipped test or part of the default suite.
- The native feature listing reports shell_snapshot stable/default true. No runtime or dependency version changed.

Pinned upstream [snapshot creation](https://raw.githubusercontent.com/openai/codex/rust-v0.147.0/codex-rs/core/src/shell_snapshot.rs) captures shell exports from a subprocess inheriting the provider process environment. Its exclusion list covers PWD and OLDPWD. The [runtime wrapper](https://raw.githubusercontent.com/openai/codex/rust-v0.147.0/codex-rs/core/src/tools/runtimes/mod.rs) sources that snapshot before the command and restores explicit environment overrides. These sources support the restoration mechanism; the config A/B experiment establishes the causal effect in this native binary. Timing of asynchronous snapshot readiness is an inference explaining why isolated fast probes may pass, not separately measured proof.

The repair disables snapshots only for secret-backed execution while retaining both explicit provider-variable exclusions. Subscription configuration is untouched. This is source-bound macOS evidence, not proof for other runtime versions or platforms.

## Qualification

`tested-source.json` identifies executable freeze `63992a635b50ef6b2368e50ca4d0c283d13f862dec7df8e2542990fb72901447`. Full check and build passed on this freeze. The full check passed all Rust stages, 207 JavaScript files / 2680 tests, two native boundary tests, 43 Python tests, receipt lint and PRD readability. Both independent reviews passed; see `independent-review.json`. The archived logs, diagnostic source, and this record are added after that freeze; their inventory is separate. These results clear the isolation hold for the already-authorized bounded live demonstration. Earlier attached-navigation heavy receipts retain their exact prior source identities; none is silently recertified here.
