import { expect } from "vitest";

export function expectGraphPresentationGuidance(prompt: string): void {
  expect(prompt).toContain("register ALL actions");
  expect(prompt).toContain("It is not a draft preview");
  expect(prompt).toContain('"cssProperties":["align-content"');
  expect(prompt).toContain("Valid node icons:");
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
}
