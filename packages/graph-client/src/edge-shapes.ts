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
