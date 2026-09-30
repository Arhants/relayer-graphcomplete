import { describe, expect, it } from "vitest";

import {
  DESIGN_DEFAULT_EDGE_SHAPE,
  EDGE_SHAPES,
  graphEdgePath,
  graphLayerCircle,
  resolveEdgeShape,
} from "../desktop/renderer/src/product-workspace/edge-shapes.js";

const pill = { halfWidth: 60, halfHeight: 18 };
const shortPill = { halfWidth: 40, halfHeight: 18 };
const dot = { halfWidth: 0, halfHeight: 0 };
const ring = (count, radius, centre = { x: 300, y: 200 }) => Array.from({ length: count }, (_, index) => {
  const angle = -Math.PI / 2 + (index * 2 * Math.PI) / count;
  return { x: centre.x + radius * Math.cos(angle), y: centre.y + radius * Math.sin(angle) };
});
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const arcRadius = (d) => Number(/A([\d.]+) /.exec(d)[1]);

describe("layer edge shapes", () => {
  it("draws every shape the same whichever endpoint it starts from, as one unmarked stroke", () => {
    const nodes = [{ x: 300, y: 80 }, { x: 470, y: 210 }, { x: 290, y: 330 }, { x: 120, y: 200 }];
    const circle = graphLayerCircle(nodes);
    for (const shape of EDGE_SHAPES) {
      for (const [a, b] of [[nodes[0], nodes[1]], [nodes[0], nodes[2]], [nodes[3], nodes[1]], [nodes[2], nodes[3]]]) {
        const forward = graphEdgePath(shape, a, b, { sourceBox: pill, targetBox: shortPill, circle });
        const backward = graphEdgePath(shape, b, a, { sourceBox: shortPill, targetBox: pill, circle });
        expect(backward, `${shape} ${JSON.stringify([a, b])}`).toEqual(forward);
        // One subpath and nothing else: no arrowhead, tick or taper.
        expect(forward.d).toMatch(/^M[^M]+$/);
      }
    }
  });

  it("bows gentle arcs away from the layer's centre by a capped amount", () => {
    const edge = [{ x: 0, y: 100 }, { x: 200, y: 100 }];
    const below = { centre: { x: 100, y: 300 }, radius: 0 };
    const above = { centre: { x: 100, y: -100 }, radius: 0 };
    // A 200px edge bows 24px (0.12 x chord), away from whichever side the layer lies on;
    // the sweep flag draws the bow on the same side as its midpoint.
    expect(graphEdgePath("arc-outward", ...edge, { sourceBox: dot, circle: below })).toMatchObject({ middle: { x: 100, y: 76 }, d: expect.stringMatching(/ 0 0 1 200 100$/) });
    expect(graphEdgePath("arc-outward", ...edge, { sourceBox: dot, circle: above })).toMatchObject({ middle: { x: 100, y: 124 }, d: expect.stringMatching(/ 0 0 0 200 100$/) });
    // With the centre on the edge itself (a two-node layer) the side is still fixed.
    const onChord = { centre: { x: 100, y: 100 }, radius: 100 };
    expect(graphEdgePath("arc-outward", edge[1], edge[0], { sourceBox: dot, circle: onChord }).middle).toEqual({ x: 100, y: 76 });
    // Long edges bow at most 24px, scaled by zoom; tiny edges are straight.
    const long = [{ x: 0, y: 100 }, { x: 1000, y: 100 }];
    expect(graphEdgePath("arc-outward", ...long, { sourceBox: dot, circle: { centre: { x: 500, y: 400 }, radius: 0 } }).middle).toEqual({ x: 500, y: 76 });
    expect(graphEdgePath("arc-outward", ...long, { sourceBox: dot, circle: { centre: { x: 500, y: 400 }, radius: 0 }, zoom: 0.5 }).middle).toEqual({ x: 500, y: 88 });
    expect(graphEdgePath("arc-outward", { x: 0, y: 0 }, { x: 3, y: 0 }, { sourceBox: dot }).d).toBe("M0 0L3 0");
  });

  it("turns a hub's spokes one way, however slightly the spokes are off centre", () => {
    const hub = { x: 300, y: 200 };
    const spokes = [{ x: 300, y: 60 }, { x: 460, y: 200.3 }, { x: 300.2, y: 340 }, { x: 140, y: 199.9 }];
    const circle = graphLayerCircle([hub, ...spokes]);
    for (const spoke of spokes) {
      const { middle } = graphEdgePath("arc-outward", hub, spoke, { sourceBox: dot, circle });
      // The bow sits to the left of the direction leading out from the hub.
      const out = { x: spoke.x - hub.x, y: spoke.y - hub.y };
      const bow = { x: middle.x - (hub.x + spoke.x) / 2, y: middle.y - (hub.y + spoke.y) / 2 };
      expect(bow.x * out.y - bow.y * out.x).toBeGreaterThan(0);
    }
  });

  it("puts every arc-circle edge on one circle around the layer's centre, clear of the pills", () => {
    for (const [nodes, box] of [[ring(3, 120), dot], [ring(6, 200), pill]]) {
      const circle = graphLayerCircle(nodes);
      expect(circle.radius).toBeCloseTo(distance(nodes[0], circle.centre), 9);
      for (const [index, a] of nodes.entries()) {
        const b = nodes[(index + 1) % nodes.length];
        const path = graphEdgePath("arc-circle", a, b, { sourceBox: box, circle });
        expect(arcRadius(path.d)).toBeCloseTo(circle.radius, 6);
        // The arc's ends and midpoint are on the same circle, so it bows outward along it.
        const [x1, y1] = /^M([-\d.e]+) ([-\d.e]+)/.exec(path.d).slice(1).map(Number);
        expect(distance({ x: x1, y: y1 }, circle.centre)).toBeCloseTo(circle.radius, 6);
        expect(distance(path.middle, circle.centre)).toBeCloseTo(circle.radius, 6);
        if (box === pill) expect(distance({ x: x1, y: y1 }, a)).toBeGreaterThan(pill.halfHeight * 0.99);
      }
    }
  });

  it("routes elbows as a Z along their axis, out of each pill's facing end", () => {
    const [a, b] = [{ x: 100, y: 100 }, { x: 400, y: 250 }];
    expect(graphEdgePath("elbow-horizontal", a, b, { sourceBox: pill })).toEqual({
      d: "M160 100L242 100Q250 100 250 108L250 242Q250 250 258 250L340 250",
      middle: { x: 250, y: 175 },
    });
    expect(graphEdgePath("elbow-vertical", a, b, { sourceBox: pill })).toEqual({
      d: "M100 118L100 167Q100 175 108 175L392 175Q400 175 400 183L400 232",
      middle: { x: 250, y: 175 },
    });
    // Edges between the same two columns cross on one line, whatever their pill widths.
    const crossing = (path) => Number(/Q([\d.]+) /.exec(path.d)[1]);
    expect(crossing(graphEdgePath("elbow-horizontal", a, { x: 400, y: 20 }, { sourceBox: pill, targetBox: shortPill })))
      .toBe(crossing(graphEdgePath("elbow-horizontal", a, { x: 400, y: 180 }, { sourceBox: pill, targetBox: pill })));
    // A crossing pulled toward a wide pill still leaves each pill forwards.
    const clamped = graphEdgePath("elbow-horizontal", { x: 0, y: 0 }, { x: 150, y: 100 }, { sourceBox: { halfWidth: 100, halfHeight: 18 }, targetBox: { halfWidth: 20, halfHeight: 18 } });
    const xs = [...clamped.d.matchAll(/[MLQ]([-\d.]+) /g)].map((match) => Number(match[1]));
    expect(xs).toEqual([...xs].sort((left, right) => left - right));
    // A downward exit clears the node's caption.
    expect(graphEdgePath("elbow-vertical", { x: 0, y: 0 }, { x: 100, y: 200 }, { sourceBox: { ...pill, bottom: 40 } }).d).toMatch(/^M0 40L/);
    // Pills that overlap along the axis are joined straight.
    const stacked = [{ x: 100, y: 100 }, { x: 120, y: 300 }];
    expect(graphEdgePath("elbow-horizontal", ...stacked, { sourceBox: pill }))
      .toEqual(graphEdgePath("straight", ...stacked, { sourceBox: pill }));
  });

  it("draws default, missing and unknown shapes with the design's default", () => {
    expect(DESIGN_DEFAULT_EDGE_SHAPE).toBe("arc-outward");
    for (const shape of ["default", undefined, null, "arc-inward", "flow", 7]) {
      expect(resolveEdgeShape(shape)).toBe(DESIGN_DEFAULT_EDGE_SHAPE);
    }
    for (const shape of EDGE_SHAPES.filter((item) => item !== "default")) expect(resolveEdgeShape(shape)).toBe(shape);
    const context = { sourceBox: pill, circle: graphLayerCircle([{ x: 0, y: 0 }, { x: 300, y: 120 }, { x: 0, y: 240 }]) };
    expect(graphEdgePath("arc-inward", { x: 0, y: 0 }, { x: 300, y: 120 }, context))
      .toEqual(graphEdgePath(DESIGN_DEFAULT_EDGE_SHAPE, { x: 0, y: 0 }, { x: 300, y: 120 }, context));
  });
});
