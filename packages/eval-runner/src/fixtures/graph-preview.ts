import { EdgeObject, LayerLayoutObject, LayerObject, NodeObject, NodePlacementObject, RelayerGraphClient, assetRef, css, html, type GraphPreview } from "@relayer/graph-client";
import type { Harness, HarnessFactory, HarnessRunContext, HarnessSessionState, HarnessTraceSupport } from "@relayer/harness-host";
import { createHash } from "node:crypto";
import { stat } from "node:fs/promises";

/**
 * Deterministic draft-preview loop (PRD §11.10, PREV-003): author a layer and
 * see it, move a node and see a fresh image, resubmit unchanged and get the
 * cached one, then accept. It fails the turn when any step's image is wrong.
 */
class GraphPreviewFixtureHarness implements Harness {
  traceSupport(): HarnessTraceSupport {
    return {
      prompt: "none", messages: "full", reasoningSummaries: "none", modelCalls: "none",
      toolCalls: "summary", usage: "none", childStreams: "none", nativeArtifacts: "none",
    };
  }

  state(): HarnessSessionState {
    return {};
  }

  async complete(context: HarnessRunContext): Promise<void> {
    const graph = new RelayerGraphClient(context.graph.acquireCapability());
    const observed: { step: string; status: string; width?: number; height?: number }[] = [];
    const see = async (step: string, preview: GraphPreview | undefined, expected: GraphPreview["status"] | "none") => {
      observed.push({ step, status: preview?.status ?? "none", ...(preview?.width ? { width: preview.width, height: preview.height } : {}) });
      if ((preview?.status ?? "none") !== expected) throw new Error(`${step}: expected a ${expected} preview, got ${preview?.status ?? "none"}`);
      if (preview?.path !== undefined && !(await stat(preview.path)).isFile()) throw new Error(`${step}: preview image is missing`);
      return preview;
    };
    context.trace.emit({ type: "tool.call.started", data: { tool: "fixture.graph-preview" } });
    const bytes = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96"><rect width="96" height="96" rx="16" fill="#155e75"/><path d="M48 12L68 64H28Z" fill="#fb923c"/><circle cx="48" cy="43" r="8" fill="#fff"/></svg>');
    const image = await graph.visualAssets.add({ scope: await graph.visualAssets.scope(), name: "Launch plan", description: "A deterministic launch symbol used to prove image preview loading.", tagIds: [],
      file: { name: "launch.svg", mediaType: "image/svg+xml", expectedDigest: `sha256:${createHash("sha256").update(bytes).digest("hex")}`, async read() { return bytes; } } });
    const plan = new NodeObject({ kind: "image", assetId: image.id }, "Plan", "The steps in order.", "concept", "plan");
    const risks = new NodeObject("alert-triangle", "Risks", "What could go wrong.", "concept", "risks");
    risks.detailAuthoring.setComponent("risks", html`<section><img asset=${assetRef(image.id)} alt="Launch plan"/><h2>Risks</h2><p>Two risks need owners before launch.</p></section>`, css`h2{margin:0}img{width:96px;height:96px}`);
    await see("plain node", (await graph.submitNode(plan)).preview, "none");
    await see("authored node", (await graph.submitNode(risks)).preview, "rendered");
    const edge = new EdgeObject([plan, risks], "plan-risks");
    await graph.createEdge(edge);
    const layout = (x: number) => new LayerLayoutObject([new NodePlacementObject(plan, x, 0.5), new NodePlacementObject(risks, 0.75, 0.5)], "default");
    const first = await see("layer", (await graph.submitLayer(new LayerObject([plan, risks], [edge], layout(0.25), "root"))).preview, "rendered");
    const moved = await see("moved layer", (await graph.submitLayer(new LayerObject([plan, risks], [edge], layout(0.4), "root"))).preview, "rendered");
    if (moved?.path === first?.path) throw new Error("moved layer: the fresh image reused the old one");
    const layer = new LayerObject([plan, risks], [edge], layout(0.4), "root");
    await see("unchanged layer", (await graph.submitLayer(layer)).preview, "cached");
    await graph.addAction(context.inputGraph.id, { kind: "navigate", relation: "expand", label: "Response", target: layer, clientKey: "response" });
    await graph.submit(context.inputGraph.id);
    context.trace.emit({ type: "tool.call.completed", data: { tool: "fixture.graph-preview", status: "completed", previews: observed } });
  }
}

export const graphPreviewFixtureFactory: HarnessFactory = () => new GraphPreviewFixtureHarness();
