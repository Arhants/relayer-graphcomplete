import { describe, expect, it } from "vitest";

import {
  DESIGN_DEFAULT_EDGE_SHAPE,
  EDGE_SHAPES,
  graphEdgePath,
  graphFollowWaypoints,
  graphLayerCircle,
  graphRoutedEdgePath,
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

  describe("per-edge routes", () => {
    // A four-step row whose last step loops back to the first, over the top.
    const collect = { x: 100, y: 200 };
    const evaluate = { x: 700, y: 200 };
    const loop = (shape, waypoints = [{ x: 700, y: 80 }, { x: 100, y: 80 }]) => graphRoutedEdgePath(shape, {
      start: { point: evaluate, box: pill, side: "top" },
      end: { point: collect, box: pill, side: "top" },
      waypoints,
    });
    const numbers = (d) => d.match(/-?[\d.]+/g).map(Number);

    it("leaves and enters the chosen sides and passes through every waypoint", () => {
      expect(loop("straight").d).toBe("M700 182L700 80L100 80L100 182");
      // Elbows turn at right angles with rounded corners, leaving the top side vertically.
      expect(loop("elbow-horizontal").d).toBe("M700 182L700 88Q700 80 692 80L108 80Q100 80 100 88L100 182");
      // Arcs draw one smooth curve whose segments end on each waypoint.
      const arc = loop("arc-outward").d;
      expect(arc).toMatch(/^M700 182C[^A-Z]+ 700 80C[^A-Z]+ 100 80C[^A-Z]+ 100 182$/);
      expect(loop("arc-circle").d).toBe(arc);
      for (const shape of EDGE_SHAPES) expect(loop(shape).d).toMatch(/^M[^M]+$/);
    });

    it("arcs a sides-only route out of its sides and keeps routeless ends on the shape's own path", () => {
      // Both ends at the top: the curve leaves and enters vertically and bows up over the row by a quarter of its length.
      const sidesOnly = loop("arc-outward", []);
      expect(sidesOnly.d).toBe("M700 182C700 32 100 32 100 182");
      expect(sidesOnly.middle).toEqual({ x: 400, y: 69.5 });
      // No sides and no waypoints: exactly the layer shape's path, whatever the route order.
      const plain = graphRoutedEdgePath("elbow-vertical", { start: { point: evaluate, box: pill }, end: { point: collect, box: pill } });
      expect(plain).toEqual(graphEdgePath("elbow-vertical", collect, evaluate, { sourceBox: pill }));
      // A side this build does not know is treated as automatic.
      expect(graphRoutedEdgePath("straight", { start: { point: evaluate, box: pill, side: "north" }, end: { point: collect, box: pill } }))
        .toEqual(graphEdgePath("straight", evaluate, collect, { sourceBox: pill }));
    });

    it("moves waypoints with a dragged node without turning the route", () => {
      const waypoints = [{ x: 700, y: 80 }, { x: 100, y: 80 }];
      const authored = [evaluate, collect];
      expect(graphFollowWaypoints(waypoints, authored, authored)).toEqual(waypoints);
      // Evaluate drops 90px: the waypoint nearer it follows by two thirds, the far one by a third.
      const moved = graphFollowWaypoints(waypoints, authored, [{ x: 700, y: 290 }, collect]);
      expect(moved).toEqual([{ x: 700, y: 140 }, { x: 100, y: 110 }]);
      expect(numbers(loop("straight", moved).d)).toEqual([700, 182, 700, 140, 100, 110, 100, 182]);
    });
  });
});
