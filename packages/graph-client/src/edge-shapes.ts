/**
 * How a layer draws all its edges. "default" leaves the shape to the design.
 *
 * Keep this list aligned with `relayer-graph-core`, the Python client and the renderer.
 */
export const EDGE_SHAPES = [
  "default",
  "straight",
  "arc-outward",
  "arc-circle",
  "elbow-horizontal",
  "elbow-vertical",
] as const;

export type EdgeShape = typeof EDGE_SHAPES[number];

/** The side of a node where an edge attaches. */
export const NODE_SIDES = ["top", "right", "bottom", "left"] as const;

export type NodeSide = typeof NODE_SIDES[number];

/** The most waypoints one edge route may pass through. */
export const MAX_EDGE_ROUTE_WAYPOINTS = 4;
