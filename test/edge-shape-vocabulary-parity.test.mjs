import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EDGE_SHAPES as clientEdgeShapes } from "../packages/graph-client/src/edge-shapes.js";
import { EDGE_SHAPES as rendererEdgeShapes } from "../desktop/renderer/src/product-workspace/edge-shapes.js";

const repositoryFile = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const quotedNames = (block) => [...block.matchAll(/"([a-z0-9-]+)"/g)].map((match) => match[1]);

function rustEdgeShapes() {
  const source = repositoryFile("crates/relayer-graph-core/src/graph/model/layer.rs");
  return quotedNames(source.match(/EDGE_SHAPES: &\[&str\] = &\[([\s\S]*?)\n\];/)?.[1] ?? "");
}

function pythonEdgeShapes() {
  const source = repositoryFile("python/relayer-graph/src/relayer_graph/edge_shapes.py");
  return quotedNames(source.match(/EdgeShape = Literal\[([\s\S]*?)\n\]/)?.[1] ?? "");
}

describe("cross-language edge shape vocabulary", () => {
  it("keeps every authoring and rendering boundary on the same closed list", () => {
    expect(clientEdgeShapes).toEqual(["default", "straight", "arc-outward", "arc-circle", "elbow-horizontal", "elbow-vertical"]);
    expect(rustEdgeShapes()).toEqual([...clientEdgeShapes]);
    expect(pythonEdgeShapes()).toEqual([...clientEdgeShapes]);
    expect(rendererEdgeShapes).toEqual([...clientEdgeShapes]);
  });
});
