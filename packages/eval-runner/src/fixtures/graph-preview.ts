import { EdgeObject, LayerLayoutObject, LayerObject, NodeObject, NodePlacementObject, RelayerGraphClient, css, html, type GraphPreview } from "@relayer/graph-client";
import type { Harness, HarnessFactory, HarnessRunContext, HarnessSessionState, HarnessTraceSupport } from "@relayer/harness-host";
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
    const plan = new NodeObject("list", "Plan", "The steps in order.", "concept", "plan");
    const risks = new NodeObject("alert-triangle", "Risks", "What could go wrong.", "concept", "risks");
    risks.detailAuthoring.setComponent("risks", html`<section><h2>Risks</h2><p>Two risks need owners before launch.</p></section>`, css`h2{margin:0}`);
    await see("plain node", (await graph.submitNode(plan)).preview, "none");
    await see("authored node", (await graph.submitNode(risks)).preview, "rendered");
    const edge = new EdgeObject([plan, risks], "plan-risks");
    await graph.createEdge(edge);
    const layout = (x: number) => new LayerLayoutObject([new NodePlacementObject(plan, x, 0.5), new NodePlacementObject(risks, 0.75, 0.5)]);
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
