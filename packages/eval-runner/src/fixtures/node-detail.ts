import {
  RelayerGraphClient,
  LayerLayoutObject,
  LayerObject,
  NodeObject,
  NodePlacementObject,
  assetRef,
  detailCapability,
  html,
  css,
  compiledNodeDetailHasExactMountHost,
  type GraphNode,
  type CompletionOutput,
  type GraphCapability,
} from "@relayer/graph-client";
import {
  renderInteractionInput,
  type Harness,
  type HarnessConfiguration,
  type HarnessFactory,
  type HarnessRunContext,
} from "@relayer/harness-host";
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { canonicalJson } from "../cases/catalog.js";
import { checkBasicOutput, type EvalCheck } from "../cases/graph-checks.js";

export const nodeDetailHarnessConfiguration: HarnessConfiguration = {
  schemaVersion: 1,
  name: "fixture-node-detail",
  implementation: "fixture.node-detail",
  implementationVersion: 1,
  graphCapabilityProfile: { search: "query-v1" },
  permissionBindings: { ask: {}, auto: {}, full: {} },
  settings: {},
};

const SESSION_ID = "fixture.node-detail.session.v1";
const FIXTURE_VISUAL = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 120" role="img"><rect width="320" height="120" rx="18" fill="#172554"/><circle cx="62" cy="60" r="30" fill="#38bdf8"/><path d="M122 42h150v14H122zm0 28h104v10H122z" fill="#e0f2fe"/></svg>`;
const FIXTURE_VISUAL_LIGHT = FIXTURE_VISUAL.replaceAll("#172554", "#e0f2fe")
  .replaceAll("#38bdf8", "#0369a1").replace('fill="#e0f2fe"/></svg>', 'fill="#172554"/></svg>');

export const NODE_DETAIL_EVAL_CASE_ID =
  "empty-project.visual-node-detail.single-turn";

export const nodeDetailEvalCase = Object.freeze({
  id: NODE_DETAIL_EVAL_CASE_ID,
  name: "Visual Node Detail · accepted package",
  description:
    "Loads a deterministic accepted package with authored layout and every currently supported Node Detail capability in the production review workspace.",
  defaultSelected: false,
  gradeExecution: gradeNodeDetailExecution,
  requiredHarnessConfigurationNames: Object.freeze([
    nodeDetailHarnessConfiguration.name,
  ]),
  prompts: Object.freeze([
    "Create the deterministic accepted visual Node Detail fixture for product and Eval review.",
  ]),
});

/** Grade accepted Product output, independently of the paid presentation experiment. */
export function gradeNodeDetailExecution(input: {
  readonly interactions: readonly { readonly interaction: {
    readonly graphNodeId: number;
    readonly completionOutput?: CompletionOutput;
  } }[];
}): { readonly turns: readonly { readonly checks: readonly EvalCheck[] }[] } {
  if (input.interactions.length !== 1) throw new Error("Visual Node Detail fixture requires exactly one product turn.");
  const { completionOutput: output, graphNodeId } = input.interactions[0]!.interaction;
  if (!output) throw new Error("Visual Node Detail fixture requires an accepted graph output.");
  const node = output.rootLayer.nodes.find((item) => item.clientKey === "fixture-node-detail.accepted");
  const detail = node?.authoredDetail;
  const content = detail && { version: detail.version, components: detail.components, mounts: detail.mounts, assets: detail.assets };
  const compiled = detail?.version === 1 && detail.components.length > 0
    && detail.components.every((component) => component.id !== "" && component.html !== "" && typeof component.css === "string")
    && createHash("sha256").update(canonicalJson(content)).digest("hex") === detail.integritySha256;
  const image = detail?.mounts.some((mount) => mount.kind === "asset" && mount.host === "img"
    && compiledNodeDetailHasExactMountHost(detail, mount)
    && detail.assets.some((asset) => asset.id === mount.assetId && asset.representation === "image"
      && ["image/svg+xml", "image/png", "image/jpeg"].includes(asset.mediaType)
      && /^[a-f0-9]{64}$/.test(asset.digestSha256))) === true;
  const capabilities = ["expand", "reference", "invoke", "input", "link"].every((kind) =>
    detail?.mounts.some((mount) => {
      if (mount.kind !== "capability" || mount.capability.kind !== kind
        || !compiledNodeDetailHasExactMountHost(detail, mount)) return false;
      if (kind === "input" ? mount.host !== "input"
        : kind === "link" ? mount.host !== "a"
          : mount.host !== "button" && mount.host !== "a") return false;
      const capability = mount.capability;
      if (capability.kind === "link") return mount.host === "a" && capability.href === "https://example.com/relayer-node-detail";
      return capability.action.sourceNode.clientKey === node?.clientKey
        && capability.action.sourceLayer?.clientKey === output.rootLayer.layer.clientKey
        && output.rootLayer.actions.some((action) => action.state === "accepted"
          && action.sourceNodeId === node?.id && action.sourceLayerId === output.rootLayer.layer.id
          && action.clientKey === capability.action.clientKey
          && (kind === "expand" || kind === "reference"
            ? action.kind === "navigate" && action.relation === kind && Number.isInteger(action.targetLayerId)
            : action.kind === kind));
    }) === true);
  return { turns: [{ checks: [
    ...checkBasicOutput(output, graphNodeId),
    { name: "visual-fixture:compiled-package", passed: compiled === true, detail: "The accepted fixture node retains a compiled package with matching canonical integrity." },
    { name: "visual-fixture:pinned-image", passed: image, detail: "An authored image mount references a pinned supported image in the accepted package; byte delivery and rendering require separate Product evidence." },
    { name: "visual-fixture:capabilities", passed: capabilities, detail: "Expand, reference, invoke, input, and external link mounts remain bound to the accepted fixture actions and source layer." },
  ] }] };
}

class NodeDetailHarness implements Harness {
  constructor(private readonly temporalEvidenceGatePath?: string) {}

  traceSupport() {
    return {
      prompt: "full" as const,
      messages: "full" as const,
      reasoningSummaries: "none" as const,
      modelCalls: "none" as const,
      toolCalls: "summary" as const,
      usage: "none" as const,
      childStreams: "none" as const,
      nativeArtifacts: "none" as const,
    };
  }

  state() {
    return { graphMemorySessionId: SESSION_ID };
  }

  async complete(context: HarnessRunContext): Promise<void> {
    try {
      const graph = new RelayerGraphClient(
        context.graph.acquireCapability() as GraphCapability,
      );
      const prompt = renderInteractionInput(context.interactionInput);
      context.trace.emit({
        type: "prompt",
        data: { text: prompt, kind: "fixture-input" },
      });
      context.trace.emit({
        type: "tool.call.started",
        data: { tool: "fixture.node-detail" },
      });
      const milestone = async (stage: string) => {
        if (this.temporalEvidenceGatePath) {
          await writeFile(this.temporalEvidenceGatePath, JSON.stringify({ stage }), "utf8");
        }
      };
      await milestone("started");
      const visualAssetScope = await graph.visualAssets.scope();
      await milestone("scope-resolved");
      const visualAsset = await graph.visualAssets.add({
        scope: visualAssetScope,
        name: "Accepted detail status illustration",
        tagIds: [],
        file: {
          name: "accepted-detail-status.svg",
          mediaType: "image/svg+xml",
          async read() {
            return new TextEncoder().encode(FIXTURE_VISUAL);
          },
        },
      });

      await milestone("asset-added");
      const lightVisualAsset = await graph.visualAssets.add({
        scope: visualAssetScope, name: "Accepted detail status illustration light", tagIds: [],
        file: { name: "accepted-detail-status-light.svg", mediaType: "image/svg+xml",
          async read() { return new TextEncoder().encode(FIXTURE_VISUAL_LIGHT); } },
      });
      const expanded = new NodeObject(
        "panels-top-left",
        "Expanded implementation notes",
        "The expand capability opens this authored child layer.",
        "fixture.node-detail",
        "fixture-node-detail.expanded",
      );
      const referenced = new NodeObject(
        "book-open",
        "Referenced evidence",
        "The reference capability opens this shared evidence layer without changing its meaning.",
        "fixture.node-detail",
        "fixture-node-detail.referenced",
      );
      const expandedLayer = new LayerObject(
        [expanded],
        [],
        new LayerLayoutObject([new NodePlacementObject(expanded, 0.5, 0.5)]),
        "fixture-node-detail.expanded-layer",
      );
      const referencedLayer = new LayerObject(
        [referenced],
        [],
        new LayerLayoutObject([new NodePlacementObject(referenced, 0.5, 0.5)]),
        "fixture-node-detail.referenced-layer",
      );
      const node = new NodeObject(
        "layout-template",
        "Accepted Visual Node Detail",
        "The accepted package mounts inside the sidebar through the constrained runtime with pinned visual content.",
        "fixture.node-detail",
        "fixture-node-detail.accepted",
      );
      const layer = new LayerObject(
        [node],
        [],
        new LayerLayoutObject([new NodePlacementObject(node, 0.5, 0.5)]),
        "fixture-node-detail.root",
      );
      const expandAction = {
        kind: "navigate" as const,
        relation: "expand" as const,
        label: "Open implementation notes",
        sourceLayer: layer,
        target: expandedLayer,
        clientKey: "fixture-node-detail.expand",
      };
      const referenceAction = {
        kind: "navigate" as const,
        relation: "reference" as const,
        label: "Open referenced evidence",
        sourceLayer: layer,
        target: referencedLayer,
        clientKey: "fixture-node-detail.reference",
      };
      const invokeAction = {
        kind: "invoke" as const,
        label: "Investigate follow-up",
        interactionText:
          "Investigate the accepted visual Node Detail fixture further.",
        sourceLayer: layer,
        clientKey: "fixture-node-detail.invoke",
      };
      const inputAction = {
        kind: "input" as const,
        label: "Review note",
        control: "text" as const,
        prompt: "Add a review note",
        sourceLayer: layer,
        clientKey: "fixture-node-detail.input",
      };
      node.detailAuthoring.setComponent(
        "primary",
        html`<section class="summary">
          <p class="eyebrow">Deterministic Eval fixture</p>
          <h2>Save the midday surplus</h2>
          <p>
            Battery storage moves available solar energy into the evening.
            This illustrative day uses 3 kWh in the morning, 6 kWh at midday,
            and 4 kWh from storage after sunset.
          </p>
        </section>`,
        css`
          [data-relayer-theme="light"] {
            display: block;
            --detail-text: #182c34; --detail-muted: #50646d; --detail-surface: #fafbf9;
            --detail-raised: #edf1ed; --detail-border: #a1b2b9; --detail-solar: #956009; --detail-store: #197864;
            background-color: #fafbf9;
          }
          [data-relayer-theme="dark"] {
            display: block;
            --detail-text: #edf2f3; --detail-muted: #aebbc2; --detail-surface: #121619;
            --detail-raised: #1b2227; --detail-border: #637580; --detail-solar: #f3c875; --detail-store: #84cfbd;
            background-color: #121619;
          }
          section, aside, dl, figure, nav { color: var(--detail-text); }
          button, input { color: var(--detail-text); background-color: var(--detail-raised); border: 1px solid var(--detail-border); border-radius: 0.5rem; padding: 0.5rem; }
          button:hover:enabled { border-color: var(--detail-store); }
          button:focus-visible, input:focus-visible, a:focus-visible { outline: 2px solid var(--detail-store); outline-offset: 2px; }
          a { color: var(--detail-store); }
          .summary {
            display: grid;
            gap: 0.5rem;
            padding: 0.75rem;
            border: 1px solid var(--detail-border);
            border-radius: 0.75rem;
          }
          .eyebrow {
            color: var(--detail-muted);
            font-size: 0.75rem;
            text-transform: uppercase;
            letter-spacing: 0.08em;
          }
          h2,
          p {
            margin: 0;
          }
        `,
      );
      node.detailAuthoring.setComponent(
        "status",
        html`<aside>
          <strong>Status</strong><span>Ready for constrained rendering</span>
        </aside>`,
        css`
          aside {
            display: flex;
            justify-content: space-between;
            gap: 1rem;
          }
        `,
      );
      node.detailAuthoring.setComponent(
        "facts",
        html`<dl aria-label="Illustrative daily solar energy in kWh">
          <dt>Morning</dt><dd><span class="chart-bar morning">3 kWh</span></dd>
          <dt>Midday</dt><dd><span class="chart-bar midday">6 kWh</span></dd>
          <dt>Evening</dt><dd><span class="chart-bar evening">4 kWh</span></dd>
        </dl>`,
        css`
          dl {
            display: grid;
            grid-template-columns: auto 1fr;
            gap: 0.5rem;
          }
          dt,
          dd {
            margin: 0;
          }
          .chart-bar { display: block; padding: 0.25rem; color: var(--detail-surface); background-color: var(--detail-solar); font-weight: 600; }
          .morning { width: 50%; }
          .midday { width: 100%; }
          .evening { width: 67%; background-color: var(--detail-store); }
        `,
      );
      node.detailAuthoring.setComponent(
        "visual",
        html`<figure>
          <img
            class="visual-dark"
            alt="Accepted detail status illustration"
            asset=${assetRef(visualAsset.id)}
          />
          <img class="visual-light" alt="Accepted detail status illustration light" asset=${assetRef(lightVisualAsset.id)} />
          <figcaption>
            Pinned content resolved through the active Eval completion scope.
          </figcaption>
        </figure>`,
        css`
          figure {
            display: grid;
            gap: 0.5rem;
            margin: 0;
          }
          img {
            display: block;
            width: 100%;
            height: auto;
            border-radius: 0.75rem;
          }
          .visual-light { display: none; }
          [data-relayer-theme="light"] .visual-dark { display: none; }
          [data-relayer-theme="light"] .visual-light { display: block; }
          figcaption {
            color: var(--detail-muted);
            font-size: 0.8rem;
          }
        `,
      );
      node.detailAuthoring.setComponent(
        "navigation",
        html`<nav aria-label="Fixture navigation">
          <button gc=${detailCapability.expand("expand-notes", expandAction)}>
            Open implementation notes</button
          ><button
            gc=${detailCapability.reference("reference-evidence", referenceAction)}
          >
            Open referenced evidence
          </button>
        </nav>`,
        css`
          nav {
            display: grid;
            grid-template-columns: 1fr;
            gap: 0.5rem;
          }
          button {
            min-height: 2.25rem;
            text-align: left;
          }
        `,
      );
      node.detailAuthoring.setComponent(
        "actions",
        html`<section class="actions">
          <a
            gc=${detailCapability.externalLink("fixture-docs", "https://example.com/relayer-node-detail")}
            >Open fixture documentation</a
          ><button
            gc=${detailCapability.invoke("invoke-follow-up", invokeAction)}
          >
            Investigate follow-up</button
          ><label
            >Review note
            <input
              gc=${detailCapability.input("review-note", inputAction)}
              aria-label="Review note"
          /></label>
        </section>`,
        css`
          .actions {
            display: grid;
            gap: 0.75rem;
          }
          label {
            display: grid;
            gap: 0.25rem;
          }
          input {
            min-width: 0;
          }
        `,
      );
      await graph.submitNode(expanded);
      await milestone("expanded-submitted");
      await graph.submitNode(referenced);
      await milestone("referenced-submitted");
      const submitted: GraphNode = await graph.submitNode(node);
      await milestone("detail-submitted");
      await graph.submitLayer(expandedLayer);
      await milestone("expanded-layer-submitted");
      await graph.submitLayer(referencedLayer);
      await milestone("referenced-layer-submitted");
      const submittedLayer = await graph.submitLayer(layer);
      await milestone("main-layer-submitted");
      await graph.addAction(node, expandAction);
      await graph.addAction(node, referenceAction);
      await graph.addAction(node, invokeAction);
      await graph.addAction(node, inputAction);
      await graph.addAction(context.inputGraph.id, {
        kind: "navigate",
        relation: "expand",
        label: "Response",
        target: layer,
        clientKey: "fixture-node-detail.response",
      });
      if (this.temporalEvidenceGatePath) {
        const draftOnly = await graph.submitNode(
          new NodeObject(
            "file",
            "Unpublished draft detail",
            "This node is intentionally outside the accepted current layer.",
            "fixture.node-detail",
            "fixture-node-detail.draft-only",
          ),
        );
        await writeFile(this.temporalEvidenceGatePath, JSON.stringify({ stage: "before-advance" }), "utf8");
        const current = await graph.getCurrent();
        const advanced = await graph.advanceCurrent(
          layer,
          current.headRevision,
          "fixture-node-detail-advance",
        );
        await waitForTemporalEvidenceRelease(this.temporalEvidenceGatePath, {
          stage: "advanced",
          nodeId: submitted.id,
          draftNodeId: draftOnly.id,
          layerId: submittedLayer.id,
          assetId: visualAsset.id,
        });
        await graph.returnCurrent(
          layer,
          advanced.revision,
          "fixture-node-detail-return",
        );
      } else {
        await graph.submit(context.inputGraph.id);
      }
      context.trace.emit({
        type: "tool.call.completed",
        data: { tool: "fixture.node-detail", status: "completed" },
      });
      context.trace.emit({
        type: "message",
        data: {
          role: "assistant",
          text: `Accepted node ${submitted.id} has a compiled Node Detail.`,
        },
      });
    } catch (error) {
      if (this.temporalEvidenceGatePath) {
        await writeFile(this.temporalEvidenceGatePath, JSON.stringify({
          stage: "failed",
          error: error instanceof Error ? error.stack : String(error),
        }), "utf8");
      }
      throw error;
    }
  }
}

export const nodeDetailFixtureFactory: HarnessFactory = () =>
  new NodeDetailHarness();
export const nodeDetailFixtureFactoryWithTemporalGate = (
  gatePath: string,
): HarnessFactory => () => new NodeDetailHarness(gatePath);

async function waitForTemporalEvidenceRelease(
  gatePath: string | undefined,
  evidence: Record<string, string | number>,
): Promise<void> {
  if (!gatePath) return;
  await writeFile(gatePath, JSON.stringify(evidence), "utf8");
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if ((await readFile(gatePath, "utf8").catch(() => "")) === "release")
      return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(
    "Timed out waiting for the deterministic Node Detail temporal evidence gate.",
  );
}
