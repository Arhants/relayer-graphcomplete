import { EDGE_SHAPES } from "@relayer/graph-client";

// Written once for every harness; python/relayer-graph/SKILL.md mirrors it.
export const LAYER_EDGE_SHAPE_GUIDANCE = `Every layer layout also names the layer's edge shape, which draws all of its edges: one of ${EDGE_SHAPES.map((shape) => `"${shape}"`).join(", ")}. Edges never show a direction. Choose the shape from the layer's structure:
- "default": no strong structural reason; the design chooses.
- "arc-outward": a hub and its spokes, or loose relationships around a centre.
- "arc-circle": a cycle, or a ring of peers that each connect to their neighbours.
- "elbow-horizontal": a left-to-right pipeline or sequence of stages.
- "elbow-vertical": a top-down hierarchy or breakdown.
- "straight": comparisons, grids, or dense layers.
List the placements in reading order; keyboard and screen-reader users follow that order. Position the nodes so they read in that order too, and for an elbow shape run the reading order along its axis: left to right for "elbow-horizontal", top to bottom for "elbow-vertical".`;
