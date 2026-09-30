import { describe, expect, it } from "vitest";
import { RELAYER_ICON_NAMES, relayerIconFamily } from "@relayer/graph-client";

import { NODE_ICON_GUIDANCE } from "../src/implementations/graph-presentation-guidance.js";

describe("node icon guidance", () => {
  it("lists every supported icon exactly once, under the family that colours it", () => {
    // The first line is the instruction; the family lines and the signal line list icons.
    const lines = NODE_ICON_GUIDANCE.split("\n").slice(1);
    const listed = lines.flatMap((line) => (line.split(": ")[1] ?? "").replace(/\.$/, "").split(", ").filter(Boolean));
    expect([...listed].sort()).toEqual([...RELAYER_ICON_NAMES].sort());
    const signalLine = lines.at(-1) ?? "";
    for (const name of RELAYER_ICON_NAMES) {
      const line = lines.find((candidate) => (candidate.split(": ")[1] ?? "").replace(/\.$/, "").split(", ").includes(name));
      expect(line === signalLine, name).toBe(relayerIconFamily(name) === "neutral");
    }
    expect(relayerIconFamily("info")).toBe("neutral");
    expect(relayerIconFamily("Search")).toBe("f6");
  });
});
