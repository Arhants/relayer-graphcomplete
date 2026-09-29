# Native secret-boundary failure: unresolved

The final full check on source `29eeda14452e722400023f2482855a4f0b573122b8592bce336152daaea20b01` failed in the unchanged native Codex secret-provider process test. All preceding workspace Rust, crash-support, build, type, and 2680 JavaScript tests passed. This run stopped before Python, receipt, and readability checks. Those latter checks passed on the preceding executable-identical snapshot, except the then-overlong PRD sentences; the corrected readability check passed separately.

The loopback fake Responses server emits one fixed `exec_command` containing presence-only environment predicates. The native tool output reported `OPENAI_API_KEY_PRESENT` and `OPENAI_BASE_URL_PRESENT`, where both must be absent. Graph URL/token/node markers were present as required. The test uses a synthetic key and loopback endpoint; no actual credential values are included in this evidence. The fake server does not synthesize the returned shell output.

The immediately preceding full check passed both native cases. One isolated unchanged diagnostic invocation after the failure also passed both. These passes do not clear the failed full check. The underlying cause is UNKNOWN; no claim of harmless flakiness or corrected isolation is made. No assertion, timeout, runtime policy, or test was changed, and no further unchanged retries were performed.

Current provenance (captured after failure):

- Native executable: `node_modules/@openai/codex-darwin-arm64/vendor/aarch64-apple-darwin/bin/codex`, `codex-cli 0.147.0`.
- Binary SHA-256: `19c4f144c5226a9f17c58e6f0fa854843b0f77a6eb420f40e2745a12f10f5d37`; file mtime `2026-09-28T04:54:25.898Z` precedes these runs.
- Test SHA-256: `6c35dc81650887c49bfde2a31679c3a931ecb552fe77df8cd82a227a94ad727c`, identical to base `015e5058a25b7f191da3a3addf56454d0e34b6d0`.
- Node: `v22.23.2`. Same declared `npm run test:codex-secret-boundary` command and fresh fixture home/config (`features.plugins = false`).
- Ambient presence-only check: `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `CODEX_HOME`, and `RELAYER_CODEX_BINARY` all absent.
- Production secret-adapter policy supplies the synthetic provider environment to native Codex, then requests both provider variables be excluded from model-requested shells. The failure shows the probe crossed that expected boundary; why it did so remains undetermined.

Earlier invocations did not record per-run native binary hashes. Current bytes and unchanged test/config are verified; retrospective exact binary identity is not asserted. The existing test teardown deleted its temporary homes/raw events, limiting further retrospective diagnosis. Broadening this feature into a native Codex runtime/security change requires a separate user decision.

Paid demo: **NOT RUN**. No live profile graph, model-authored replacement, live B3 context walkthrough, or live reopen/navigation proof exists. Native keyboard and human acceptance are also unproven. Existing deterministic screenshots are fixture evidence only.
