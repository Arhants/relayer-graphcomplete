import { readFileSync } from "node:fs";
import { EDGE_SHAPES } from "@relayer/graph-client";
import { describe, expect, it } from "vitest";
import { LAYER_EDGE_SHAPE_GUIDANCE } from "../src/implementations/layer-edge-shape-guidance.js";

describe("layer edge shape guidance", () => {
  it("names a use for every shape and the reading order, and the Python skill mirrors it", () => {
    const bullets = LAYER_EDGE_SHAPE_GUIDANCE.split("\n").filter((line) => line.startsWith("- "));
    expect(bullets.map((line) => /^- "([a-z-]+)":/.exec(line)?.[1]).sort()).toEqual([...EDGE_SHAPES].sort());
    expect(LAYER_EDGE_SHAPE_GUIDANCE).toContain("List the placements in reading order");
    expect(LAYER_EDGE_SHAPE_GUIDANCE).toContain('left to right for "elbow-horizontal", top to bottom for "elbow-vertical"');
    const skill = readFileSync(new URL("../../../python/relayer-graph/SKILL.md", import.meta.url), "utf8").replace(/\n(?!\n|- |<)/g, " ");
    for (const bullet of bullets) expect(skill).toContain(bullet);
    expect(skill).toContain("List the placements in reading order; keyboard and screen-reader users follow that order.");
  });
});
