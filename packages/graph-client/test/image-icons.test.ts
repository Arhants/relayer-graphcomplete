import { afterEach, describe, expect, it, vi } from "vitest";
import { imageIcon, isImageIcon } from "../src/image-icons.js";
import { imageIconDetail, symbolIconDetail } from "../src/image-icon-detail.js";
import { NodeObject } from "../src/objects.js";
import { RelayerGraphClient } from "../src/client.js";

describe("registered image icon authoring", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("preserves transparent contain defaults and supports explicit cover/framing", () => {
    const icon = imageIcon("coral");
    expect(icon).toEqual({ kind: "image", assetId: "coral" });
    expect(new NodeObject(icon, "Coral", "A colony").icon).toBe(icon);
    expect(isImageIcon(imageIcon("octopus", { fit: "cover", framing: "circle" }))).toBe(true);
    expect(imageIconDetail(icon).html).toBeDefined();
  });
  it("rejects malformed references and never executes authored accessors", () => {
    expect(isImageIcon({ kind:"image", assetId:"coral", url:"https://example.com/image.png" })).toBe(false);
    let read = false;
    expect(isImageIcon({ kind:"image", get assetId() { read = true; return "coral"; } })).toBe(false);
    expect(read).toBe(false);
    expect(() => imageIcon(" ")).toThrow();
  });
});

it("compiles the static Detail recipe through scoped asset resolution", async () => {
  const icon = imageIcon("coral", { fit: "cover", framing: "circle" });
  const node = new NodeObject(icon, "Coral", "Colony");
  const component = imageIconDetail(icon);
  node.detailAuthoring.setComponent("image", component.html, component.css);
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ assets: [{ logicalId:"coral",authority:"current",availability:"available",digestSha256:"a".repeat(64),mediaType:"image/png",representation:{kind:"image",sanitized:true} }] })));
  try {
    const detail = await new RelayerGraphClient({url:"http://graph.test",token:"scope",nodeId:1}).checkpointNodeDetail(node).catch((error: unknown) => { throw new Error(JSON.stringify((error as {issues:unknown}).issues)); });
    expect(detail.assets[0]?.id).toBe("coral");
    expect(detail.components[0]?.css).toContain("object-fit:cover");
    expect(detail.components[0]?.css).toContain("border-radius:50%");
  } finally { vi.unstubAllGlobals(); }
});


it("registers a pinned symbol preview and compiles a static monitoring Detail through public production APIs", async () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" stroke="currentColor"><path d="M2 12h20"/></svg>';
  const graph = new RelayerGraphClient({url:"http://graph.test",token:"scope",nodeId:1});
  const requests: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    requests.push(url);
    if (url.endsWith("/scope")) return Response.json({scope:{kind:"thread",threadId:1}});
    if (url.endsWith("/icons/inspect")) return Response.json({previews:[{name:"waves.svg",mediaType:"image/svg+xml",contentBase64:Buffer.from(svg).toString("base64")}],contactSheet:null});
    const request = JSON.parse(String(init?.body));
    if (request.operation?.kind === "add") {
      expect(request.operation.file.contentBase64).toBe(Buffer.from(svg.replace(/currentColor/g, "#767676")).toString("base64"));
      return Response.json({id:"registered-monitoring-symbol",digest:"a".repeat(64)});
    }
    return Response.json({assets:[{logicalId:"registered-monitoring-symbol",authority:"current",availability:"available",digestSha256:"a".repeat(64),mediaType:"image/svg+xml",representation:{kind:"image",sanitized:true}}]});
  }));
  try {
    const component = await symbolIconDetail(graph, "waves");
    const node = new NodeObject("satellite", "Reef monitoring", "Track reef conditions");
    node.detailAuthoring.setComponent("monitoring-symbol", component.html, component.css);
    const packageValue = await graph.checkpointNodeDetail(node);
    expect(packageValue.assets[0]?.id).toBe("registered-monitoring-symbol");
    expect(requests.some((url) => url.endsWith("/icons/inspect"))).toBe(true);
    expect(packageValue.components[0]?.css).toContain("object-fit:contain");
  } finally { vi.unstubAllGlobals(); }
});
