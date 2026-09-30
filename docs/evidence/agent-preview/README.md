# Agent draft preview evidence

The accepted behavior is PRD §11.10, PREV-001 through PREV-005 (issue #617). A successful `submitLayer`, and `submitNode` for a node with authored detail, returns an image of the agent's own draft. The image is advisory and never affects acceptance.

## Deterministic checkpoints

- **PREV-001:** `crates/relayer-graph-server/src/draft_preview.rs` tests use a fake render bridge. They cover layer and authored-node previews, no image for plain nodes, fresh images after a change, cached images for identical content, a failed render that still commits the write, no `preview` field without support or a renderer, the render ceiling, and interaction scoping.
- **PREV-002:** `packages/graph-client/test/preview.test.ts` and `python/relayer-graph/tests/test_preview.py` cover the `preview` field and the written PNG. `packages/harness-host/test/draft-preview-bridge.test.ts` covers the transient preview folder, the render route's authorization, and metadata-only trace events. `packages/harness-host/test/codex-basic.test.ts` and `configuration.test.ts` cover the flag, the Codex environment, and guidance omission. `test/draft-preview-framing.test.mjs` covers sizing a page frame to the in-app frame.
- **PREV-003:** `npm run test:eval-graph-preview` runs `fixture.graph-preview` through the real Eval host process and its Playwright renderer. It checks the author, see, fix and see-again loop, the cached repeat, metadata-only trace events, and the three PNGs Eval keeps beside the candidate trace.

## Real Electron capture (PREV-004)

Run `npm run prepare:renderer`, `cargo build -p relayer-app-server -p relayer-graph-server`, `npm run build:packages`, then `npm run evidence:agent-preview`. The runner drives `fixture-graph-preview` through the real graph server, harness host and Electron render bridge, once per theme. It checks:

- each PNG's size against the in-app frames: the graph pane is 1164×703 with Node Details closed, and the Node Details panel is 576×844;
- that light and dark images differ;
- that storage planted in the `draft-preview-capture` partition does not survive the next render;
- that no capture window remains.

It then opens a real 1420×900 product window on the accepted turn and re-measures both frames, failing if they drift from `DRAFT_PREVIEW_FRAMES`. The PNGs and `receipt.json` here are the inspected output. The receipt binds them to the source files that produced them.

## Live model proof (PREV-005)

`RELAYER_AGENT_PREVIEW_LIVE=1 npm run evidence:agent-preview:live` spends paid inference through the Eval profile's connected Codex provider. It runs `codex-basic` on `empty-project.hierarchical-overview.single-turn`. It passes only when Codex's trace shows an `imageView` of a `submitLayer` preview and the turn was accepted. It makes no claim that previews improve quality.
