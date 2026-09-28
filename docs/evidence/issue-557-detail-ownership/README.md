# Node-owned HTML: issue #557

## Contract and required plan

First successful attachment permanently owns each HTML template, including
fragments. Public components are node-owned. Copies cannot reset ownership;
standalone builders and unrecognized templates are rejected. CSS, assets, and
helpers producing fresh HTML remain reusable. Equivalent independently authored
HTML is deliberately outside this guardrail.

A local node initially has provisional object identity. Checkpoint and submit
bind its owner to the graph endpoint and interaction. Reusing a template on a
replacement object requires `graph.bindNode(original)` and
`graph.bindNode(replacement)` (Python `bind_node`) before attachment, with the
same stable key and scope. A matching key in another interaction cannot adopt
that template. No ownership metadata or migration is added to accepted packages.

Executable seams and their checkpoints are mapped in PRD section 6.2, #557.
The local plan is focused authoring/compiler, Python, packaged resource,
generation recipe and managed-runtime identity tests; `npm run check`;
`npm run build`; the existing desktop visual-detail proof; the inference-free
Prime clean-root proof; and the A/B capture below. No tests were deleted.
Standalone-builder tests now use owned builders; malformed-template and
constructor misuse checks observe the same rejection boundaries earlier.

## Action-bearing repair follow-up

PR review found that a bound replacement could attach an owned template but
could not checkpoint or submit its actions: their source layer still contained
the original exact node object. Both clients now preserve that first owner's
exact provenance for the reused template after validating logical ownership.
They revalidate the original live key and never authorize arbitrary matching-key
nodes or fresh templates through another component's provenance. Python keeps a
weak reference and never treats a collected original as permission to skip
source-layer membership validation. Reused templates require the original exact
owner, not either the original or replacement. A template that was invalid for
its first owner cannot acquire valid action provenance by being reused.

Python validates component keys before claiming ownership, so a failed attachment
with an invalid key leaves both the draft and template ownership unchanged.

The focused regression first reproduced the failure in both clients. Ownership
tests now cover all four capability kinds, checkpoint, submit, repeated repair,
mixed fresh/reused components, same-key strangers, original-key mutation, and
Python owner lifetime. The Prime bridge checkpoint executes the Python client to
produce actual replacement payloads, then runs the production TypeScript bridge
and compiler and verifies identical packages and exact action mounts. The video
below continues to demonstrate sibling rejection and distinct content; it does
not demonstrate action activation or action-bearing repair.

## A-to-B video

The 27-second walkthrough video is assembled from verified stable screenshots.
It uses a deterministic harness with real graph clients, Rust graph
and app servers, SQLite persistence, and the production Electron workspace.
A runs the baseline self-contained graph-client resource built from commit
`f764dd44` before implementation edits. B runs the fixed packaged resource.
Both use the same current renderer. The baseline is a reproduction of the
reported authoring pattern, not a recording of the original user's session.

A accepts the same HTML object on three differently titled nodes. Selecting
each node shows the same detail. B rejects the first attempted sibling
attachment. The actual API error is shown in a clearly labelled recording
annotation, not a product dialog. The fixture then authors three fresh,
node-specific templates while sharing CSS, accepts them, and selects each in
Product. This demonstrates deterministic rejection and explicit fixture repair;
it does not claim autonomous model repair or semantic duplicate detection.

The capture compares full checkpoint packages with accepted output and re-reads
the persisted thread packages. Its manifest records six rendered selections,
baseline/fixed resource hashes, the video hash, and an executable-source delta
digest (base commit plus changed/untracked source hashes, excluding docs).
It verifies that source identity remains unchanged during capture.

Reproduce after building the baseline resource in an isolated checkout and
retaining `agent-resource/index.js` plus a sibling `.json` build receipt with
`sourceCommit`, `sha256`, and `buildCommand`:

```sh
RELAYER_DETAIL_OWNERSHIP_BEFORE=/absolute/path/to/baseline/index.mjs \
  npx electron scripts/capture-detail-ownership-evidence.mjs
```

Each run gets a unique output directory. Failed receipts and any captured frames
are preserved locally rather than being confused with a prior success.

## Environment and failures retained

The local primary checkout's Rust 1.94 cache was incompatible with Rust 1.98.
A trusted local Rust 1.98 target cache was copied using APFS clone semantics.
The repository verifier checked the Ladybug 0.18.0 bundle's lockfile/toolchain/
platform identity and file hashes before reuse. Cargo still compiled and ran
current tests; caches are not test evidence.

The first full check passed its Rust stages but failed six Vitest scenarios and
two suite loads: changed Python bytes needed all three package identity pins
updated, the executable Prime recipe integration expected its previous text,
and concurrent first-use Electron installation collided. The pins and expected
recipe output were corrected; Electron installation completed before rerun.

Early capture attempts exposed obsolete fixture setup: model-less fixture
admission, explicit external-browser authority, current account/onboarding IPC,
and graph connectivity. The baseline also correctly rejected an unsupported
CSS shorthand, which was changed to the supported property. Rapid continuous capture failed with `UnknownVizError` during scene changes.
The final walkthrough captures each verified stable selection once and holds
those real frames in the video; it is not a continuous screen recording. Failed manifests remain under `.relayer/issue557/evidence`.

## Actual runs and review

[Verification receipt](verification.json) records successful `npm run check`,
`npm run build`, the existing Electron visual-detail proof, Prime clean-root
runtime proof, and the final A/B capture. The full check passed 2,789 default
Vitest tests (three intentionally skipped), two separate Codex secret-boundary
tests, and all 57 Python tests, plus Rust and repository contract checks.

[Watch the A-to-B video](video/ownership-a-to-b.mp4). The [video manifest](video/manifest.json)
records the accepted packages and six selected views. The [desktop manifest](desktop-manifest.json)
retains the existing renderer, asset, reopen and import proof.

Adversarial [implementation review](review-implementation.json) and
[evidence review](review-evidence.json) both passed with no unresolved findings.
Their inventories bind assertions to the exact reviewed files; changes invalidate
those assertions. No paid inference,
signed-package, publication, or release-candidate proof is claimed.
