import { describe, expect, it } from "vitest";
import { RELAYER_ICON_NAMES } from "@relayer/graph-client";
import { NODE_ICON_GUIDANCE } from "../src/implementations/graph-presentation-guidance.js";

describe("node icon guidance", () => {
  it("offers bounded typed discovery, native inspection and image authoring without enumerating the catalog", () => {
    expect(NODE_ICON_GUIDANCE).toContain("graph.icons.discover");
    expect(NODE_ICON_GUIDANCE).toContain('kind: "both"');
    expect(NODE_ICON_GUIDANCE).toContain("symbols/images/both");
    expect(NODE_ICON_GUIDANCE).toContain("graph.icons.inspect");
    expect(NODE_ICON_GUIDANCE).toContain("contact_sheet=True");
    expect(NODE_ICON_GUIDANCE).toContain("Familiar supported symbol strings remain valid without lookup");
    expect(NODE_ICON_GUIDANCE).toContain('fit: "cover"');
    expect(NODE_ICON_GUIDANCE).toContain("accepted output pins registered bytes");
    expect(NODE_ICON_GUIDANCE).not.toContain(RELAYER_ICON_NAMES.join(", "));
    expect(NODE_ICON_GUIDANCE.length).toBeLessThan(2200);
  });
});
