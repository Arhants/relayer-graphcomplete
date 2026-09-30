# Desktop-owned social preview evidence

The accepted behavior is PRD SOC-001 through SOC-003 and ADR 0012. The desktop captures its frozen redacted share export in the current light/dark appearance. It closes Node Details, waits for layout, and uses Fit. It never captures the user's live desktop or changes its navigation. Old shares keep generic social metadata.

## Deterministic checkpoints

- `test/appearance.test.mjs`: production share callback resolves System and explicit appearance; `test/share-preview-capture.test.mjs`: setup failures retain export classification and session teardown.

- `test/share-preview-publish.test.mjs`: theme freezes before export; retry/reopen reuses snapshot, PNG, descriptor and identity; changed lazy preview records fail before upload; account changes during capture block publication; separate PNG upload carries no bearer header.
- Existing coordinator, attempt-store, client and IPC tests retain owner, restart, quota and old V1 compatibility coverage.
- Private service PNG tests reject wrong dimensions, duplicate headers, invalid structure/CRC, APNG, oversize and trailing bytes before publication.
- Private service tests cover preview descriptor conflict, missing/invalid upload, retained partial copy, lost acknowledgement, two independent finalizers, pinned read, quota once, generic legacy metadata and deletion before reads.

## Real desktop capture

Run `npm run prepare:renderer` then `npm run evidence:share-preview`. The runner uses the production capture service, Electron window, bundled public viewer and synthetic fixture. It verifies distinct 1200×630 PNGs, cancellation during window startup, closed loopback server and no remaining windows. Light and dark PNGs here are the inspected output. The generated receipt binds them to every served renderer file (src, vendor, assets, and styles.css), with a path-to-SHA-256 manifest and aggregate digest checked before and after capture, plus capture and publication source hashes. Regenerate the receipt and PNGs after renderer changes. Offscreen paint capture was rejected after it omitted unchanged header pixels; the implementation uses a hidden ordinary window.

## Joined local transport

In the private service checkout, run `node share-service/scripts/prove-desktop-preview.mjs PUBLIC_CHECKOUT VIEWER_ARTIFACT`. It consumes the Electron PNGs and drives the real desktop client and service reserve/upload/finalize/serve path. Authentication and storage are deterministic in-memory fixtures. Both PNGs must be byte-identical after retrieval, with hosted image metadata present. This is not live AWS/Auth0 or social-platform proof.

The full repository check/build and PR review results are reported separately. Hosting rollout, legacy/new-client compatibility against deployment, and LinkedIn/X crawler acceptance remain deployment checks. A desktop release is needed for users to create previews.

## 0.2.33 startup repair

The installed 0.2.33 archive reproduced `ERR_MODULE_NOT_FOUND` when importing
`main/services/share-preview-capture.mjs`. Its static relative template import
looked inside `app.asar`, while electron-builder puts renderer files in the
sibling `Resources/renderer` directory. The capture service now resolves the
module from the existing runtime renderer directory during capture. Missing
renderer/template failures stay inside the export-error boundary.

`test/share-preview-packaged-import.test.mjs` copies the real service and template
into that split layout, imports the relocated service, and requests the actual
rendered HTML through its HTTP server. It failed before the fix and passes after
it. Electron is mocked there; the real light/dark capture evidence above is
separate.

`startup-repair.png` and `startup-repair.json` record a local unsigned
production-shaped launch reaching the normal provider screen with an isolated
profile. Assembly reused unchanged native binaries from signed 0.2.33 and ran
electron-builder `--dir --mac --arm64`, with explicit release artifact mode,
Preview channel, and the normal update base URL in extraMetadata. The ordinary
unsigned development package separately hit its existing invalid-release-metadata
error. The test package was not installed or published. This diagnostic does not
certify signing, updater installation, or a future signed candidate: that exact
candidate must still pass a real application launch before publication.
