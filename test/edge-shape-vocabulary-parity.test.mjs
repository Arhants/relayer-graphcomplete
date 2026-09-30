import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as client from "../packages/graph-client/src/edge-shapes.js";
import * as renderer from "../desktop/renderer/src/product-workspace/edge-shapes.js";

const repositoryFile = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const quotedNames = (block) => [...block.matchAll(/"([a-z0-9-]+)"/g)].map((match) => match[1]);
const rust = repositoryFile("crates/relayer-graph-core/src/graph/model/layer.rs");
const python = repositoryFile("python/relayer-graph/src/relayer_graph/edge_shapes.py");

describe("cross-language edge layout vocabulary", () => {
  it("keeps every authoring and rendering boundary on the same closed lists", () => {
    expect(client.EDGE_SHAPES).toEqual(["default", "straight", "arc-outward", "arc-circle", "elbow-horizontal", "elbow-vertical"]);
    expect(client.NODE_SIDES).toEqual(["top", "right", "bottom", "left"]);
    for (const [name, pythonType] of [["EDGE_SHAPES", "EdgeShape"], ["NODE_SIDES", "NodeSide"]]) {
      expect(quotedNames(rust.match(new RegExp(`${name}: &\\[&str\\] = &\\[([\\s\\S]*?)\\];`))?.[1] ?? ""), name).toEqual([...client[name]]);
      expect(quotedNames(python.match(new RegExp(`${pythonType} = Literal\\[([\\s\\S]*?)\\n\\]`))?.[1] ?? ""), name).toEqual([...client[name]]);
      expect(renderer[name], name).toEqual([...client[name]]);
    }
  });

  it("allows the same number of waypoints everywhere", () => {
    expect(Number(rust.match(/MAX_EDGE_ROUTE_WAYPOINTS: usize = (\d+);/)?.[1])).toBe(client.MAX_EDGE_ROUTE_WAYPOINTS);
    expect(Number(python.match(/MAX_EDGE_ROUTE_WAYPOINTS = (\d+)/)?.[1])).toBe(client.MAX_EDGE_ROUTE_WAYPOINTS);
    expect(renderer.MAX_EDGE_ROUTE_WAYPOINTS).toBe(client.MAX_EDGE_ROUTE_WAYPOINTS);
  });
});
