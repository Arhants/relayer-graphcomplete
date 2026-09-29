import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { designCss, resolveDesignPath } from "../scripts/design/build.mjs";
import { RELAYER_ICON_NAMES, relayerIconFamily } from "../desktop/renderer/src/product-workspace/icons.js";
import { graphEdgeArc } from "../desktop/renderer/src/product-workspace/workspace.js";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
// Custom properties the renderer sets from JavaScript at runtime.
const RUNTIME_PROPERTIES = new Set([
  "graph-zoom", "graph-share", "interaction-graph-available-height", "interaction-graph-available-width",
  "context-draft-send-warning-bottom", "context-draft-send-warning-right",
]);

describe("Sticker structure", () => {
  it("generates every role and family colour for both themes from the default design", async () => {
    const config = JSON.parse(await readFile(await resolveDesignPath(""), "utf8"));
    const css = designCss(config, "designs/test.json");
    const [dark, light] = [/^:root\{([^}]*)\}/m, /^:root\[data-theme="light"\]\{([^}]*)\}/m].map((pattern) => pattern.exec(css)[1]);
    for (const [role, value] of Object.entries(config.palette.roles)) {
      expect(dark).toContain(`--${role}:${value.dark}`);
      expect(light).toContain(`--${role}:${value.light}`);
    }
    expect(light).toContain(`--family-f1:${config.palette.families.f1.light};--family-f1-icon:${config.palette.families.f1.lightIcon}`);
    expect([dark.endsWith("color-scheme:dark"), light.endsWith("color-scheme:light")]).toEqual([true, true]);
  });

  it("defines every custom property the renderer stylesheet reads", async () => {
    const styles = await read("desktop/renderer/styles.css");
    const config = JSON.parse(await readFile(await resolveDesignPath(""), "utf8"));
    const defined = new Set([...`${styles}${designCss(config, "designs/test.json")}`.matchAll(/--([a-z0-9-]+)\s*:/g)].map((match) => match[1]));
    const undefinedProperties = [...new Set([...styles.matchAll(/var\(--([a-z0-9-]+)/g)].map((match) => match[1]))]
      .filter((name) => !defined.has(name) && !RUNTIME_PROPERTIES.has(name));
    expect(undefinedProperties).toEqual([]);
    expect(styles.startsWith('@import url("./design/design.css");\n')).toBe(true);
  });

  it("gives every allowlisted icon exactly one presentation family", () => {
    const counts = {};
    for (const name of RELAYER_ICON_NAMES) counts[relayerIconFamily(name)] = (counts[relayerIconFamily(name)] ?? 0) + 1;
    // Design brief Appendix A: 13 / 18 / 23 / 21 / 8 / 10 coloured icons and 23 neutral.
    expect(counts).toEqual({ f1: 13, f2: 18, f3: 23, f4: 21, f5: 8, f6: 10, neutral: 23 });
    expect([relayerIconFamily("MessagesSquare"), relayerIconFamily("messagessquare"), relayerIconFamily("not-an-icon"), relayerIconFamily(undefined)])
      .toEqual(["f5", "f5", "neutral", "neutral"]);
  });

  it("draws edges as gentle arcs that bulge away from the layer centroid", () => {
    const segment = { x1: 0, y1: 100, x2: 200, y2: 100 };
    const below = graphEdgeArc(segment, { x: 100, y: 0 });
    expect(below.middle).toEqual({ x: 100, y: 124 });
    expect(below.d).toMatch(/^M0 100A\d+(\.\d+)? \d+(\.\d+)? 0 0 [01] 200 100$/);
    const above = graphEdgeArc(segment, { x: 100, y: 200 });
    expect(above.middle).toEqual({ x: 100, y: 76 });
    expect(above.d.split(" ").at(-3)).not.toBe(below.d.split(" ").at(-3));
    expect(graphEdgeArc({ x1: 5, y1: 5, x2: 5, y2: 5 }, { x: 0, y: 0 }).d).toBe("M5 5L5 5");
  });
});
