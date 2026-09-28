# Issue 558 — embed slice 1

This slice supports one **wide** local iframe through the production public viewer.
It does not certify mobile embeds, article scrolling, multiple embeds, hosted
framing/availability, publication, or editorial content. Those remain slices 2–5.
The local review fixture says this explicitly. It uses only fixed synthetic data.

## Changed seams and checkpoints

| Executable seam / promise | Smallest deterministic checkpoint | Browser evidence |
| --- | --- | --- |
| Template presentation, fixed canonical new-tab link; default standalone unchanged | `public-share-viewer.test.mjs`: admitted presentation/routes and both bootstrap journeys | Compact attribution/no download card; real new-window request to `/t/<id>` |
| Bootstrap shell mounting; same adapter and ProductWorkspace | Both bootstrap journeys, rendered navigation, disabled inputs/invokes, no submit authority, and controlled frame-queue checks for newer gestures, breakpoint changes, and disposal | First accepted turn, graph selection, expansion, prior-turn reference, completed result, turn navigation, reload |
| Embed-only equal columns, fit on open/close, and graph width when details closed | Real-browser checkpoint; DOM test cannot measure CSS geometry | Measured graph/inspector bounding boxes and visible nodes after fitting; screenshots |
| Synthetic fixture and loopback framing exception | `public-share-embed.test.mjs`: reader validation and actual local HTTP headers, standalone policy unchanged | Actual iframe; stable parent/frame URLs; no outbound/API requests |
| Fixture runner/evidence provenance | Explicit heavy entry below and source resource hashes | Manifest records executed assertions and captures, not planned claims |

No tests are retired. The parameterized standalone/embed journey checks the same
renderer under two different shell paths; standalone coverage protects default
callers and embed coverage protects the optional host configuration. Existing
snapshot V1/V2 and artifact-closure tests retain format, asset, and packaging
boundaries. Script ownership is registered in the versioned CI map.

## Run and review

Install locked dependencies and prepare renderer vendors, then:

```sh
npx vitest run test/public-share-viewer.test.mjs test/public-share-embed.test.mjs test/public-share-viewer-artifact.test.mjs test/public-share-hosting-boundary.test.mjs
npm run evidence:public-share-embed
npm run evidence:public-share-viewer
npm run review:public-share-embed
```

The review command prints a loopback URL and stays running. The article contains a
real iframe with the generated production template. Its local host allows only
same-origin framing of the fixture embed route, while standalone responses keep
`frame-ancestors 'none'`. This is not the future production allowlist. The template
meta CSP is not a framing authority; the fixture uses an HTTP header. No live CSP,
private service, provider, or user database is touched.

The embed capture uses Electron at 1440x1100 (wide iframe within a local article).
It writes `article-overview.png`, `node-details-split.png`, and `manifest.json` to
`.relayer/evidence/issue-558-embed-slice-one/`. The manifest binds the source commit,
served resource hashes, fixture/template/runner hashes, snapshot digest, browser,
measured geometry, actual checkpoint results, network inventory, and image hashes.
The source digest is over the manifest's sorted source-file hash map. Source edits
invalidate prior evidence. Screenshots need visual inspection in addition to the
assertions. `npm run evidence:public-share-viewer` is the existing independent
standalone desktop/mobile regression entry point; it writes its existing directory.

Before commit, run `npm run check` and `npm run build`. Adversarial review must
cover the exact final source and mapping. Without a PR that review is non-certifying.
Hands-on owner review remains separate from automated/browser evidence. Results
are recorded after running; this README alone is not passing evidence.
