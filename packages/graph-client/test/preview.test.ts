import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LayerLayoutObject, LayerObject, NodeObject, NodePlacementObject, RelayerGraphClient } from "../src/index.js";

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 7]);
const FINGERPRINT = `sha256:${"ab".repeat(32)}`;

function json(value: unknown): Response {
  return new Response(JSON.stringify(value), { status: 200, headers: { "content-type": "application/json" } });
}

describe("draft previews on graph writes", () => {
  const folders: string[] = [];
  afterEach(async () => {
    vi.unstubAllGlobals();
    for (const folder of folders.splice(0)) await rm(folder, { recursive: true, force: true });
  });

  it("writes a returned image into the preview folder and surfaces its path", async () => {
    const previewDirectory = await mkdtemp(join(tmpdir(), "relayer-client-preview-"));
    folders.push(previewDirectory);
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
      const request = JSON.parse(String(init.body)) as Record<string, unknown>;
      if (url.endsWith("/api/graph/layers")) return json({ layer: { ...request, id: 30, state: "draft" }, preview: { status: "limit_reached" } });
      return json({
        node: { id: 10, kind: "concept", icon: "box", title: "Queue", detail: "Waiting work", state: "draft", clientKey: request.clientKey },
        preview: { status: "rendered", fingerprint: FINGERPRINT, width: 340, height: 812, pngBase64: PNG.toString("base64") },
      });
    }));
    const client = new RelayerGraphClient({ url: "http://127.0.0.1:1", token: "token", nodeId: 1, previewDirectory });
    const node = new NodeObject("box", "Queue", "Waiting work", "concept", "queue");

    const submitted = await client.submitNode(node);

    expect(submitted.id).toBe(10);
    expect(submitted.preview).toEqual({ status: "rendered", path: join(previewDirectory, "node-10-abababababababab.png"), width: 340, height: 812 });
    expect(await readFile(submitted.preview!.path!)).toEqual(PNG);
    const layer = await client.submitLayer(new LayerObject([node], [], new LayerLayoutObject([new NodePlacementObject(node, 0.5, 0.5)], "default"), "root"));
    expect(layer.preview).toEqual({ status: "limit_reached" });
  });

  it("leaves writes without a preview field unchanged", async () => {
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
      const request = JSON.parse(String(init.body)) as Record<string, unknown>;
      return json({ layer: { ...request, id: 30, state: "draft" } });
    }));
    const layer = await new RelayerGraphClient({ url: "http://127.0.0.1:1", token: "token", nodeId: 1 })
      .submitLayer(new LayerObject([9], [], new LayerLayoutObject([new NodePlacementObject(9, 0.5, 0.5)], "default"), "root"));
    expect(layer).not.toHaveProperty("preview");
  });

  it("reads the preview folder from the harness environment", () => {
    const client = RelayerGraphClient.fromEnv({
      RELAYER_GRAPH_URL: "http://127.0.0.1:1", RELAYER_GRAPH_TOKEN: "token", RELAYER_NODE_ID: "1", RELAYER_GRAPH_PREVIEW_DIR: "/tmp/previews-1",
    });
    expect(client.capability.previewDirectory).toBe("/tmp/previews-1");
  });
});
