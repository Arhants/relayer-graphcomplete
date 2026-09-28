# Issue 558 — embedded public graphs

The local browser runner exercises wide and mobile cross-origin iframes through
the production viewer, using fixed synthetic data. It covers article scrolling,
long details, lazy loading and independent navigation. It does not certify hosted
framing, production availability, live publication, or screen-reader usability.
Real editorial exports remain uncommitted local review inputs.

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

## Additional seams in slices 2–5

- EMB-005: `configureEmbedReading` capture-phase wheel routing, accessible graph
  and detail regions, cleanup; fixed/system template theme is validated and booted.
  The deterministic event test supplies WheelEvent modifiers explicitly because
  happy-dom omits those fields. Actual scroll/zoom is observed in Chromium.
- EMB-003: responsive replacement details, Back focus, independent bounded detail
  scrolling, nested-layer node bounds (#561), ordinary article wheel scrolling,
  explicit zoom, native lazy iframe loading, fixed theme and per-frame navigation.
  Cross-origin frames use localhost versus 127.0.0.1; fixture CSP admits only the
  loopback parent in addition to self. This is not a production origin exception.
- EMB-006: additive embed protocol route/capability in the public contract; the
  private service owns HTTP allowlist, pinned artifacts, errors and deletion.
  Private tests and deployment records belong in that repository.
- Website: reusable SharedGraph component owns validated URL/height/title/theme,
  native lazy loading and printable standalone link. Real snapshot provenance and
  the republish-after-deployment gate are recorded in the private evidence README.

No tests were deleted. Initial open/close geometry and nested navigation geometry
protect different fit triggers; desktop standalone regression remains separate.

## Run and review

Install locked dependencies and prepare renderer vendors, then:

```sh
npx vitest run test/public-share-viewer.test.mjs test/public-share-embed.test.mjs test/public-share-viewer-artifact.test.mjs test/public-share-hosting-boundary.test.mjs
npm run evidence:public-share-embed
npm run evidence:public-share-viewer
npm run review:public-share-embed
```

The review command prints a loopback URL and stays running. The article contains a
real iframe with the generated production template. Its local host allows self and the configured loopback parent
to frame the fixture embed route, while standalone responses keep
`frame-ancestors 'none'`. This is not the future production allowlist. The template
meta CSP is not a framing authority; the fixture uses an HTTP header. No live CSP,
private service, provider, or user database is touched.

The embed capture uses Electron at 1440x1100 and 390x844, with independent
cross-origin iframes within a local article.
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
