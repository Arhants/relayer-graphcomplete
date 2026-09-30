import { describe, expect, it } from "vitest";
import {
  GRAPH_WORLD_HEIGHT,
  GRAPH_WORLD_WIDTH,
  graphLayoutSignature,
  projectLayerNodePositions,
} from "../desktop/renderer/src/product-workspace/graph-layout.js";

const bounds = { halfWidth: 82, top: 28, bottom: 72 };
const nodes = [
  { id: 3, layoutBounds: bounds },
  { id: 1, layoutBounds: bounds },
  { id: 2, layoutBounds: bounds },
];

function authoredLayer(placements) {
  return {
    layer: {
      id: 9,
      layout: { version: 1, placements },
    },
  };
}

describe("product workspace graph layout", () => {
  it("projects authored normalized coordinates into one stable node-padded world plane", () => {
    const layer = authoredLayer([
      { nodeId: 1, x: 0, y: 0 },
      { nodeId: 2, x: 0.5, y: 0.5 },
      { nodeId: 3, x: 1, y: 1 },
    ]);
    const projected = projectLayerNodePositions(layer, nodes);

    expect(projected.source).toBe("authored");
    expect(projected.positions.get("1")).toEqual({ x: 114, y: 60 });
    expect(projected.positions.get("2")).toEqual({ x: 480, y: 298 });
    expect(projected.positions.get("3")).toEqual({ x: 846, y: 536 });
    expect(GRAPH_WORLD_WIDTH).toBe(960);
    expect(GRAPH_WORLD_HEIGHT).toBe(640);
  });

  it("preserves authored alignment and is independent of node and placement order", () => {
    const placements = [
      { nodeId: 1, x: 0.2, y: 0.4 },
      { nodeId: 2, x: 0.5, y: 0.4 },
      { nodeId: 3, x: 0.8, y: 0.4 },
    ];
    const first = projectLayerNodePositions(authoredLayer(placements), nodes);
    const second = projectLayerNodePositions(
      authoredLayer([...placements].reverse()),
      [...nodes].reverse(),
    );

    expect([...first.positions]).toEqual([...second.positions].reverse());
    expect(new Set([...first.positions.values()].map((point) => point.y)).size).toBe(1);
  });

  it("uses the largest rendered node bounds globally without warping authored relationships", () => {
    const layer = authoredLayer([
      { nodeId: 1, x: 0, y: 0 },
      { nodeId: 2, x: 1, y: 1 },
    ]);
    const projected = projectLayerNodePositions(layer, [
      { id: 1, layoutBounds: { halfWidth: 40, top: 20, bottom: 40 } },
      { id: 2, layoutBounds: { halfWidth: 120, top: 35, bottom: 180 } },
    ]);

    expect(projected.positions.get("1")).toEqual({ x: 152, y: 67 });
    expect(projected.positions.get("2")).toEqual({ x: 808, y: 428 });
  });

  it("projects waypoints exactly as it projects nodes, including when overlapping boxes are spread apart", () => {
    const placements = [
      { nodeId: 1, x: 0.45, y: 0.5 },
      { nodeId: 2, x: 0.55, y: 0.5 },
      { nodeId: 3, x: 0.5, y: 0.52 },
    ];
    const projected = projectLayerNodePositions(authoredLayer(placements), nodes);
    const spread = projected.positions.get("2").x - projected.positions.get("1").x;
    expect(spread).toBeGreaterThan(0.1 * (GRAPH_WORLD_WIDTH - 2 * (bounds.halfWidth + 32)));
    for (const { nodeId, x, y } of placements) expect(projected.project({ x, y })).toEqual(projected.positions.get(String(nodeId)));
  });

  it("centers a legacy one-node layer and deterministically places larger legacy layers", () => {
    const one = projectLayerNodePositions({ layer: { id: 1 } }, [{ id: "only", layoutBounds: bounds }]);
    expect(one.source).toBe("legacy");
    expect(one.positions.get("only")).toEqual({ x: 480, y: 298 });

    const first = projectLayerNodePositions({ layer: { id: 2 } }, nodes);
    const second = projectLayerNodePositions({ layer: { id: 2 } }, [...nodes].reverse());
    expect(Object.fromEntries(first.positions)).toEqual(Object.fromEntries(second.positions));
    expect(new Set([...first.positions.values()].map(({ x, y }) => `${x}:${y}`)).size).toBe(3);
  });

  it("canonicalizes node, edge, and placement order in the view signature", () => {
    const placements = [
      { nodeId: 1, x: 0.2, y: 0.4 },
      { nodeId: 2, x: 0.8, y: 0.4 },
    ];
    const layer = authoredLayer(placements);
    const reverseLayer = authoredLayer([...placements].reverse());
    const edges = [{ endpoints: [1, 2] }];

    expect(graphLayoutSignature(layer, [{ id: 1 }, { id: 2 }], edges)).toBe(
      graphLayoutSignature(reverseLayer, [{ id: 2 }, { id: 1 }], [{ endpoints: [2, 1] }]),
    );
    expect(graphLayoutSignature(
      authoredLayer([{ nodeId: 1, x: 0.3, y: 0.4 }, placements[1]]),
      [{ id: 1 }, { id: 2 }],
      edges,
    )).not.toBe(graphLayoutSignature(layer, [{ id: 1 }, { id: 2 }], edges));
  });

  it("spreads wide Sticker pills apart until none overlap, keeping the authored order", () => {
    const pill = (id, halfWidth = 124) => ({ id, layoutBounds: { halfWidth, top: 18, bottom: 18 } });
    // Three rows of three wide pills, as an agent lays out a nine-node explanation.
    const grid = Array.from({ length: 9 }, (_, index) => pill(index + 1));
    const layer = authoredLayer(grid.map((node, index) => ({ nodeId: node.id, x: [0.1, 0.5, 0.9][index % 3], y: [0.1, 0.5, 0.9][Math.floor(index / 3)] })));
    const positions = projectLayerNodePositions(layer, grid).positions;
    const box = (node) => {
      const point = positions.get(String(node.id));
      return { left: point.x - 124, right: point.x + 124, top: point.y - 18, bottom: point.y + 18 };
    };
    for (const [index, a] of grid.entries()) {
      for (const b of grid.slice(index + 1)) {
        const [first, second] = [box(a), box(b)];
        const apart = first.right + 24 <= second.left + 1e-9 || second.right + 24 <= first.left + 1e-9
          || first.bottom + 16 <= second.top + 1e-9 || second.bottom + 16 <= first.top + 1e-9;
        expect(apart, `nodes ${a.id} and ${b.id} overlap`).toBe(true);
      }
    }
    const xs = grid.slice(0, 3).map((node) => positions.get(String(node.id)).x);
    expect(xs).toEqual([...xs].sort((left, right) => left - right));
    expect(positions.get("1").y).toBe(positions.get("2").y);

    // A single stacked column spreads vertically only.
    const column = [pill(1), pill(2)];
    const stacked = projectLayerNodePositions(authoredLayer([{ nodeId: 1, x: 0.5, y: 0.49 }, { nodeId: 2, x: 0.5, y: 0.51 }]), column).positions;
    expect(stacked.get("1").x).toBe(stacked.get("2").x);
    expect(stacked.get("2").y - stacked.get("1").y).toBeCloseTo(52);
  });

  it("fails closed for malformed accepted authored layouts instead of using legacy placement", () => {
    expect(() => projectLayerNodePositions(
      authoredLayer([{ nodeId: 1, x: 0.5, y: 0.5 }]),
      [{ id: 1 }, { id: 2 }],
    )).toThrow("exactly one placement");
    expect(() => projectLayerNodePositions(
      authoredLayer([{ nodeId: 1, x: Number.NaN, y: 0.5 }]),
      [{ id: 1 }],
    )).toThrow("invalid normalized coordinate");
    expect(() => projectLayerNodePositions(
      { layer: { layout: { version: 2, placements: [] } } },
      [{ id: 1 }],
    )).toThrow("Unsupported accepted graph layout version");
  });
});
