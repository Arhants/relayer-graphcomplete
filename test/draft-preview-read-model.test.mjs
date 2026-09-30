import { describe, expect, it } from "vitest";
import { draftPreviewReadModel } from "../desktop/renderer/src/draft-preview/snapshot.js";

const node = (id) => ({ id, kind: "concept", icon: "list", title: `Node ${id}`, detail: "Detail", state: "draft" });

describe("draft preview read model", () => {
  it("presents a draft layer as the user will see it once accepted", () => {
    const model = draftPreviewReadModel({
      version: 1,
      target: { kind: "layer", layerId: 3 },
      layer: { id: 3, nodes: [1, 2], edges: [5], state: "draft" },
      nodes: [node(1), node(2)],
      edges: [{ id: 5, endpoints: [1, 2], state: "draft" }],
      assets: [],
    });
    const { rootLayer } = model.interactions[0].completionOutput;
    expect([rootLayer.layer, ...rootLayer.nodes, ...rootLayer.edges].map(({ state }) => state)).toEqual(Array(4).fill("accepted"));
    expect(model.state.visibleLayer).toBe(rootLayer);
  });

  it("shows a node target as a one-node layer that opens its Node Details", () => {
    const model = draftPreviewReadModel({ version: 1, target: { kind: "node", nodeId: 7 }, layer: null, nodes: [node(7)], edges: [], assets: [] });
    const { layer } = model.interactions[0].completionOutput.rootLayer;
    expect(layer).toMatchObject({ nodes: [7], defaultNodeId: 7, state: "accepted" });
  });
});
