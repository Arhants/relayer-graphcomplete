import { expect } from "vitest";
import { LAYER_EDGE_SHAPE_GUIDANCE } from "../src/implementations/layer-edge-shape-guidance.js";

export function expectGraphPresentationGuidance(prompt: string): void {
  expect(prompt).toContain("Give every interaction's root response action a concise task-specific label and a supported catalog icon");
  expect(prompt).toContain("including follow-ups and annotation-only or input-only interactions");
  expect(prompt).toContain("Do not edit the canonical interaction node");
  expect(prompt).toContain("register ALL actions");
  expect(prompt).toContain("It is not a draft preview");
  expect(prompt).toContain('"cssProperties":["align-content"');
  expect(prompt).toContain("graph.icons.discover");
  expect(prompt).toContain("graph.icons.inspect");
  expect(prompt).toContain("Signal symbols describe status");
  expect(prompt).toContain('Theme authoring: design readable light AND dark');
  expect(prompt).toContain('[data-relayer-theme="light"]');
  expect(prompt).toContain('[data-relayer-theme="dark"]');
  expect(prompt).toContain('guidance, not mandatory colors or a layout recipe');
  expect(prompt).toContain('do not create duplicate inputs');
  expect(prompt).toContain('bind both variants as ordinary assets/content');
  expect(prompt).toContain("Available presentation capabilities:");
  expect(prompt).toContain("without image files");
  expect(prompt).toContain("native image inspection");
  expect(prompt).toContain("Each layer should explain its scope as a coherent whole");
  expect(prompt).toContain('Choose "expand" when another layer should deepen one part');
  expect(prompt).toContain('Choose "reference" for supporting evidence or reusable context');
  expect(prompt).toContain("A layer reached as a reference may author only further reference actions");
  expect(prompt).toContain('Choose "invoke" when the useful next step requires a new agent interaction');
  expect(prompt).toContain('choosing "stop" means leaving the node without a further action');
  expect(prompt).toContain("It is not GraphComplete's stopped lifecycle state");
  expect(prompt).toContain(LAYER_EDGE_SHAPE_GUIDANCE);
}
