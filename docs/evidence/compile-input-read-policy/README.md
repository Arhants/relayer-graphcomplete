# Bounded compile-input read-policy diagnostic

Source baseline fb6e9c962eabf6e5f84c12cb0e5d570114a83a68. This successor leaves
#546 and parked #553 unchanged. It changes no product behavior, production cache,
required chapter, test selection, timeout, native ceiling or paid-inference policy.
PRD §15E/16.1 retains the distinction between diagnostic and product proof.

The earlier inventory cannot prove which files dependency build scripts or
procedural macros might read. This diagnostic stages two sources at the same
container path: every tracked file as control, and the declared repository
projection as treatment. Each gets an empty private target. No test output or
compiler-object cache is reused. Required file-read failures identify missing
inputs; successful compilation demonstrates only this recipe/snapshot, not
semantic equivalence or a validated production cache identity.

## Supported diagnostic recipe

`scripts/ci/compile-inputs/launch.py` pins and records the image digest, toolchain, environment,
absolute paths, source manifests, registry extraction receipt and qualified native
inventory. It uses a nonroot container with no network, no host home and a read-only
root/source/registry/native filesystem. Only fresh target, Cargo bookkeeping, tmp
and evidence roots are writable. Control and treatment run sequentially with the
same resource limit (two CPUs, 8 GiB memory/swap ceiling, 512 PIDs). The pinned image is
`sha256:9051430ada55d8edc9751e8e8a61811c7d29a41a502a2d4bedc3d762211cbeb8`.
A Linux alarm bounds preparation and execution to at most 1,200 seconds, plus
up to 30 seconds for owned-container cleanup. The factory grant must include an
independent outer watchdog and cleanup check; a launcher receipt alone does not
prove resource release. The unique owned container name is written before launch
so the outer watchdog can target it even if the launcher is interrupted. No previous target is mounted. Compilation is the complete
default workspace `cargo test --workspace --frozen --no-run --message-format=json`.
The production test chapter is unchanged and remains authoritative.

The script validates declared inputs before and after execution. It is not a
sandbox by itself; isolation belongs to the recorded launcher. Native preparation
uses the unchanged production verifier and 800 MiB ceiling. One cache-only Actions
job may export a qualified dependency for one day; a miss/rejection stops preparation
without a source-build fallback. The private consumer must reverify the archive
receipt, exact inventory and production native policy. This is dependency preparation,
not evidence that compiled-test cache transport works.

Locked registry archives are checksum-verified and safely extracted to a fresh
source tree. Linked members, non-registry dependencies, corruption and expanded
size overflow reject preparation. Extracted existing Cargo sources are never the
provenance authority. Cargo index/cache bytes, the explicit `CACHEDIR.TAG` bookkeeping file and the
extraction receipt remain
explicit inputs. The entire prepared registry is mounted read-only, including its parent, so Cargo
cannot introduce unrecorded registry bookkeeping. Unknown dependency/configuration
overrides stop the recipe.

## Input meaning and limits

`trackedSourceDigest` identifies tracked bytes/modes/paths only. The narrower
`candidateCompileDigest` includes crates, migrations, build support, Cargo and
configuration files, plus graph-query documents and fixtures embedded by tests.
Runtime permission catalogs and TLA traces remain separate fresh-test inputs.
Graph-query fixtures have mixed compile/runtime ownership. No excluded path is
proved irrelevant by a passing mutation fixture or one successful compilation.

Optional file reads can change generated behavior while compilation succeeds.
Clock, randomness, proc/sys, process metadata and image filesystem behavior remain
explicit assumptions/unqualified dimensions. No claim of universal determinism is
made. `completeDigest` stays null; no caller flag promotes it. Fresh doctest/example
execution equivalence, runtime loader behavior and actual cache benefit are not
established by this compile-only diagnostic.

## Seam/checkpoint map

| Executable seam | Checkpoint |
| --- | --- |
| Source staging and identity | Real included read succeeds; excluded required read fails; optional read remains a limitation; bytes/mode/new/untracked input drift is visible |
| Recipe execution | Wrong source/native/toolchain/image/environment/registry rejects before execution; receipts preserve inner exits independently |
| Owned-container cleanup | Stop/inspect timeouts still attempt forced removal; cleanup errors remain explicit |
| Native consumer extraction | Exact transported archive and extracted inventory match; corruption and links reject before unchanged native qualification |
| Registry extraction | Real locked archive extracts; corruption and linked members reject |
| Historical normalization | Actual checkout overrides workflow head; truncated inventories stay unknown; actual tracked workspace guards include workspace manifests; drift prevents applicability |
| Candidate audit | Successful earlier writer before selected-job start and accessible ref only; cancelled/late/foreign/unqualified writers cannot become complete hits |
| Native dependency workflow | Cache-only, unchanged verifier before export, no compiler/test execution or unrelated artifact upload |

The Python scenarios run through `test/ci-compile-inputs.test.mjs` on Unix; the
workflow is Linux-only. Existing conservative CI ownership remains full coverage.
No test is retired. Required gates are `npm run check` and `npm run build` before
commit, with source-bound adversarial review. Actual read-policy compilation needs
one separately granted bounded Linux window; partial results and failures survive
its deadline. Plan, execution and evidence will be reported separately in the PR.

## Historical audit

`history.py` consumes retained raw checkout logs, job/run metadata, commit/tree API
responses and an explicit captured selection. Candidate Git-blob projection digests
are a separate namespace from filesystem SHA-256 manifests. Current build/discovery
guards must match before candidate compatibility is counted. Historical native,
toolchain, environment, cache version, publication and retention are not inferred.
Successful writers are hypothetical; actual cache hits remain unknown. Unknown
base/default-ref visibility is not fabricated. Same-ref visibility can still be
reported when evidenced by the PR checkout ref. Attempts and selected-job start
cutoffs remain explicit; earlier workflow creation is not the cutoff.

A current controlled recipe cannot retroactively qualify old unconstrained builds.
Do not relabel the previous 0/24 full-tree bound or 12/24 static projection as hits.
Stop this experiment with measured go/no-go and named missing inputs; do not grow
transport machinery or production sandbox policy to force a positive result.
