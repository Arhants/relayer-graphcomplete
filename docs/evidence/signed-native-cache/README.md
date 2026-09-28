# Signed native build cache verification

This change accelerates future macOS arm64 Preview compilation. It does not
certify a candidate, cache checks, or change publication authority. PRD release
contract (section 5), TEL-010 and ADRs 0002/0009/0010 remain authoritative.
The user explicitly requested a separate signed-profile artifact contract.

## Planned checkpoints and changed seams

- Native input identity: reuse reviewed packaging inputs plus signed build,
  telemetry, workflow, profile debug=1, default features and symbol-tool identity.
  Deterministic signed-native-cache fixtures exercise invalidation and overrides.
- Artifact discovery/download: accept only API-authenticated repository/main/manual
  signed workflow provenance, successful producing attempt, immutable artifact ID
  and archive SHA-256. Reject untrusted, expired, corrupt or malformed archives.
- Native payload: exact two unsigned servers and complete matching dSYMs;
  inventories, modes, hashes, UUIDs, architecture and DWARF verification precede
  installation. Fixtures use the production verifier, with native tools stubbed.
- buildReleaseRustServers: verified hit skips native/Cargo compilation, retains
  licensing; rejected/missing entries compile locked/offline with debug=1 once.
  Compiler failures propagate; optional cache failures cannot retry compilation.
- Telemetry: copy verified dSYMs without needing original Cargo objects; recheck
  against freshly packaged binaries, regenerate current release/source maps.
- Evidence collector: include the cache suite in the named telemetry portfolio
  and record cache implementation hashes; collector tests inspect the mapping.
- Workflow: upload only native build output, preserve exact-source main CI,
  signing/notarization and immutable candidate/publication gates.

Warm loop: signed cache, packaging cache, Ladybug lifecycle and telemetry artifact
Vitest suites. Required broad gates: npm run check and npm run build. Applicable
heavy entry: npm run evidence:telemetry. No tests retired. Signed-run cold/hit
comparison, actual dSYM upload/symbolication and notarized candidate inspection
remain a separately authorized future Preview gate. No signed workflow dispatch,
push, publication, live Sentry event or paid inference is authorized here.

## Executed evidence

Base: `f80766648b4ff06b64584c042a7afcd5ccb410f3`, fetched from `origin/main`.
Local branch: `codex/signed-native-cache` in the dedicated managed worktree.
Node: 22.23.2. Rust: 1.98.0. No signed workflow or release action was executed.

Final executable/workflow/test source digest:
`7b9b7fa3c99b41e744cbb404b698fab4086651832e11630f9a289edbfaaf29d1`.
Algorithm: sort the eight paths listed below; hash each UTF-8 path, one NUL, and
its raw 32-byte file SHA-256 into one SHA-256 stream.

```
.github/workflows/desktop-signed-preview.yml
desktop/packaging/signed-native-cache.mjs
desktop/packaging/signed-native-transport.mjs
desktop/release/build-release.mjs
desktop/release/telemetry-artifacts.mjs
scripts/run-telemetry-evidence.mjs
test/signed-native-cache.test.mjs
test/telemetry-evidence.test.mjs
```

### Passed

- Focused warm suite: 55 tests across five files passed. The new signed-cache
  suite has nine cases; it also passed within the final full and telemetry suites.
- `npm run build`: passed, including Rust servers and all TypeScript workspaces.
- Full JavaScript portfolio inside `npm run check`: 206 files passed, one skipped;
  2,688 tests passed, three skipped. Formatting, Clippy, normal Rust tests and
  crash-reconciliation tests also passed in that invocation.
- Remaining check stages run explicitly after the blocked native probe:
  Python 47/47, Ladybug receipts/probe lint and PRD readability passed.
- `npm run evidence:telemetry`: passed. The actual named portfolio ran five
  shared Rust panic-capability cases and 115 tests across 14 JavaScript files.
  The loopback artifact records local privacy proof and keeps release symbol
  upload/symbolication as `not-run`.
- Real macOS arm64 C fixture: production seal, reopen/verify and install routines
  passed with actual `dsymutil` and `dwarfdump`, including compilation units,
  UUID/architecture, DWARF, relocation inventory and destination hashes. This is
  neither a Rust-server build nor signed candidate proof.
- `git diff --check`: passed.

Before compiling Rust, the repository Ladybug artifact verifier accepted the
existing `/tmp/relayer-0816-lbug` bundle for this checkout, darwin-arm64 and
Rust 1.98.0, including source/lock identity and inventory hashes. Local checks
used its exported library/include paths. It was not used as signed-profile
output. No cache verification failure was suppressed to obtain a native hit.

### Failures and unresolved gate

`npm run check` is **not green**. Its final attempt reached the unchanged
`packages/harness-host/test/codex-secret-provider-process.test.ts:138` probe,
which reported `OPENAI_API_KEY_PRESENT` and `OPENAI_BASE_URL_PRESENT` instead of
absence in its model-requested shell. These are synthetic test credentials.
One additional isolated `npm run test:codex-secret-boundary` run reproduced the
failure (one failed, one passed). An earlier invocation passed both cases.
No provider/runtime source or this test was changed. The boundary failure remains
unresolved and must not be hidden by the passing cache or telemetry results.

Earlier attempts are retained separately: the first full check encountered an
Electron first-download race and a test loaded against an earlier in-flight
implementation. Electron 43.0.0 was then installed and verified before rerunning.
The next check passed the runtime/test stages but rejected a new PRD sentence;
its wording was fixed and readability passed. The real symbol probe initially
rejected Xcode's relocation YAML files; the exact generated paths were added to
the inventory and the probe passed. None of these earlier attempts is claimed
as a passing final-source gate.

Local raw logs and machine receipts are retained under
`.relayer/evidence/signed-native-cache/`; the telemetry receipt is
`.relayer/evidence/telemetry-v1.json`. These ignored local artifacts accompany
this checkout; the assertions above are the durable checked-in summary.

### Adversarial review assertions

- Reviewer `cache_contract_review`: exact eight-file digest above; native input
  identity, API producer trust, archive handling, consumer hashes, symbols,
  fallback, workflow and collector seams; no unresolved actionable findings.
- Reviewer `verification_review`: same exact digest; checkpoint mapping, real
  production seams, independent invalidation fixtures and workflow operability;
  no unresolved actionable findings. Reviewer ran the nine cache cases and two
  evidence-collector cases successfully.

Both reviews are **non-certifying without a PR**. Their source assertions apply
only to the recorded executable digest; changing that scope invalidates them.
They do not override the failed repository check or certify a signed candidate.

### Remaining authorized release-context proof

After the repository gate is resolved and changes are reviewed/approved, obtain
separate authorization for cold and compatible-hit signed Preview runs. Verify
actual hosted artifact restore, native-stage avoidance, archive ID/digest and
producer attempt, both Rust binaries and symbols, fresh signing/notarization,
telemetry upload/correlation, and candidate receipts. No hosted hit, Sentry
symbolication, candidate acceptance or publication is claimed here. The existing
Preview run and its source/worktree/tags were not modified.
