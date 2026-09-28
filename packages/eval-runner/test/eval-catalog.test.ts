import { describe, expect, it } from "vitest";
import { createSyntheticExternalCatalog } from "./fixtures/external-catalog.js";
import { validateEvalCatalogV1, validateEvalChecksV1 } from "../src/eval-catalog.js";

describe("external evaluation catalog boundary", () => {
  it("validates generic bound cases and their public projections before use", () => {
    const catalog = validateEvalCatalogV1(createSyntheticExternalCatalog());
    expect(catalog.cases.map(({ definition }) => definition.id)).toEqual([
      "fixture.external-a", "fixture.external-b",
    ]);
    expect(catalog.suites).toHaveLength(1);
    expect(JSON.stringify(catalog.cases.map(({ definition }) => definition))).not.toContain("sealedPath");
  });
  it("rejects missing callbacks and project threads with invalid authority", () => {
    const catalog = createSyntheticExternalCatalog();
    const first = catalog.cases[0]!;
    const { grade: _grade, ...missingCallback } = first;
    expect(() => validateEvalCatalogV1({ ...catalog, cases: [missingCallback, catalog.cases[1]] })).toThrow("must implement its SDK callbacks");
    const invalidThread = { ...first, definition: { ...first.definition, threads: [{ ...first.definition.threads[0], permissionProfileId: "root" }] } };
    expect(() => validateEvalCatalogV1({ ...catalog, cases: [invalidThread, catalog.cases[1]] })).toThrow("invalid project thread fields");
  });
  it("rejects duplicate IDs and tampered public snapshot claims", () => {
    const catalog = createSyntheticExternalCatalog();
    expect(() => validateEvalCatalogV1({ ...catalog, cases: [...catalog.cases, catalog.cases[0]] })).toThrow("Duplicate evaluation case ID");
    const first = catalog.cases[0]!;
    expect(() => validateEvalCatalogV1({ ...catalog, cases: [{ ...first, definition: { ...first.definition, caseSnapshotDigest: `sha256:${"0".repeat(64)}` } }, catalog.cases[1]] })).toThrow("projection or digest drifted");
  });
  it("projects grader checks to immutable plain SDK data and rejects malformed truthy results", () => {
    const projected = validateEvalChecksV1([{ name: "workspace:contract", passed: true, detail: "Passed.", ignored: "private" }]);
    expect(projected).toEqual([{ name: "workspace:contract", passed: true, detail: "Passed." }]);
    expect(() => validateEvalChecksV1(new Array(1))).toThrow("plain data object");
    expect(Object.isFrozen(projected)).toBe(true);
    expect(Object.isFrozen(projected[0])).toBe(true);
    expect(() => validateEvalChecksV1([{ name: "workspace:contract", passed: "false", detail: "Malformed." }])).toThrow("boolean passed");
    expect(() => validateEvalChecksV1([{ name: "workspace:contract", passed: true, get detail() { return "Accessor."; } }])).toThrow("cannot contain accessors");
  });
});
