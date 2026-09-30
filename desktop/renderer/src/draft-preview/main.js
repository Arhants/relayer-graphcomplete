import { createProductWorkspace } from "../product-workspace/index.js";
import { createPublicViewerAdapter } from "../public-share-viewer/adapter.js";
import { waitForPreviewImages } from "./image-readiness.js";
import { draftPreviewReadModel } from "./snapshot.js";

const frames = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

function rectOf(selector) {
  const rect = document.querySelector(selector)?.getBoundingClientRect();
  if (!rect || !rect.width || !rect.height) throw new Error(`${selector} is not visible.`);
  return { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) };
}

async function until(check, label, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (!check()) {
    if (Date.now() > deadline) throw new Error(`Draft preview timed out waiting for ${label}.`);
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

/**
 * Boot the production ProductWorkspace over one draft and expose the steps a
 * host renderer drives: `frame()` shows the target and reports its on-page
 * rectangle; `settle()` applies Fit for a layer and reports the final rectangle.
 */
function bootDraftPreview() {
  const input = JSON.parse(JSON.parse(document.querySelector("#relayerDraftSnapshot").textContent));
  const snapshot = draftPreviewReadModel(input);
  const adapter = createPublicViewerAdapter(snapshot);
  const host = document.querySelector("#draftPreviewHost");
  const workspace = createProductWorkspace({
    root: host,
    mode: "review",
    getState: () => adapter.state,
    getThread: () => adapter.thread,
    selection: adapter.selection,
    layerSelectionMemoryOwner: {},
    showThread: () => {},
    showEmpty: () => {},
    getNavigationHistory: () => ({ canGoBack: false, canGoForward: false }),
    onNavigateHistory: async () => false,
    onSelectTurn: () => {},
    onSelectTurnById: () => {},
    onSelectionChange: (nodeId) => { adapter.selection.selectedNodeId = nodeId; },
    onExportConversation: null,
    onSubmitInteraction: async () => false,
    onOpenSettings: () => {},
    onNavigateLayer: async () => false,
    onNavigateResolvedInvoke: async () => false,
    onInvokeAction: adapter.onInvokeAction,
    resolveNodeDetailAsset: (asset) => snapshot.resolveNodeDetailAsset(asset),
    onDecideApproval: async () => false,
    annotationApi: null,
    contextDraftApi: null,
    inputDraftApi: null,
    inputOperatorAvailable: false,
  });
  host.querySelector(".workspace-layout .environment-panel")?.remove();
  workspace.render();
  const target = input.target;
  return {
    async frame() {
      await until(() => document.querySelector("#nodeLayer .graph-node"), "the graph");
      await document.fonts.ready;
      const inspectorOpen = () => !document.querySelector("#inspector")?.classList.contains("hidden");
      if (target.kind === "layer") {
        if (inspectorOpen()) document.querySelector("#closeInspector")?.click();
        await frames();
        return rectOf("#graphStage");
      }
      const node = document.querySelector(`#nodeLayer .graph-node[data-node="${CSS.escape(String(target.nodeId))}"]`);
      if (!inspectorOpen() || String(adapter.selection.selectedNodeId) !== String(target.nodeId)) node?.click();
      await until(inspectorOpen, "Node Details");
      await until(() => document.querySelector("#inspector .node-detail-runtime-host")?.shadowRoot?.childElementCount, "the authored detail", 5_000)
        .catch(() => {});
      await frames();
      return rectOf("#inspector");
    },
    async settle() {
      if (target.kind === "layer") document.querySelector("#fitGraph")?.click();
      await waitForPreviewImages(document.querySelector(target.kind === "layer" ? "#graphStage" : "#inspector"));
      await frames();
      return rectOf(target.kind === "layer" ? "#graphStage" : "#inspector");
    },
  };
}

try {
  window.relayerDraftPreview = bootDraftPreview();
} catch (error) {
  window.relayerDraftPreview = { error: String(error?.message ?? error) };
}
