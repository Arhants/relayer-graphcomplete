import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { assetRef, css, html, EdgeObject, LayerLayoutObject, LayerObject, NodeObject, NodePlacementObject, RelayerGraphClient, symbolIconDetail } from "@relayer/graph-client";

const assetsDirectory = fileURLToPath(new URL("../../docs/evidence/issue-624-discoverable-icons/assets/", import.meta.url));
const explanations = {
  coral: ["Coral", "Coral colonies create reef structure and habitat."],
  jellyfish: ["Jellyfish", "Jellyfish occupy the open-water food web around reefs."],
  octopus: ["Octopus", "Octopuses use reef crevices as shelter and forage nearby."],
  "sea-turtle": ["Sea turtle", "Sea turtles connect reef habitat with surrounding feeding grounds."],
  plankton: ["Plankton", "Microscopic plankton support marine food webs. This sourced diatom photograph represents one member of that broad group."],
};

// Deterministic authored fixture. This exercises production discovery and asset
// authoring; its fixed choices are explicitly not evidence of model judgment.
export const marineEcologyFixtureFactory = () => ({
  state: () => ({}),
  async complete(context) {
    try {
    const graph = new RelayerGraphClient(context.graph.acquireCapability());
    const scope = await graph.visualAssets.scope();
    const source = JSON.parse(await readFile(join(assetsDirectory, "sources.json"), "utf8"));
    const searches = [];
    const nodes = [];
    const icons = [];
    for (const photo of source.records) {
      const [title, detail] = explanations[photo.subject];
      const symbolCandidates = await graph.icons.discover({ query: title, kind: "symbols", limit: 6 });
      const bytes = await readFile(join(assetsDirectory, photo.filename));
      assert.equal(createHash("sha256").update(bytes).digest("hex"), photo.sha256);
      const asset = await graph.visualAssets.add({ scope, name: title,
        description: `${photo.scientificName}. ${detail}`, tagIds: [],
        file: { name: photo.filename, mediaType: "image/jpeg", expectedDigest: `sha256:${photo.sha256}`, async read() { return bytes.slice(); } },
      });
      const imageCandidates = await graph.icons.discover({ query: title, kind: "images", limit: 6 });
      const candidate = imageCandidates.items.find(item => item.icon.kind === "image" && item.icon.assetId === asset.id);
      assert.ok(candidate, `${title} must be discoverable after registration`);
      icons.push(candidate.icon);
      const node = new NodeObject(candidate.icon, title, `${detail}\n\nPhotograph: ${photo.attribution}. [Source](${photo.observationUrl ?? photo.taxonUrl}).`, "concept", `marine-${photo.subject}`);
      node.detailAuthoring.setComponent("subject", html`<figure><img alt="Sourced marine ecology subject" asset=${assetRef(asset.id)} /><figcaption>Sourced marine ecology subject</figcaption></figure>`, css`figure { margin: 0; } img { width: 100%; max-height: 240px; object-fit: contain; } figcaption { padding: 8px; }`);
      nodes.push(node);
      searches.push({ subject: photo.subject, chosenIcon: candidate.icon, symbols: symbolCandidates, images: imageCandidates });
    }
    const monitoring = new NodeObject("waves", "Reef monitoring", "Track reef structure, animal observations, water conditions, and plankton together. The relationships shown here are an authored overview, not a quantified ecosystem model.", "concept", "marine-monitoring");
    const monitoringSymbol = await symbolIconDetail(graph, "waves");
    // Static Details own their controls; keep monitoring in Markdown so its
    // accepted image action exercises the ordinary production action rail.
    nodes[0].detailAuthoring.setComponent("monitoring-symbol", monitoringSymbol.html, monitoringSymbol.css);
    nodes.push(monitoring);
    const edges = nodes.slice(0, -1).map((node, index) => new EdgeObject([node, monitoring], `marine-monitor-${index}`));
    const positions = [[0.18,0.20],[0.50,0.20],[0.82,0.20],[0.18,0.76],[0.82,0.76],[0.50,0.64]];
    const layer = new LayerObject(nodes, edges, new LayerLayoutObject(nodes.map((node, index) => new NodePlacementObject(node, ...positions[index]))), "marine-ecology");
    for (const node of nodes) await graph.submitNode(node);
    for (const edge of edges) await graph.createEdge(edge);
    await graph.submitLayer(layer, { sizeJustification: "Six subjects form one bounded overview of the reef monitoring scope." });
    await graph.addAction(monitoring, { sourceLayer: layer, kind: "invoke", label: "Plan reef survey", interactionText: "Create a reef monitoring survey plan.", icon: { ...icons[0], fit: "cover", framing: "rounded" }, clientKey: "marine-survey" });
    await graph.addAction(context.inputGraph.id, { kind: "navigate", relation: "expand", label: "Marine ecology", target: layer, clientKey: "marine-response" });
    const inspected = await graph.icons.inspect([...icons, "waves"], { contactSheet: true });
    if (process.env.RELAYER_MARINE_ICON_EVIDENCE_DIR) {
      const directory = process.env.RELAYER_MARINE_ICON_EVIDENCE_DIR;
      await mkdir(directory, { recursive: true });
      await writeFile(join(directory, "discovery.json"), JSON.stringify({ evidenceKind: "deterministic-authored-fixture", modelSelectionProven: false, searches, sources: source.records }, null, 2));
      await writeFile(join(directory, "contact-sheet.svg"), await inspected.contactSheet.read());
    }
    await graph.submit(context.inputGraph.id);
    } catch (error) { console.error("Marine fixture failure:", error); throw error; }
  },
});
