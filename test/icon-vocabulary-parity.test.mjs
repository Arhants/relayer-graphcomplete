import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { RELAYER_ICON_FAMILIES as clientIconFamilies, RELAYER_ICON_NAMES as clientIconNames } from "../packages/graph-client/src/icons.js";
import { RELAYER_ICON_FAMILIES as rendererIconFamilies, RELAYER_ICON_NAMES as rendererIconNames } from "../desktop/renderer/src/product-workspace/icons.js";

const repositoryFile = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const quotedNames = (block) => [...block.matchAll(/"([a-z0-9-]+)"/g)].map((match) => match[1]);

function rustIconNames() {
  const source = repositoryFile("crates/relayer-graph-core/src/graph/model/icon.rs");
  return quotedNames(source.match(/RELAYER_ICON_NAMES:[\s\S]*?= &\[([\s\S]*?)\n\];/)?.[1] ?? "");
}

function pythonIconNames() {
  const source = repositoryFile("python/relayer-graph/src/relayer_graph/icons.py");
  return quotedNames(source.match(/RELAYER_ICON_NAMES = \(([\s\S]*?)\n\)/)?.[1] ?? "");
}

describe("cross-language Relayer icon vocabulary", () => {
  it("reproduces the checked-in vocabulary and retains all legacy names and searchable metadata", () => {
    execFileSync(process.execPath, ["scripts/generate-icon-catalog.mjs", "--check"]);
    const catalog = JSON.parse(repositoryFile("docs/icon-catalog.json"));
    expect(catalog.upstream.version).toBe("0.562.0");
    expect(clientIconNames.length).toBeGreaterThan(1800);
    for (const name of catalog.legacyNames) expect(clientIconNames).toContain(name);
    for (const record of catalog.icons) {
      expect(record.description.length).toBeGreaterThan(0);
      expect(record.useCases.length).toBeGreaterThan(0);
      expect(record.svg).toContain("<svg");
      expect(Array.isArray(record.tags)).toBe(true);
      expect(Array.isArray(record.categories)).toBe(true);
      expect(Array.isArray(record.aliases)).toBe(true);
    }
  });
  it("keeps every authoring and rendering boundary on the same pinned catalog", () => {
    expect(rustIconNames()).toEqual([...clientIconNames]);
    expect(pythonIconNames()).toEqual([...clientIconNames]);
    expect(rendererIconNames).toEqual(clientIconNames);
  });

  it("colours the same icons in the agent guidance and the renderer", () => {
    expect(rendererIconFamilies).toEqual(clientIconFamilies);
  });
});
