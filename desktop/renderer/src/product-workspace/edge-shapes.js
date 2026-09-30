/**
 * How a layer draws its edges. The agent chooses one shape per layer; the design
 * keeps stroke, colour, weight and bend amount. "default", and any shape this
 * build does not know (from a newer build), draw with the design's default, so
 * older viewers keep working.
 *
 * Keep EDGE_SHAPES aligned with relayer-graph-core, @relayer/graph-client and
 * the Python client.
 */
export const EDGE_SHAPES = Object.freeze([
  "default",
  "straight",
  "arc-outward",
  "arc-circle",
  "elbow-horizontal",
  "elbow-vertical",
]);

// The design owns what "default" draws. Design-config step B2 moves this into
// the structure file as edge.defaultShape.
export const DESIGN_DEFAULT_EDGE_SHAPE = "arc-outward";

const ARC_CURVATURE = 0.12;
const ARC_MAX_BEND = 24;
const ELBOW_CORNER = 8;
// An edge whose line passes this close to the layer's centre, as a share of its length, counts as through it.
const NEAR_CENTRE = 0.1;

export function resolveEdgeShape(shape) {
  return shape !== "default" && EDGE_SHAPES.includes(shape) ? shape : DESIGN_DEFAULT_EDGE_SHAPE;
}

// Where the line from a pill's centre towards another point leaves the pill's outline:
// flat top and bottom, round ends (a capsule of the given half extents).
export function graphPillExit(center, toward, { halfWidth, halfHeight }) {
  const dx = toward.x - center.x;
  const dy = toward.y - center.y;
  const distance = Math.hypot(dx, dy);
  if (!distance) return { x: center.x, y: center.y };
  const ux = dx / distance;
  const uy = dy / distance;
  const flat = Math.max(0, halfWidth - halfHeight);
  let t = uy ? halfHeight / Math.abs(uy) : Infinity;
  if (Math.abs(ux * t) > flat) {
    const cap = Math.sign(ux) * flat;
    t = ux * cap + Math.sqrt(halfHeight * halfHeight - cap * cap * uy * uy);
  }
  return { x: center.x + ux * t, y: center.y + uy * t };
}

// An edge runs between the outlines of its two node pills.
export function graphEdgeSegment(source, target, sourceBox, targetBox = sourceBox) {
  const start = graphPillExit(source, target, sourceBox);
  const end = graphPillExit(target, source, targetBox);
  return { x1: start.x, y1: start.y, x2: end.x, y2: end.y };
}

// The layer's centre and the nodes' mean distance from it. Arcs bow away from
// the centre, and arc-circle edges follow this circle.
export function graphLayerCircle(points) {
  if (!points.length) return { centre: { x: 0, y: 0 }, radius: 0 };
  const centre = {
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
    y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
  };
  const radius = points.reduce((sum, point) => sum + Math.hypot(point.x - centre.x, point.y - centre.y), 0) / points.length;
  return { centre, radius };
}

// Edges carry no direction: each shape draws the same path whichever endpoint it
// starts from, because the endpoints are put in a fixed order first.
export function graphEdgePath(shape, source, target, { sourceBox, targetBox = sourceBox, circle = null, zoom = 1 }) {
  const swap = source.x > target.x || (source.x === target.x && source.y > target.y);
  const [a, b, boxA, boxB] = swap ? [target, source, targetBox, sourceBox] : [source, target, sourceBox, targetBox];
  switch (resolveEdgeShape(shape)) {
    case "straight":
      return straightPath(graphEdgeSegment(a, b, boxA, boxB));
    case "arc-circle":
      return circleArcPath(a, b, boxA, boxB, circle);
    case "elbow-horizontal":
      return elbowPath(a, b, boxA, boxB, "x", zoom);
    case "elbow-vertical":
      return elbowPath(a, b, boxA, boxB, "y", zoom);
    default:
      return outwardArcPath(a, b, graphEdgeSegment(a, b, boxA, boxB), circle, zoom);
  }
}

function straightPath(segment) {
  return {
    d: `M${segment.x1} ${segment.y1}L${segment.x2} ${segment.y2}`,
    middle: { x: (segment.x1 + segment.x2) / 2, y: (segment.y1 + segment.y2) / 2 },
  };
}

// Whether an arc from a to b bows to the left of that direction (with y pointing down,
// left is (dy, -dx), which SVG sweep flag 1 draws). It bows away from the layer's
// centre. When the centre lies on or near the edge's line, as a hub's spokes do, it bows
// to the left of the direction leading away from the centre, so spokes turn one way like
// a pinwheel instead of flipping on small differences in position.
function bowsLeft(a, b, centre) {
  if (!centre) return true;
  const chord = Math.hypot(b.x - a.x, b.y - a.y);
  const offset = ((centre.x - (a.x + b.x) / 2) * (b.y - a.y) - (centre.y - (a.y + b.y) / 2) * (b.x - a.x)) / chord;
  if (Math.abs(offset) > NEAR_CENTRE * chord) return offset < 0;
  const outward = Math.hypot(b.x - centre.x, b.y - centre.y) - Math.hypot(a.x - centre.x, a.y - centre.y);
  if (Math.abs(outward) > NEAR_CENTRE * chord) return outward > 0;
  return true;
}

// Gentle arcs: each bows by 0.12 x chord, capped at 24px at zoom 1.
function outwardArcPath(a, b, segment, circle, zoom) {
  const dx = segment.x2 - segment.x1;
  const dy = segment.y2 - segment.y1;
  const chord = Math.hypot(dx, dy);
  const sagitta = Math.min(ARC_CURVATURE * chord, ARC_MAX_BEND * zoom);
  if (sagitta < 0.5) return straightPath(segment);
  const radius = (chord * chord / 4 + sagitta * sagitta) / (2 * sagitta);
  const left = bowsLeft(a, b, circle?.centre);
  const side = left ? 1 : -1;
  return {
    d: `M${segment.x1} ${segment.y1}A${radius} ${radius} 0 0 ${left ? 1 : 0} ${segment.x2} ${segment.y2}`,
    middle: { x: (segment.x1 + segment.x2) / 2 + side * (dy / chord) * sagitta, y: (segment.y1 + segment.y2) / 2 - side * (dx / chord) * sagitta },
  };
}

// Every edge follows one circle around the layer's centre, sized to the nodes' mean
// distance from it, so a ring of nodes reads as a ring. The arc runs through both node
// centres and is trimmed where it enters each pill, so it stays on the circle.
function circleArcPath(a, b, boxA, boxB, circle) {
  const chord = Math.hypot(b.x - a.x, b.y - a.y);
  if (!circle || !(circle.radius > 0) || chord < 1) return straightPath(graphEdgeSegment(a, b, boxA, boxB));
  const radius = Math.max(circle.radius, chord / 2);
  const left = bowsLeft(a, b, circle.centre);
  // The arc's own centre sits on the far side of the chord from its bow.
  const depth = Math.sqrt(Math.max(0, radius * radius - chord * chord / 4)) * (left ? -1 : 1);
  const origin = { x: (a.x + b.x) / 2 + depth * (b.y - a.y) / chord, y: (a.y + b.y) / 2 - depth * (b.x - a.x) / chord };
  const angleA = Math.atan2(a.y - origin.y, a.x - origin.x);
  const turn = ((Math.atan2(b.y - origin.y, b.x - origin.x) - angleA) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
  // Sweep flag 1 draws increasing angles, which is the bow to the left.
  const sweep = left ? turn : turn - 2 * Math.PI;
  const inside = (node, toward, box) => {
    const exit = graphPillExit(node, toward, box);
    return Math.hypot(exit.x - node.x, exit.y - node.y);
  };
  const trimA = inside(a, b, boxA) / radius;
  const trimB = inside(b, a, boxB) / radius;
  if (Math.abs(sweep) - trimA - trimB < 0.5 / radius) return straightPath(graphEdgeSegment(a, b, boxA, boxB));
  const at = (angle) => ({ x: origin.x + radius * Math.cos(angle), y: origin.y + radius * Math.sin(angle) });
  const direction = Math.sign(sweep);
  const start = at(angleA + direction * trimA);
  const end = at(angleA + sweep - direction * trimB);
  return {
    d: `M${start.x} ${start.y}A${radius} ${radius} 0 0 ${left ? 1 : 0} ${end.x} ${end.y}`,
    middle: at(angleA + sweep / 2),
  };
}

// A Z-shape along its axis: out of each pill's facing end, across halfway between the
// node centres (so edges between the same two columns or rows share one crossing), then
// in. A downward exit clears the node's caption. Pills that overlap along the axis are
// joined straight.
function elbowPath(p, q, boxP, boxQ, axis, zoom) {
  const cross = axis === "x" ? "y" : "x";
  const inOrder = p[axis] < q[axis] || (p[axis] === q[axis] && p[cross] <= q[cross]);
  const [a, b, boxA, boxB] = inOrder ? [p, q, boxP, boxQ] : [q, p, boxQ, boxP];
  const start = a[axis] + (axis === "x" ? boxA.halfWidth : boxA.bottom ?? boxA.halfHeight);
  const end = b[axis] - (axis === "x" ? boxB.halfWidth : boxB.halfHeight);
  if (end - start < 1) return straightPath(graphEdgeSegment(a, b, boxA, boxB));
  const offset = b[cross] - a[cross];
  const corner = Math.min(ELBOW_CORNER * zoom, (end - start) / 2, Math.abs(offset) / 2);
  const turn = Math.min(Math.max((a[axis] + b[axis]) / 2, start + corner), end - corner);
  const point = (along, across) => (axis === "x" ? `${along} ${across}` : `${across} ${along}`);
  const middle = axis === "x" ? { x: turn, y: (a.y + b.y) / 2 } : { x: (a.x + b.x) / 2, y: turn };
  if (Math.abs(offset) < 0.5) return { d: `M${point(start, a[cross])}L${point(end, b[cross])}`, middle };
  const step = Math.sign(offset) * corner;
  return {
    d: `M${point(start, a[cross])}L${point(turn - corner, a[cross])}Q${point(turn, a[cross])} ${point(turn, a[cross] + step)}`
      + `L${point(turn, b[cross] - step)}Q${point(turn, b[cross])} ${point(turn + corner, b[cross])}L${point(end, b[cross])}`,
    middle,
  };
}
