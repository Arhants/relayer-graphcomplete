# Shared product runtime installer

This behavior-preserving refactor implements the user's decision to reuse product
runtime setup in Eval. Product meaning stays in PRD sections 4 and 9 and ADR 0003:
Eval has a separate profile and developer credentials, uses the product runtime,
and must support fixture-only startup without provisioning optional providers.

## Changed seams and required checkpoints

| Seam / promise | Deterministic checkpoint |
| --- | --- |
| Desktop and Eval select the same reviewed Prime JavaScript and Python closure | `test/product-runtime-installer.test.mjs` invokes the production factory's assembly callback for both packaged and checkout recipes, asserting the sealed recipe identities |
| Only Prime receives its assembly hook; assembly failure prevents success | Shared-factory non-Prime and failure checkpoint; existing `test/managed-runtime-installer.test.mjs` retains transaction/integrity/cancellation tests |
| Eval optional runtime stays lazy, including unsupported-platform fixture startup | Existing `test/eval-prime-provider.test.mjs` lazy installer checkpoint |
| Runtime contents, readiness, and resolver behavior remain unchanged | Existing `test/prime-managed-runtime.test.mjs` and installer/resolver tests |
| Desktop wiring uses the shared constructor; its new frame is permitted by the closed telemetry inventory | Updated `test/desktop-shell.test.mjs`; existing telemetry/inventory checks in `npm run check` |
| Clean-root proof calls the same constructor as both hosts | `npm run test:prime-managed-runtime`, macOS arm64, inference-free |

The existing test bodies are retained. One source-wiring assertion follows the
new constructor name; no behavioral tests are retired. The new factory tests
protect packaged versus checkout integrity selection, not another implementation
of runtime assembly. The CI desktop owner includes the new checkpoint and
existing runtime tests. Run `npm run check` and `npm run build` before committing.

## Scope and limits

One shared constructor replaces the copied Prime assembly setup in Desktop, Eval,
and its clean-root proof. Eval still owns lazy initialization, readiness, profile
selection, credentials, and lifecycle. Product retains its own startup policy.
Codex's separate catalog bootstrap and developer login environment remain for a
later design; replacing them with interactive product-provider composition would
change behavior. Browser review and shared-snapshot work are outside this change.

This is a small deduplication, not a claim of large code removal. Required results
and an exact-source adversarial review are recorded separately in the PR or
handoff. No paid inference or release proof is implied.
