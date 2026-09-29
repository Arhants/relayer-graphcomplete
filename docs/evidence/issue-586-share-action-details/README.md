# Issue 586 — shared authored cards with graph actions

This change preserves custom Node Details with embedded navigation while removing
private author-chosen identifiers. The PRD 8.4 checkpoints are the product authority.
The source fixture is synthetic. No real conversation, account, or paid inference
is used. Hosted upload, auth, publication, and replacement-share creation are separate.

## Required verification plan

| Checkpoint | Changed seam | Deterministic proof |
| --- | --- | --- |
| SHR-UX-001 | Graph-core package derivation; Rust share projection | `cargo test -p relayer-app-server --lib share_bindings`; exact provenance, duplicate keys across turns, absent original layer, corrupt integrity, ambiguous or mismatched binding, original export unchanged |
| SHR-UX-002 | Privacy predicate, node projection, asset collection | `cargo test -p relayer-app-server --lib conversation_export_service`; derived package privacy plus existing asset exclusion; joined V2 image and action case below |
| SHR-UX-003 | Public source-layer alias projection; unchanged production action runtime | `npx vitest run test/public-share-viewer.test.mjs test/node-detail-runtime.test.mjs`; explicit legacy keys win, absent-source generated aliases resolve, input/invoke remain read-only |
| SHR-UX-004 | Production exporter → public reader → production workspace | `npx vitest run test/conversation-export-eval-e2e.test.mjs`; actual frozen Rust bytes, image pin, authored card, embedded expand navigation and unchanged URL |
| Visual/human | Desktop/mobile and light/dark card and button | `npm run evidence:share-action-details`; human review through `npm run review:share-action-details` |

Required heavy entry points: `npm run check`, `npm run build`,
`npm run evidence:public-share-viewer`, `npm run evidence:public-share-embed`,
`npm run evidence:share-action-details`. The production renderer itself is unchanged;
its focused runtime authority tests remain required. No signed/release proof is
claimed or needed for this draft PR.

The old `share_omits_compiled_action_mounts_without_rewriting_private_identity` test
encoded whole-card omission using a placeholder digest. It was replaced only after
the real derivation/export tests passed and adversarial review confirmed their
coverage of original-export preservation and private-key exclusion. Genuine
secret/path and asset-exclusion tests remain: they protect a distinct boundary.

## Reproduce the joined synthetic fixture

After building the runtime and packages:

```sh
RELAYER_SHARE_ACTION_FIXTURE_OUT=docs/evidence/issue-586-share-action-details/synthetic-snapshot.jsonl \
  npx vitest run test/conversation-export-eval-e2e.test.mjs
npm run evidence:share-action-details
npm run review:share-action-details
```

The review command prints the exact loopback share URL. Select **Root evidence**.
Confirm the styled “Meet in the middle” card and its image. Click **Compare
tradeoffs** and confirm arrival at **Expanded detail** without a URL change.
Check light/dark and a narrow viewport. The human gate remains pending until a
person reviews this result; automated screenshots do not accept the product.

`manifest.json` binds the synthetic fixture, served renderer sources, exporter
sources, and four screenshots to hashes. It records dirty source state honestly.
Changing any bound source invalidates that evidence until rerun. The fixture bytes
must come from the joined Rust-export test, not a manually reconstructed public
package.

## Execution record

- The original safe-card assertion failed on the old omission rule (red).
- The first four derivation tests passed, including privacy and integrity failures.
- Review found an old-snapshot alias collision; explicit layer keys now take precedence.
- The first joined fixture failed during authoring, before export; diagnosis retained in the PR work log.
- Native acceleration: the first cache probe used CI-style platform/toolchain labels and was rejected. Verification with the local bundle's actual `darwin-arm64` and full Rust release identity succeeded; all hashes, lockfile, and source contract checks passed. The bundle producer was `92a89d6a`. Changed Rust inputs require fresh runtime compilation; no runtime artifact was reused as proof.
- Final required-check results, source-bound review, and human gate status are recorded in the PR. This document alone makes no pass claim.

## Merge-readiness follow-up

The joined fixture now uses an embedded **expand** action, matching the original
regression. Its target is the existing expansion layer; the separate reference
cycle remains covered by the same scenario. The exact destination is **Expanded
detail**. The earlier reference-only fixture remains historical evidence, not the
final expand checkpoint.

The embed runner previously sent Tab events without awaiting dispatch. A focus
trace changed the result; the uninstrumented runner reproduced the failure.
Awaited Chromium keyboard dispatch now uses the same path as its Escape checkpoint.
The exit condition is unchanged: focus must reach the parent article link.
No product focus behavior or assertion was weakened. The final embed manifest is
saved with its captures in `embed/`; regenerate them with
`npm run evidence:public-share-embed`.

Final follow-up results: actual exporter/expand/navigation scenario passed;
four authored-card visual cases passed; all 35 iframe checkpoints passed.
The iframe exit check also failed as expected in a disposable negative run
that prevented Tab's default action. That negative injection was removed.
The runner asserts focus starts on Fit graph inside the first iframe before
sending Tab. No fixed sleep or retry was added.
