import { describe, expect, it } from "vitest";
import { embedFixtureSnapshot, startEmbedFixtureServer, sharePath, embedPath } from "../scripts/fixtures/public-share-embed.mjs";
import { parsePublicSnapshot } from "../desktop/renderer/src/public-share-viewer/snapshot.js";
import { publicViewerCsp } from "../desktop/renderer/src/public-share-viewer/template.js";

describe("local embed evidence boundary", () => {
  it("provides accepted navigation history with an earlier reference and both resolved and unresolved invokes", async () => {
    const snapshot = parsePublicSnapshot(await embedFixtureSnapshot());
    expect(snapshot.interactions).toHaveLength(5);
    const root = snapshot.layerFor("turn:synthetic-1", "layer:root-1");
    expect(root.nodes).toHaveLength(3);
    expect(root.edges).toHaveLength(2);
    expect(root.actions.find(a => a.id === "action:completed").targetLayerId).toBe("layer:root-2");
    expect(root.actions.find(a => a.id === "action:unexecuted").targetLayerId).toBeUndefined();
    const reference = snapshot.layerFor("turn:synthetic-2", "layer:root-2").actions.find(a => a.relation === "reference");
    expect(snapshot.layerFor("turn:synthetic-2", reference.targetLayerId).nodes[0].id).toBe("node:details-1");
  });

  it("frames only the local embed route and leaves the production default unchanged", async () => {
    const fixture = await startEmbedFixtureServer();
    try {
      const article = await fetch(`${fixture.origin}/`).then(r => r.text());
      expect(article).toContain(`<iframe loading="lazy" src="${embedPath}"`);
      const embedded = await fetch(`${fixture.origin}${embedPath}`);
      expect(embedded.headers.get("content-security-policy")).toBe(publicViewerCsp().replace("frame-ancestors 'none'", `frame-ancestors 'self' ${fixture.origin}`));
      expect(await embedded.text()).toContain('class="public-share-shell public-share-embed"');
      const standalone = await fetch(`${fixture.origin}${sharePath}`);
      expect(standalone.headers.get("content-security-policy")).toBe(publicViewerCsp());
      expect(await standalone.text()).toContain('class="public-share-download-card"');
      expect(publicViewerCsp()).toContain("frame-ancestors 'none'");
      expect((await fetch(`${fixture.origin}/%2e%2e%2fpackage.json`)).status).toBe(404);
    } finally {
      await new Promise(done => fixture.server.close(done));
    }
  });
});
