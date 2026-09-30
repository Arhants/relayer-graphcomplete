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

// The side of a node where an edge attaches, and the most waypoints one edge route may
// pass through. Keep both aligned with the other languages, like EDGE_SHAPES.
export const NODE_SIDES = Object.freeze(["top", "right", "bottom", "left"]);
export const MAX_EDGE_ROUTE_WAYPOINTS = 4;

// The design owns what "default" draws. Design-config step B2 moves this into
// the structure file as edge.defaultShape.
export const DESIGN_DEFAULT_EDGE_SHAPE = "arc-outward";

const ARC_CURVATURE = 0.12;
const ARC_MAX_BEND = 24;
const ELBOW_CORNER = 8;
// How far a routed edge runs straight out of a chosen side before it turns (px at zoom 1).
const ROUTE_STUB = 16;
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

// Waypoints follow a dragged node: each moves by a blend of its two ends' movement,
// weighted by how far along the authored route it sits, so the route stretches but
// never turns.
export function graphFollowWaypoints(waypoints, [authoredStart, authoredEnd], [start, end]) {
  const path = [authoredStart, ...waypoints, authoredEnd];
  const lengths = path.slice(1).map((point, index) => Math.hypot(point.x - path[index].x, point.y - path[index].y));
  const total = lengths.reduce((sum, length) => sum + length, 0);
  let travelled = 0;
  return waypoints.map((point, index) => {
    travelled += lengths[index];
    const along = total > 0 ? travelled / total : (index + 1) / (waypoints.length + 1);
    return {
      x: point.x + (1 - along) * (start.x - authoredStart.x) + along * (end.x - authoredEnd.x),
      y: point.y + (1 - along) * (start.y - authoredStart.y) + along * (end.y - authoredEnd.y),
    };
  });
}

// An edge with its own route, given in its drawing order: `start` and `end` are
// { point, box, side } and `waypoints` are screen points between them. The shape
// styles the path between points: straight segments, one smooth curve for arcs, or
// right-angle segments for elbows. A chosen side is left at a right angle: a short
// straight run outward comes first, so no route turns back through its own node, and
// two ends facing the same way meet in a U beyond the further of them.
export function graphRoutedEdgePath(shape, { start, end, waypoints = [] }, { circle = null, zoom = 1 } = {}) {
  const startSide = NODE_SIDES.includes(start.side) ? start.side : null;
  const endSide = NODE_SIDES.includes(end.side) ? end.side : null;
  if (!waypoints.length && !startSide && !endSide) {
    return graphEdgePath(shape, start.point, end.point, { sourceBox: start.box, targetBox: end.box, circle, zoom });
  }
  const first = routeEnd(start, startSide, waypoints[0] ?? end.point);
  const last = routeEnd(end, endSide, waypoints[waypoints.length - 1] ?? start.point);
  const resolved = resolveEdgeShape(shape);
  const elbow = resolved === "elbow-horizontal" || resolved === "elbow-vertical";
  if (!elbow && resolved !== "straight") {
    return waypoints.length
      ? smoothPath([first, ...waypoints, last], sideNormal(startSide), sideNormal(endSide))
      : sidedCurve(first, startSide, last, endSide, zoom);
  }
  let startOut = outward(first, startSide, ROUTE_STUB * zoom);
  let endOut = outward(last, endSide, ROUTE_STUB * zoom);
  if (!waypoints.length && startOut && endOut && startSide === endSide) {
    const axis = sideAxis(startSide);
    const extreme = (startSide === "top" || startSide === "left" ? Math.min : Math.max)(startOut[axis], endOut[axis]);
    startOut = { ...startOut, [axis]: extreme };
    endOut = { ...endOut, [axis]: extreme };
  }
  const points = [first, ...(startOut ? [startOut] : []), ...waypoints, ...(endOut ? [endOut] : []), last];
  if (resolved === "straight") return polylinePath(points, 0);
  const axis = resolved === "elbow-horizontal" ? "x" : "y";
  const across = (direction) => (direction === "x" ? "y" : "x");
  const route = [first];
  for (let index = 1; index < points.length; index += 1) {
    const [p, q] = [points[index - 1], points[index]];
    if (Math.abs(p.x - q.x) < 0.5 || Math.abs(p.y - q.y) < 0.5) {
      route.push(q);
      continue;
    }
    // After a side's outward run the route turns across it; before arriving at one it runs across it.
    const leave = p === startOut ? across(sideAxis(startSide)) : axis;
    const arrive = q === endOut ? across(sideAxis(endSide)) : across(leave);
    route.push(...rightAngleLeg(p, q, leave, arrive));
  }
  return polylinePath(route, ELBOW_CORNER * zoom);
}

// An arc between chosen sides leaves each side at a right angle and bows out from it
// by a quarter of the edge's length, at least the design's bend. An end without a side
// heads straight for the other end.
function sidedCurve(start, startSide, end, endSide, zoom) {
  const reach = Math.max(0.25 * Math.hypot(end.x - start.x, end.y - start.y), ARC_MAX_BEND * zoom);
  const control = (point, side, toward) => {
    const normal = sideNormal(side);
    if (normal) return { x: point.x + normal.x * reach, y: point.y + normal.y * reach };
    return { x: point.x + (toward.x - point.x) / 3, y: point.y + (toward.y - point.y) / 3 };
  };
  const c1 = control(start, startSide, end);
  const c2 = control(end, endSide, start);
  return {
    d: `M${start.x} ${start.y}C${c1.x} ${c1.y} ${c2.x} ${c2.y} ${end.x} ${end.y}`,
    middle: { x: (start.x + 3 * c1.x + 3 * c2.x + end.x) / 8, y: (start.y + 3 * c1.y + 3 * c2.y + end.y) / 8 },
  };
}

function sideNormal(side) {
  return { top: { x: 0, y: -1 }, bottom: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } }[side] ?? null;
}

function outward(point, side, distance) {
  const normal = sideNormal(side);
  return normal ? { x: point.x + normal.x * distance, y: point.y + normal.y * distance } : null;
}

function sideAxis(side) {
  if (side === "top" || side === "bottom") return "y";
  if (side === "left" || side === "right") return "x";
  return null;
}

// Where a routed edge meets its node: the middle of a chosen side (a downward exit
// clears the node's caption), or the pill outline towards the next point.
function routeEnd({ point, box }, side, toward) {
  if (side === "top") return { x: point.x, y: point.y - box.halfHeight };
  if (side === "bottom") return { x: point.x, y: point.y + (box.bottom ?? box.halfHeight) };
  if (side === "left") return { x: point.x - box.halfWidth, y: point.y };
  if (side === "right") return { x: point.x + box.halfWidth, y: point.y };
  return graphPillExit(point, toward, box);
}

// From p to q in right angles: one turn when leaving and arriving on different axes,
// otherwise a Z through the midpoint.
function rightAngleLeg(p, q, leave, arrive) {
  if (leave !== arrive) return [leave === "x" ? { x: q.x, y: p.y } : { x: p.x, y: q.y }, q];
  if (leave === "x") {
    const middle = (p.x + q.x) / 2;
    return [{ x: middle, y: p.y }, { x: middle, y: q.y }, q];
  }
  const middle = (p.y + q.y) / 2;
  return [{ x: p.x, y: middle }, { x: q.x, y: middle }, q];
}

// Straight segments through the points, with corners rounded to `radius`. The middle
// is halfway along the drawn length.
function polylinePath(points, radius) {
  const distinct = points.filter((point, index) => index === 0 || Math.hypot(point.x - points[index - 1].x, point.y - points[index - 1].y) > 0.5);
  // A point in the middle of a straight run adds nothing.
  const pts = distinct.filter((point, index) => {
    if (index === 0 || index === distinct.length - 1) return true;
    const [previous, next] = [distinct[index - 1], distinct[index + 1]];
    const cross = (point.x - previous.x) * (next.y - point.y) - (point.y - previous.y) * (next.x - point.x);
    const dot = (point.x - previous.x) * (next.x - point.x) + (point.y - previous.y) * (next.y - point.y);
    return Math.abs(cross) > 0.5 || dot < 0;
  });
  let d = `M${pts[0].x} ${pts[0].y}`;
  for (let index = 1; index < pts.length - 1; index += 1) {
    const [previous, corner, next] = [pts[index - 1], pts[index], pts[index + 1]];
    const inLength = Math.hypot(corner.x - previous.x, corner.y - previous.y);
    const outLength = Math.hypot(next.x - corner.x, next.y - corner.y);
    const r = Math.min(radius, inLength / 2, outLength / 2);
    // A route that doubles back keeps its sharp turn; rounding it would draw a spike.
    const reverses = ((corner.x - previous.x) * (next.x - corner.x) + (corner.y - previous.y) * (next.y - corner.y)) < -0.99 * inLength * outLength;
    if (r < 0.5 || reverses) {
      d += `L${corner.x} ${corner.y}`;
      continue;
    }
    d += `L${corner.x - (corner.x - previous.x) / inLength * r} ${corner.y - (corner.y - previous.y) / inLength * r}`
      + `Q${corner.x} ${corner.y} ${corner.x + (next.x - corner.x) / outLength * r} ${corner.y + (next.y - corner.y) / outLength * r}`;
  }
  const last = pts[pts.length - 1];
  return { d: `${d}L${last.x} ${last.y}`, middle: halfway(pts) };
}

// One smooth curve through every point (a Catmull-Rom style spline as cubic Béziers). Repeated
// points are dropped so the curve never loops back on itself. A side's normal makes the
// curve leave or enter that side at a right angle.
function smoothPath(allPoints, startNormal = null, endNormal = null) {
  const points = allPoints.filter((point, index) => index === 0 || Math.hypot(point.x - allPoints[index - 1].x, point.y - allPoints[index - 1].y) > 0.5);
  const padded = [points[0], ...points, points[points.length - 1]];
  let d = `M${points[0].x} ${points[0].y}`;
  for (let index = 1; index < padded.length - 2; index += 1) {
    const [before, from, to, after] = [padded[index - 1], padded[index], padded[index + 1], padded[index + 2]];
    // Handles a third of this segment long, so short segments never swing wide.
    const reach = Math.hypot(to.x - from.x, to.y - from.y) / 3;
    const unit = (vector) => {
      const length = Math.hypot(vector.x, vector.y) || 1;
      return { x: vector.x / length, y: vector.y / length };
    };
    const leave = index === 1 && startNormal ? startNormal : unit({ x: to.x - before.x, y: to.y - before.y });
    const enter = index === padded.length - 3 && endNormal
      ? { x: -endNormal.x, y: -endNormal.y }
      : unit({ x: after.x - from.x, y: after.y - from.y });
    const c1 = { x: from.x + leave.x * reach, y: from.y + leave.y * reach };
    const c2 = { x: to.x - enter.x * reach, y: to.y - enter.y * reach };
    d += `C${c1.x} ${c1.y} ${c2.x} ${c2.y} ${to.x} ${to.y}`;
  }
  return { d, middle: halfway(points) };
}

function halfway(points) {
  const lengths = points.slice(1).map((point, index) => Math.hypot(point.x - points[index].x, point.y - points[index].y));
  let remaining = lengths.reduce((sum, length) => sum + length, 0) / 2;
  for (const [index, length] of lengths.entries()) {
    if (remaining <= length && length > 0) {
      const t = remaining / length;
      return { x: points[index].x + (points[index + 1].x - points[index].x) * t, y: points[index].y + (points[index + 1].y - points[index].y) * t };
    }
    remaining -= length;
  }
  return points[0];
}
