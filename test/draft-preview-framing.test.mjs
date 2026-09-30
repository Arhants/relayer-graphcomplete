import { describe, expect, it } from "vitest";
import { DRAFT_PREVIEW_FRAMES, frameDraftPreview } from "../desktop/main/services/draft-preview-renderer.mjs";

/** A page whose target is an affine function of the viewport, like a split panel. */
function page({ widthRatio, widthOffset, heightOffset }) {
  let viewport = { width: 1420, height: 900 };
  const rect = () => ({ x: 0, y: 0, width: Math.round(viewport.width * widthRatio - widthOffset), height: viewport.height - heightOffset });
  return {
    call: async () => rect(),
    resize: async (next) => { viewport = next; },
  };
}

describe("draft preview framing", () => {
  it("sizes a half-width panel to the in-app Node Details frame", async () => {
    const clip = await frameDraftPreview({
      snapshot: { target: { kind: "node", nodeId: 1 } },
      ...page({ widthRatio: 0.5, widthOffset: 34, heightOffset: 12 }),
    });
    expect(clip).toMatchObject(DRAFT_PREVIEW_FRAMES.node);
  });

  it("sizes the graph pane to the in-app frame", async () => {
    const clip = await frameDraftPreview({
      snapshot: { target: { kind: "layer", layerId: 1 } },
      ...page({ widthRatio: 1, widthOffset: 24, heightOffset: 140 }),
    });
    expect(clip).toMatchObject(DRAFT_PREVIEW_FRAMES.layer);
  });

  it("refuses an unknown target", async () => {
    await expect(frameDraftPreview({ snapshot: { target: { kind: "edge" } }, ...page({ widthRatio: 1, widthOffset: 0, heightOffset: 0 }) }))
      .rejects.toThrow("target is invalid");
  });
});
