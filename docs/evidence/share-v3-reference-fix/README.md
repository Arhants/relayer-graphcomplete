# V3 sharing reference regression

PRD §7.2B and §8.4, AN-003/004, and ADR 0011 require V3 to capture current
accepted navigation across completions. A later completion may reference a layer
reached by an earlier accepted invoke's expand navigation. The snapshot-wide
single-arrival-relation rule previously rejected that valid closure.

## Changed seams and required verification

| Boundary | Production seam | Deterministic observation |
| --- | --- | --- |
| V3 accepts reference backlinks to root and nonroot expanded layers | Rust accepted-view validator, batch and incremental export/import | `conversation_export_contract` V3 backlink regression |
| V1/V2 retain their original mixed-arrival rejection | Rust and public JavaScript validators | Same Rust regression and `public-share-viewer.test.mjs` legacy cases |
| Expansion cycles remain rejected even in components entered only through reference navigation | Rust V3 cycle scan across every expansion component, existing JavaScript scan | Rust reference-entered self-cycle regression and matching public-viewer case |
| Unresolved targets, closure integrity and conversion provenance remain rejected | Existing accepted-view and origin validation | Complete export-contract and public-viewer suites |
| Real accepted current state exports and imports without gaining execution authority | Graph/Product exporter, share exporter, Eval import and re-export | `attached-portability-e2e.test.mjs` now references the accepted invoked nonroot layer from a later completion; immutable imports and invoke denial remain exercised |
| Public privacy filtering, control aliases, pinned assets and navigation survive the same closure | Production share capture and JavaScript reader/workspace | Same real portability journey, optionally joined to private service handlers |
| The changed reader remains bound to actual social preview output | Production Electron capture, renderer receipt | `npm run evidence:share-preview`, inspected light/dark PNGs and `desktop-social-preview-evidence.test.mjs` |

Warm gates are the focused Rust contract and public-viewer suites. Required heavy
gates are `npm run check`, `npm run build`, the Electron preview capture, and the real attached portability journey
joined to the companion share service. The full check includes that process journey;
the joined run separately observes private publication handlers. No paid inference
is required. This change does not alter graph authoring acceptance or permissions.

## Retained observations

Before the implementation, both Rust and JavaScript nonroot backlink regressions
failed with `mixed_target_relations`. After the implementation, the export-contract
suite initially passed all 32 tests and the public-viewer suite passed all 62 tests.
Adversarial review then identified an expansion component entered only through a
reference: Rust's root-only cycle scan could miss its cycle after the arrival rule
was lifted. The added Rust regression reproduced that acceptance before repair;
V3 now checks every expansion component with shared visited state. V1/V2 retain
their existing validation behavior. Final suite counts are recorded on the PR.

The Ladybug native cache was verified against this checkout's pinned upstream
source, Cargo lock, platform, compiler release and bundled hashes before reuse.
An initially cloned dependency tree lacked the workspace's scoped parse5 version;
the package build failed on missing declarations. A clean `npm ci` restored the
locked dependency layout. This infrastructure failure is retained separately from
the red behavior regressions.

The initial full check passed 3,390 JavaScript tests but failed two: the prior
preview receipt no longer matched the changed reader, and ambient Node 26 denied
the secret-boundary network fixture. The declared Electron capture succeeded,
including cancellation and window/server cleanup. Both 1200×630 theme PNGs were
visually inspected and their source-bound receipt regenerated. Final checks use
the repository-pinned Node 22.23.2; the failed run is not a qualification pass.

Concurrent main change #643 updated response presentation and the same preview
evidence. The branch incorporates `ffad82fe10707c7af546d5a6fbe9e9daecb1ad16`,
recaptures the actual renderer output, and repeats the required gates. The PR's
final review and qualification must name that updated source state.

Full checks, joined journey, adversarial review and final source identities are
reported on the pull request. Local proof does not certify a deployed service,
hosted viewer artifact, or installed desktop release.
