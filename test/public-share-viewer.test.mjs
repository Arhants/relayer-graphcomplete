import { beforeEach, describe, expect, it, vi } from "vitest";
import { Window } from "happy-dom";
import { spawnSync } from "node:child_process";
import { createHash, webcrypto } from "node:crypto";
import { readFileSync } from "node:fs";

import { createPublicViewerAdapter } from "../desktop/renderer/src/public-share-viewer/adapter.js";
import { compiledNodeDetailCoversActions } from "../desktop/renderer/src/product-workspace/workspace.js";
import {
  bootPublicViewer,
  fitPublicTurnPopover,
  observeEmbedInspectorLayout,
  configureEmbedReading,
} from "../desktop/renderer/src/public-share-viewer/main.js";
import {
  parsePublicSnapshot,
  PublicSnapshotError,
} from "../desktop/renderer/src/public-share-viewer/snapshot.js";
import {
  publicViewerCsp,
  renderPublicViewerTemplate,
} from "../desktop/renderer/src/public-share-viewer/template.js";

function layer(id, nodeId, actions = [], { layout = true } = {}) {
  return {
    layer: {
      id,
      nodes: [nodeId],
      edges: [],
      ...(layout ? { layout: { version: 1, placements: [{ nodeId, x: .5, y: .5 }] } } : {}),
      state: "accepted",
    },
    nodes: [{
      id: nodeId,
      kind: "concept",
      icon: "box",
      title: `Node ${nodeId}`,
      detail: `Details for ${nodeId}`,
      state: "accepted",
    }],
    edges: [],
    actions,
  };
}

function action(id, sourceNodeId, targetLayerId, relation, sourceLayerId) {
  return {
    id,
    sourceNodeId,
    sourceLayerId,
    kind: "navigate",
    relation,
    label: relation === "expand" ? "Open nested layer" : "See related layer",
    variant: "pill",
    targetLayerId,
    state: "accepted",
  };
}

function fixtureJsonl({ status = "accepted", includeFailedTurn = false } = {}) {
  const rootAction = {
    id: "action:root",
    sourceNodeId: "node:interaction",
    kind: "navigate",
    relation: "expand",
    label: "Show response",
    variant: "pill",
    targetLayerId: "layer:root",
    state: "accepted",
  };
  const root = layer("layer:root", "node:root", [
    action("action:expand", "node:root", "layer:nested", "expand", "layer:root"),
  ]);
  const nested = layer("layer:nested", "node:nested", [
    action("action:reference", "node:nested", "layer:related", "reference", "layer:nested"),
  ]);
  const related = layer("layer:related", "node:related", [
    action("action:cycle", "node:related", "layer:related", "reference", "layer:related"),
  ]);
  const accepted = {
    recordType: "turn",
    id: "turn:1",
    sequence: 1,
    createdAt: "2026-09-25T00:00:00Z",
    text: "Map the fixture",
    interactionNodeId: "node:interaction",
    origin: { kind: "user" },
    completion: {
      status,
      permissionProfileId: "auto",
      harnessConfigurationName: "fixture",
      modelSelection: { providerId: "fixture", modelId: "fixture-model", modelFamilyId: 1 },
      error: "provider details must not enter the viewer model",
      attemptAdmissionId: "admission:private",
    },
    contexts: [],
    submittedInputs: [],
    acceptedView: status === "accepted" ? {
      interactionNodeId: "node:interaction",
      rootAction,
      rootLayerId: "layer:root",
      layers: [root, nested, related],
    } : null,
  };
  const records = [{
    recordType: "header",
    exportVersion: 1,
    exportedAt: "2026-09-25T00:00:00Z",
    producer: { desktopVersion: "fixture", buildCommit: "fixture", platform: "darwin", architecture: "arm64" },
    conversation: {
      id: "conversation:fixture",
      title: "Fixture conversation",
      createdAt: "2026-09-25T00:00:00Z",
      projectName: "fixture-project",
      harnessConfigurationName: "fixture",
      permissionProfileId: "auto",
    },
    turns: [{ id: "turn:1", sequence: 1 }],
  }, accepted];
  if (includeFailedTurn) {
    records[0].turns.push({ id: "turn:2", sequence: 2 });
    records.push({
      ...accepted,
      id: "turn:2",
      sequence: 2,
      text: "Failed turn",
      completion: { status: "failed", permissionProfileId: "auto", error: "private error" },
      acceptedView: null,
    });
  }
  return `${records.map((record) => JSON.stringify(record)).join("\n")}\n`;
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function recordsJsonl(records) {
  return `${records.map((record) => JSON.stringify(record)).join("\n")}\n`;
}

function invokeFixtureRecords() {
  const records = fixtureJsonl().trimEnd().split("\n").map(JSON.parse);
  const source = records[1];
  source.acceptedView.layers[0].actions.push({
    id: "action:invoke", sourceNodeId: "node:root", sourceLayerId: "layer:root",
    kind: "invoke", interactionText: "Continue", label: "Open accepted result", variant: "pill", state: "accepted",
  }, {
    id: "action:input", sourceNodeId: "node:root", sourceLayerId: "layer:root",
    kind: "input", label: "Choose a path", variant: "pill", state: "accepted",
    input: { control: "single_select", prompt: "Which path?", options: [{ key: "a", label: "Path A" }, { key: "b", label: "Path B" }] },
  });
  records[0].turns.push({ id: "turn:2", sequence: 2 });
  records.push({
    ...source, id: "turn:2", sequence: 2, interactionNodeId: "node:child-interaction",
    origin: { kind: "action", source_turn_id: "turn:1", source_action_id: "action:invoke" },
    acceptedView: {
      interactionNodeId: "node:child-interaction", rootLayerId: "layer:child",
      rootAction: action("action:child-root", "node:child-interaction", "layer:child", "expand"),
      layers: [layer("layer:child", "node:child")],
    },
  });
  return records;
}

function assetFixtureJsonl(bytes = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><circle cx="1" cy="1" r="1"/></svg>')) {
  const records = fixtureJsonl().trimEnd().split("\n").map((line) => JSON.parse(line));
  const digestSha256 = createHash("sha256").update(bytes).digest("hex");
  const asset = { id: "public-image", digestSha256, mediaType: "image/svg+xml", representation: "image" };
  const detail = {
    version: 1,
    components: [{ id: "image", order: 0, html: '<img alt="Published illustration" data-asset-mount="image">', css: "" }],
    mounts: [{ id: "image", componentId: "image", kind: "asset", host: "img", assetId: asset.id }],
    assets: [asset],
  };
  detail.integritySha256 = createHash("sha256").update(canonicalJson(detail)).digest("hex");
  records[0].exportVersion = 2;
  records[1].acceptedView.layers[0].nodes[0].authoredDetail = detail;
  records[1].acceptedView.layers[0].nodes[0].authoredDetailAssets = [{
    assetId: asset.id,
    digestSha256,
    mediaType: asset.mediaType,
    byteLength: bytes.length,
    provenance: { source: "user", fileName: "illustration.svg" },
  }];
  records.splice(1, 0, {
    recordType: "visualAssetContent",
    digestSha256,
    mediaType: asset.mediaType,
    byteLength: bytes.length,
    contentBase64: bytes.toString("base64"),
  });
  return { jsonl: `${records.map((record) => JSON.stringify(record)).join("\n")}\n`, asset };
}

describe("public share V1 reader", () => {
  it("rejects bytes above the frozen 16 MiB share contract before parsing", () => {
    try {
      parsePublicSnapshot(new Uint8Array((16 * 1024 * 1024) + 1));
      expect.fail("expected the oversized snapshot to be rejected");
    } catch (error) {
      expect(error).toBeInstanceOf(PublicSnapshotError);
      expect(error.code).toBe("file_too_large");
    }
  });

  it("validates the existing header/turn contract and exposes only accepted turns", () => {
    const snapshot = parsePublicSnapshot(fixtureJsonl({ includeFailedTurn: true }));
    expect(snapshot.interactions).toHaveLength(1);
    expect(snapshot.interactions[0].completionStatus).toBe("accepted");
    expect(snapshot.interactions[0].completionError).toBeUndefined();
    expect(snapshot.turns[0].completion.error).toBeUndefined();
    expect(snapshot.turns[0].completion.attemptAdmissionId).toBeUndefined();
    expect(snapshot.interactions[0].completionOutput.rootLayer.layer.id).toBe("layer:root");
    expect(snapshot.thread.projectId).toBe("export:project");
    expect(snapshot.state.environment.snapshot.worktreeLabel).toBe("fixture-project");
    expect(snapshot.layerFor("turn:1", "layer:related").nodes[0].id).toBe("node:related");
    expect(snapshot.turnContainingLayer("layer:nested").id).toBe("turn:1");
  });

  it("preserves valid default nodes and rejects defaults outside the public layer", () => {
    const records = fixtureJsonl().trim().split("\n").map(JSON.parse);
    const root = records[1].acceptedView.layers[0];
    root.layer.defaultNodeId = root.nodes[0].id;
    expect(parsePublicSnapshot(recordsJsonl(records)).state.visibleLayer.layer.defaultNodeId).toBe(root.nodes[0].id);
    root.layer.defaultNodeId = "node:nested";
    expect(() => parsePublicSnapshot(recordsJsonl(records))).toThrow(expect.objectContaining({ code: "default_node_outside_layer" }));
  });

  it("reads asset-bearing V2 bytes and resolves only the node's pinned visual content", async () => {
    const { jsonl, asset } = assetFixtureJsonl();
    const snapshot = parsePublicSnapshot(jsonl);
    const createObjectURL = vi.fn(() => "blob:https://share.example.test/public-image");
    const revokeObjectURL = vi.fn();
    const resolved = await snapshot.resolveNodeDetailAsset(asset, {
      crypto: webcrypto,
      URL: { createObjectURL, revokeObjectURL },
      Blob,
    });
    expect(snapshot.header.exportVersion).toBe(2);
    expect(resolved).toMatchObject({
      url: "blob:https://share.example.test/public-image",
      digestSha256: asset.digestSha256,
      mediaType: asset.mediaType,
    });
    expect(createObjectURL).toHaveBeenCalledOnce();
    resolved.release();
    expect(revokeObjectURL).toHaveBeenCalledWith(resolved.url);
    await expect(snapshot.resolveNodeDetailAsset({ ...asset, id: "not-pinned" })).rejects.toThrow();

    const records = jsonl.trimEnd().split("\n").map((line) => JSON.parse(line));
    records[1].contentBase64 = Buffer.alloc(records[1].byteLength, 65).toString("base64");
    const tampered = parsePublicSnapshot(`${records.map((record) => JSON.stringify(record)).join("\n")}\n`);
    await expect(tampered.resolveNodeDetailAsset(asset, {
      crypto: webcrypto,
      URL: { createObjectURL, revokeObjectURL },
      Blob,
    })).rejects.toThrow("digest mismatch");
  });

  it("accepts encoded visual content above the generic string ceiling when decoded bytes remain within the 8 MiB asset limit", () => {
    const bytes = Buffer.alloc(4_540_000, 65);
    const { jsonl } = assetFixtureJsonl(bytes);
    expect(Buffer.byteLength(jsonl)).toBeLessThan(16 * 1024 * 1024);
    expect(() => parsePublicSnapshot(jsonl)).not.toThrow();
  });

  it("preserves nested navigation and reference cycles without granting execution authority", async () => {
    const adapter = createPublicViewerAdapter(parsePublicSnapshot(fixtureJsonl()));
    expect(adapter.readOnly).toBe(true);
    expect(adapter.state.visibleLayer.layer.id).toBe("layer:root");
    await expect(adapter.navigateLayer("layer:nested", {
      action: adapter.state.actions[0],
      sourceNode: adapter.state.nodes[0],
    })).resolves.toBe(true);
    expect(adapter.state.visibleLayer.layer.id).toBe("layer:nested");
    expect(adapter.selection.layerPath.map(({ layerId }) => layerId)).toEqual(["layer:root", "layer:nested"]);
    await expect(adapter.navigateLayer("layer:related", {
      action: adapter.state.actions[0],
      sourceNode: adapter.state.nodes[0],
    })).resolves.toBe(true);
    expect(adapter.state.visibleLayer.layer.id).toBe("layer:related");
    for (let index = 0; index < 20; index += 1) {
      await adapter.navigateLayer("layer:related", { action: adapter.state.actions[0], sourceNode: adapter.state.nodes[0] });
    }
    expect(adapter.selection.layerPath.map(({ layerId }) => layerId)).toEqual(["layer:root", "layer:nested", "layer:related"]);
    await expect(adapter.onInvokeAction({ kind: "invoke" })).resolves.toBe(false);
    await expect(adapter.onSubmitInteraction("mutate")).resolves.toBe(false);
  });

  it("collapses a two-layer reference cycle to its existing breadcrumb", async () => {
    const records = fixtureJsonl().trimEnd().split("\n").map(JSON.parse);
    records[1].acceptedView.layers[2].actions = [action("action:cycle", "node:related", "layer:other", "reference", "layer:related")];
    records[1].acceptedView.layers.push(layer("layer:other", "node:other", [action("action:back", "node:other", "layer:related", "reference", "layer:other")]));
    const adapter = createPublicViewerAdapter(parsePublicSnapshot(recordsJsonl(records)));
    for (let index = 0; index < 20; index += 1) {
      await adapter.navigateLayer(adapter.state.actions[0].targetLayerId, { action: adapter.state.actions[0], sourceNode: adapter.state.nodes[0] });
      expect(adapter.selection.layerPath.length).toBeLessThanOrEqual(4);
    }
    expect(adapter.selection.layerPath.map(({ layerId }) => layerId)).toEqual(["layer:root", "layer:nested", "layer:related"]);
  });

  it("reads the declared 10,000-layer expansion depth and rejects a closing expand cycle", () => {
    const records = fixtureJsonl().trimEnd().split("\n").map(JSON.parse);
    const view = records[1].acceptedView;
    view.rootLayerId = "layer:0";
    view.rootAction.targetLayerId = "layer:0";
    view.layers = Array.from({ length: 10_000 }, (_, index) => layer(`layer:${index}`, `node:${index}`, index < 9_999 ? [
      action(`action:${index}`, `node:${index}`, `layer:${index + 1}`, "expand", `layer:${index}`),
    ] : []));
    expect(parsePublicSnapshot(recordsJsonl(records)).layersByTurn.get("turn:1").size).toBe(10_000);
    view.layers.at(-1).actions.push(action("action:last", "node:9999", "layer:0", "expand", "layer:9999"));
    expect(() => parsePublicSnapshot(recordsJsonl(records))).toThrow(expect.objectContaining({ code: "expand_cycle" }));
  });

  it.each(["draft", "stopped", undefined])("rejects %s root and layer action state", (state) => {
    for (const root of [true, false]) {
      const records = fixtureJsonl().trimEnd().split("\n").map(JSON.parse);
      const view = records[1].acceptedView;
      (root ? view.rootAction : view.layers[0].actions[0]).state = state;
      expect(() => parsePublicSnapshot(recordsJsonl(records))).toThrow(PublicSnapshotError);
    }
  });

  it.each(["snake", "camel"])("rehydrates %s accepted invoke origins without changing the exported authored shape", async (naming) => {
    const records = invokeFixtureRecords();
    if (naming === "camel") records[2].origin = { kind: "action", sourceTurnId: "turn:1", sourceActionId: "action:invoke" };
    const snapshot = parsePublicSnapshot(recordsJsonl(records));
    const adapter = createPublicViewerAdapter(snapshot);
    const invoke = adapter.state.actions.find((item) => item.kind === "invoke");
    expect(invoke.targetLayerId).toBe("layer:child");
    expect(snapshot.turns[0].acceptedView.layers[0].actions.find((item) => item.kind === "invoke").targetLayerId).toBeUndefined();
    expect(snapshot.layerFor("turn:1", "layer:root").actions.find((item) => item.kind === "invoke")).toBe(invoke);
    await expect(adapter.navigateResolvedInvoke(invoke)).resolves.toBe(true);
    expect(adapter.state.visibleLayer.layer.id).toBe("layer:child");
    expect(adapter.selection.currentInteractionId).toBe("turn:2");
    records[2].origin = { kind: "action", sourceTurnId: "turn:1", sourceActionId: "action:expand" };
    expect(() => parsePublicSnapshot(recordsJsonl(records))).toThrow(expect.objectContaining({ code: "invoke_origin_invalid" }));
  });

  it("leaves failed invoke results inert and rejects conflicting accepted resolutions", () => {
    const records = invokeFixtureRecords();
    const acceptedChild = structuredClone(records[2]);
    records[2].completion = { status: "failed", permissionProfileId: "auto" };
    records[2].acceptedView = null;
    const snapshot = parsePublicSnapshot(recordsJsonl(records));
    expect(snapshot.interactions).toHaveLength(1);
    expect(snapshot.state.actions.find((item) => item.kind === "invoke").targetLayerId).toBeUndefined();
    records[2] = acceptedChild;
    records[0].turns.push({ id: "turn:3", sequence: 3 });
    records.push({ ...acceptedChild, id: "turn:3", sequence: 3 });
    expect(() => parsePublicSnapshot(recordsJsonl(records))).toThrow(expect.objectContaining({ code: "invoke_origin_invalid" }));
  });

  it("joins existing source-layer keys for compiled actions without inventing omitted keys", () => {
    const records = fixtureJsonl().trimEnd().split("\n").map(JSON.parse);
    const root = records[1].acceptedView.layers[0];
    root.layer.clientKey = "root-layer";
    root.nodes[0].clientKey = "root-node";
    root.actions[0].clientKey = "expand-action";
    const detail = { mounts: [{ kind: "capability", capability: { kind: "expand", action: {
      clientKey: "expand-action", sourceLayer: { clientKey: "root-layer" }, sourceNode: { clientKey: "root-node" },
    } } }] };
    const projected = parsePublicSnapshot(recordsJsonl(records)).interactions[0].completionOutput.rootLayer;
    expect(compiledNodeDetailCoversActions(detail, projected.actions, projected.nodes[0])).toBe(true);
    delete root.layer.clientKey;
    const stripped = parsePublicSnapshot(recordsJsonl(records)).interactions[0].completionOutput.rootLayer;
    expect(stripped.actions[0].sourceLayerClientKey).toBeUndefined();
    expect(compiledNodeDetailCoversActions(detail, stripped.actions, stripped.nodes[0])).toBe(false);
  });

  it("resolves generated aliases for absent provenance layers and preserves explicit legacy keys", () => {
    const records = fixtureJsonl().trimEnd().split("\n").map(JSON.parse);
    const root = records[1].acceptedView.layers[0];
    root.nodes[0].clientKey = root.nodes[0].id;
    root.actions[0].clientKey = root.actions[0].id;
    root.actions[0].sourceLayerId = "layer:earlier-source";
    const detail = { mounts: [{ kind: "capability", capability: { kind: "expand", action: {
      clientKey: root.actions[0].id, sourceNode: { clientKey: root.nodes[0].id }, sourceLayer: { clientKey: "layer:earlier-source" },
    } } }] };
    const projected = parsePublicSnapshot(recordsJsonl(records)).interactions[0].completionOutput.rootLayer;
    expect(compiledNodeDetailCoversActions(detail, projected.actions, projected.nodes[0])).toBe(true);
    root.actions[0].sourceLayerId = root.layer.id;
    root.layer.clientKey = "legacy-private-key";
    detail.mounts[0].capability.action.sourceLayer.clientKey = "legacy-private-key";
    const legacy = parsePublicSnapshot(recordsJsonl(records)).interactions[0].completionOutput.rootLayer;
    expect(compiledNodeDetailCoversActions(detail, legacy.actions, legacy.nodes[0])).toBe(true);
  });

  it("preserves reused action provenance while requiring its node in the displayed layer", () => {
    const records = fixtureJsonl().trim().split("\n").map((line) => JSON.parse(line));
    const reused = records[1].acceptedView.layers[0].actions[0];
    reused.sourceLayerId = "layer:earlier-authoring-layer";
    const parsed = parsePublicSnapshot(recordsJsonl(records));
    expect(parsed.interactions[0].completionOutput.rootLayer.actions[0].sourceLayerId).toBe(reused.sourceLayerId);
    reused.sourceNodeId = "node:not-in-displayed-layer";
    expect(() => parsePublicSnapshot(recordsJsonl(records))).toThrow("An action source must be a member of its layer.");
  });

  it.each([
    ["unknown record type", () => `${JSON.stringify({ recordType: "metadata" })}\n`],
    ["manifest mismatch", () => fixtureJsonl().replace('"sequence":1,"createdAt"', '"sequence":2,"createdAt"')],
    ["unresolved target", () => fixtureJsonl().replace('"targetLayerId":"layer:nested"', '"targetLayerId":"layer:missing"')],
    ["nonaccepted view", () => fixtureJsonl({ status: "failed" })],
  ])("rejects %s before mounting", (_label, source) => {
    expect(() => parsePublicSnapshot(source())).toThrow(PublicSnapshotError);
  });
});

describe("public share HTML boundary", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("embeds frozen bytes as inert JSON and emits no browser network authority", () => {
    const html = renderPublicViewerTemplate({
      snapshot: fixtureJsonl().replace("Map the fixture", "</script><script>alert(1)</script>"),
      title: 'A <shared> "thread"',
      description: "A safe description",
    });
    expect(html).toContain('id="relayerPublicSnapshot"');
    expect(html).toContain("\\u003c");
    expect(html).not.toContain("</script>\\\";");
    expect(html).toContain('name="robots" content="noindex,nofollow,noarchive"');
    expect(html).toContain('property="og:image" content="/assets/relayer-share-og.svg"');
    expect(html).toContain("connect-src &#39;none&#39;");
    expect(html).toContain('src="/vendor/marked.umd.js"');
    expect(html).toContain('src="/vendor/lucide.min.js"');
    expect(html).not.toContain("fetch(");
    expect(html).not.toContain("public-share-topbar");
    expect(html).not.toContain(">Open Relayer</a>");
    expect(html).not.toContain("public-share-footer");
    expect(html).not.toContain("Also for Windows");
  });

  it("renders a worst-case 16 MiB snapshot within the page ceiling and a 384 MiB JS heap", () => {
    const templateUrl = new URL("../desktop/renderer/src/public-share-viewer/template.js", import.meta.url).href;
    const script = `
      import { renderPublicViewerTemplate } from ${JSON.stringify(templateUrl)};
      const total = 16 * 1024 * 1024;
      const header = '{"recordType":"header","exportVersion":1}\\n';
      const prefix = '{"recordType":"turn","content":"';
      const suffix = '"}\\n';
      const snapshot = Buffer.from(header + prefix + '<'.repeat(total - Buffer.byteLength(header + prefix + suffix)) + suffix);
      const html = renderPublicViewerTemplate({ snapshot, title: 'Worst-case generated-byte proof' });
      const bytes = Buffer.byteLength(html, 'utf8');
      if (snapshot.byteLength !== total || bytes <= 96 * 1024 * 1024 || bytes > 128 * 1024 * 1024) process.exit(1);
      process.stdout.write(String(bytes));
    `;
    const result = spawnSync(process.execPath, ["--max-old-space-size=384", "--input-type=module", "-e", script], {
      encoding: "utf8",
      timeout: 5_000,
    });
    expect(result.status, result.stderr).toBe(0);
    expect(Number(result.stdout)).toBeGreaterThan(96 * 1024 * 1024);
  });

  it("keeps the static shell aligned with the generated no-top-bar contract", () => {
    const html = readFileSync(new URL("../desktop/renderer/public-share.html", import.meta.url), "utf8");
    expect(html).not.toContain("public-share-topbar");
    expect(html).not.toContain(">Open Relayer</a>");
    expect(html).not.toContain("public-share-footer");
    expect(html).toContain('class="public-share-download-card"');
    expect(html).not.toContain("Also for Windows");
    expect(html).toContain(">Get Relayer</a>");
  });

  it("lets the production workspace own the complete browser viewport", () => {
    const styles = readFileSync(new URL("../desktop/renderer/src/public-share-viewer/viewer.css", import.meta.url), "utf8");
    expect(styles).toMatch(/\.public-share-main\s*{[^}]*height: 100vh;/s);
    expect(styles).toMatch(/\.public-share-workspace-host\s*{[^}]*height: 100%;[^}]*border: 0;[^}]*border-radius: 0;/s);
    expect(styles).toMatch(/\.public-share-shell \.thread-header\s*{[^}]*border-radius: 12px;/s);
  });

  it("aligns the turn picker to the interaction card with five visible rows", () => {
    const styles = readFileSync(new URL("../desktop/renderer/src/public-share-viewer/viewer.css", import.meta.url), "utf8");
    expect(styles).toMatch(/\.public-share-shell \.interaction-banner\s*{[^}]*position: relative;[^}]*margin-left: 0;/s);
    expect(styles).toMatch(/\.public-share-shell \.turn-picker\s*{[^}]*position: static;/s);
    expect(styles).toMatch(/\.public-share-shell \.turn-popover\s*{[^}]*right: 0;[^}]*left: 0;[^}]*width: auto;[^}]*52px \* 5/s);
  });

  it("fits embed layout transitions while newer gestures, narrow viewports and disposal cancel pending work", async () => {
    const browser = new Window();
    browser.document.body.innerHTML = '<div id="host"><aside id="inspector" class="hidden"></aside><button id="fitGraph">Fit</button></div>';
    const host = browser.document.querySelector("#host");
    const inspector = host.querySelector("#inspector");
    const fit = vi.fn();
    host.querySelector("#fitGraph").onclick = fit;
    let notify;
    let nextId = 0;
    const frames = new Map();
    const disconnect = vi.fn();
    const windowRef = {
      innerWidth: 1320,
      MutationObserver: class {
        constructor(callback) { notify = callback; }
        observe() {}
        disconnect = disconnect;
      },
      requestAnimationFrame(callback) { frames.set(++nextId, callback); return nextId; },
      cancelAnimationFrame(id) { frames.delete(id); },
    };
    const flush = () => { const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(callback => callback()); };
    const transition = () => { inspector.classList.toggle("hidden"); notify(); };
    const stop = observeEmbedInspectorLayout(host, windowRef);
    try {
      transition(); flush(); // Opening and closing both use the real Fit control.
      transition(); flush();
      expect(fit).toHaveBeenCalledTimes(2);
      for (const type of ["pointerdown", "wheel", "keydown"]) {
        transition();
        expect(frames.size).toBe(1);
        host.dispatchEvent(new browser.Event(type, { bubbles: true }));
        expect(frames.size).toBe(0);
        flush();
      }
      stop.scheduleFit();
      windowRef.innerWidth = 700;
      flush();
      expect(fit).toHaveBeenCalledTimes(2);
      transition(); flush(); // Narrow Back to graph fits the newly visible canvas.
      expect(fit).toHaveBeenCalledTimes(3);
      windowRef.innerWidth = 1320;
      transition();
      stop();
      expect(frames.size).toBe(0);
      expect(disconnect).toHaveBeenCalledOnce();
    } finally {
      await browser.close();
    }
  });

  it("keeps ordinary wheel native while preserving explicit zoom and keyboard reading", async () => {
    const browser = new Window();
    browser.document.body.innerHTML = '<div id="host"><div id="graphStage"><span class="graph-hint"></span></div><button id="closeInspector"></button><div class="inspector-content"></div></div>';
    const host=browser.document.querySelector('#host');
    const stage=host.querySelector('#graphStage');
    const zoom=vi.fn(event=>event.preventDefault());
    stage.onwheel=zoom;
    const stop=configureEmbedReading(host);
    try {
      const ordinary=new browser.WheelEvent('wheel',{bubbles:true,cancelable:true,deltaY:100});
      stage.dispatchEvent(ordinary);
      expect(ordinary.defaultPrevented).toBe(false);
      expect(zoom).not.toHaveBeenCalled();
      const pinch = new browser.WheelEvent('wheel',{bubbles:true,cancelable:true,deltaY:100});
      Object.defineProperty(pinch, 'ctrlKey', {value:true}); // happy-dom omits WheelEvent modifier fields.
      stage.dispatchEvent(pinch);
      expect(zoom).toHaveBeenCalledOnce();
      expect(stage.tabIndex).toBe(0);
      expect(host.querySelector('.inspector-content').getAttribute('aria-label')).toBe('Node details content');
      stop();
      stage.dispatchEvent(new browser.WheelEvent('wheel',{bubbles:true,deltaY:100}));
      expect(zoom).toHaveBeenCalledTimes(2);
    } finally { stop(); await browser.close(); }
  });

  it("quantizes a short viewport to complete turn rows", async () => {
    const windowRef = new Window({ url: "https://share.example.test" });
    windowRef.document.body.innerHTML = '<div id="host"><div class="interaction-banner"></div><div class="turn-popover"></div></div>';
    const host = windowRef.document.querySelector("#host");
    const banner = host.querySelector(".interaction-banner");
    banner.getBoundingClientRect = () => ({ bottom: 200 });
    Object.defineProperty(windowRef, "innerHeight", { configurable: true, value: 440 });
    try {
      fitPublicTurnPopover(host, windowRef);
      expect(host.querySelector(".turn-popover").style.maxHeight).toBe("210px");
    } finally {
      await windowRef.close();
    }
  });

  it("keeps the install destination fixed and rejects unsafe asset bases", () => {
    expect(() => renderPublicViewerTemplate({ snapshot: fixtureJsonl(), assetBase: "https://evil.example" })).toThrow();
    expect(() => renderPublicViewerTemplate({ snapshot: fixtureJsonl(), installUrl: "javascript:alert(1)" })).toThrow();
    expect(renderPublicViewerTemplate({
      snapshot: fixtureJsonl(),
      installUrl: `/t/${"a".repeat(32)}/install`,
    })).toContain(`/t/${"a".repeat(32)}/install`);
  });

  it("admits only an explicit embed presentation with a canonical standalone route", () => {
    for (const sharePath of [null, "", "//evil.test/t/id", "https://evil.test", "javascript:alert(1)",
      `/t/${"a".repeat(32)}?node=other`, `/t/${"a".repeat(32)}#later`, `/t/${"a".repeat(32)}/embed`]) {
      expect(() => renderPublicViewerTemplate({ snapshot: fixtureJsonl(), presentation: "embed", sharePath })).toThrow();
    }
    expect(() => renderPublicViewerTemplate({ snapshot: fixtureJsonl(), presentation: "unknown" })).toThrow();
    expect(() => renderPublicViewerTemplate({ snapshot: fixtureJsonl(), theme: "unsafe" })).toThrow();
    const html = renderPublicViewerTemplate({ snapshot: fixtureJsonl(), presentation: "embed", sharePath: `/t/${"a".repeat(32)}` });
    expect(html).toContain("connect-src &#39;none&#39;");
    expect(publicViewerCsp()).toContain("frame-ancestors 'none'");
    expect(html).not.toContain("public-share-download-card");
  });

  it("preserves the complete accepted Unicode title contract", () => {
    const title = "🧭".repeat(120);
    const html = renderPublicViewerTemplate({ snapshot: fixtureJsonl(), title });
    expect(html).toContain(`<title>${title} · Relayer</title>`);
  });

  it("preserves the complete chosen project display name in public metadata", () => {
    const projectName = "界".repeat(256);
    const html = renderPublicViewerTemplate({ snapshot: fixtureJsonl(), description: projectName });
    expect(html).toContain(`property="og:description" content="${projectName}"`);
  });

  it("publishes the CSP contract as a small deterministic value", () => {
    expect(publicViewerCsp()).toContain("connect-src 'none'");
    expect(publicViewerCsp()).toContain("script-src 'self'");
    expect(publicViewerCsp()).toContain("frame-ancestors 'none'");
  });

  it("gives a render failure exclusive ownership of the viewport", async () => {
    const windowRef = new Window({ url: `https://share.example.test/t/${"a".repeat(32)}` });
    windowRef.document.write(renderPublicViewerTemplate({ snapshot: "not-jsonl" }));
    const reload = vi.fn();
    const onRenderError = vi.fn();
    try {
      expect(bootPublicViewer({ documentRef: windowRef.document, windowRef, reload, onRenderError })).toBeNull();
      expect(onRenderError).toHaveBeenCalledOnce();
      expect(windowRef.document.querySelector("#publicViewerHost")?.classList.contains("hidden")).toBe(true);
      expect(windowRef.document.querySelector(".public-share-download-card")?.classList.contains("hidden")).toBe(true);
      expect(windowRef.document.querySelector("#publicShareError")?.classList.contains("hidden")).toBe(false);
      windowRef.document.querySelector("#publicShareReload")?.click();
      expect(reload).toHaveBeenCalledOnce();
    } finally {
      await windowRef.close();
    }
  });

  it.each(["standalone", "embed"])("boots %s ProductWorkspace and navigates accepted history without execution", async (presentation) => {
    const windowRef = new Window({ url: `https://share.example.test/t/${"a".repeat(32)}` });
    const records = invokeFixtureRecords();
    const root = records[1].acceptedView.layers[0];
    root.layer.defaultNodeId = root.nodes[0].id;
    root.layer.nodes.push("node:other");
    root.nodes.push({ id: "node:other", kind: "concept", icon: "box", title: "Other share choice", detail: "", state: "accepted" });
    root.layer.layout.placements.push({ nodeId: "node:other", x: .8, y: .8 });
    root.actions.push({ id: "action:unresolved", sourceNodeId: "node:root", sourceLayerId: "layer:root",
      kind: "invoke", interactionText: "Do new work", label: "Unexecuted action", variant: "pill", state: "accepted" });
    const sharePath = `/t/${"a".repeat(32)}`;
    const page = renderPublicViewerTemplate({ snapshot: recordsJsonl(records), presentation, sharePath, theme: presentation === "embed" ? "light" : "system" });
    windowRef.document.write(page);
    const previous = {
      DOMParser: globalThis.DOMParser,
      document: globalThis.document,
      lucide: globalThis.lucide,
      marked: globalThis.marked,
      window: globalThis.window,
    };
    globalThis.window = windowRef;
    globalThis.document = windowRef.document;
    globalThis.DOMParser = windowRef.DOMParser;
    globalThis.lucide = {
      Circle: {},
      createElement(_icon, attributes) {
        const svg = windowRef.document.createElementNS("http://www.w3.org/2000/svg", "svg");
        for (const [name, value] of Object.entries(attributes)) svg.setAttribute(name, String(value));
        return svg;
      },
    };
    globalThis.marked = { parse: (value) => `<p><a href="HTTPS://example.test/docs">${value}</a></p>` };
    try {
      const originalUrl = windowRef.location.href;
      const onRenderError = vi.fn();
      const viewer = bootPublicViewer({ documentRef: windowRef.document, windowRef, onRenderError });
      expect(onRenderError).not.toHaveBeenCalled();
      expect(viewer).not.toBeNull();
      if (presentation === "embed") expect(windowRef.document.documentElement.dataset.theme).toBe("light");
      expect(viewer.adapter.selection.currentInteractionId).toBe("turn:1");
      expect(windowRef.document.querySelector("#publicViewerHost")?.classList.contains("hidden")).toBe(false);
      const downloadCard = windowRef.document.querySelector(".public-share-download-card");
      if (presentation === "standalone") {
        expect(downloadCard?.parentElement?.classList.contains("thread-header")).toBe(true);
        expect(downloadCard?.textContent).toContain("Get Relayer");
        expect(windowRef.document.querySelector(".public-share-embed-branding")).toBeNull();
      } else {
        expect(downloadCard).toBeNull();
        const link = windowRef.document.querySelector(".public-share-embed-branding a");
        expect(link.getAttribute("href")).toBe(sharePath);
        expect(link.target).toBe("_blank");
        expect(link.rel).toBe("noopener noreferrer");
      }
      expect(windowRef.document.querySelector("#environmentPanel")).toBeNull();
      windowRef.document.querySelector(".graph-node")?.click();
      await vi.waitFor(() => expect(windowRef.document.querySelector('a[href="HTTPS://example.test/docs"]')).toMatchObject({
        target: "_blank",
      }));
      expect(windowRef.document.querySelector('a[href="HTTPS://example.test/docs"]').rel).toBe("noreferrer noopener");
      expect(windowRef.document.querySelector("#nodeInputActions").textContent).toContain("Path A");
      expect(windowRef.document.querySelector("#nodeInputActions").textContent).toContain("Path B");
      expect([...windowRef.document.querySelectorAll("#nodeInputActions button")].every((button) => button.disabled)).toBe(true);
      const unresolved = windowRef.document.querySelector('[data-action-id="action:unresolved"]');
      expect(unresolved.disabled).toBe(true);
      unresolved.click();
      expect(viewer.adapter.selection.currentInteractionId).toBe("turn:1");
      await expect(viewer.adapter.onInvokeAction()).resolves.toBe(false);
      await expect(viewer.adapter.onSubmitInteraction()).resolves.toBe(false);
      const invokeButton = windowRef.document.querySelector('[data-action-id="action:invoke"]');
      expect(invokeButton.disabled).toBe(false);
      invokeButton.click();
      await vi.waitFor(() => expect(viewer.adapter.selection.currentInteractionId).toBe("turn:2"));
      expect(viewer.adapter.state.visibleLayer.layer.id).toBe("layer:child");
      viewer.adapter.selectTurnById("turn:1");
      viewer.render();
      await windowRef.happyDOM.waitUntilComplete();
      windowRef.document.querySelector('[data-action-id="action:expand"]').click();
      await vi.waitFor(() => expect(viewer.adapter.state.visibleLayer.layer.id).toBe("layer:nested"));
      windowRef.document.querySelector('.graph-node').click();
      await windowRef.happyDOM.waitUntilComplete();
      windowRef.document.querySelector('[data-action-id="action:reference"]').click();
      await vi.waitFor(() => expect(viewer.adapter.state.visibleLayer.layer.id).toBe("layer:related"));
      expect(windowRef.location.href).toBe(originalUrl);
      viewer.adapter.selectTurnById("turn:2");
      viewer.adapter.selectTurnById("turn:1");
      viewer.render();
      await windowRef.happyDOM.waitUntilComplete();
      windowRef.document.querySelector('[data-node="node:other"]').click();
      await windowRef.happyDOM.waitUntilComplete();
      expect(viewer.adapter.selection.selectedNodeId).toBe("node:other");
      viewer.dispose();
      windowRef.document.open();
      windowRef.document.write(page);
      const otherShare = bootPublicViewer({ documentRef: windowRef.document, windowRef, onRenderError });
      await windowRef.happyDOM.waitUntilComplete();
      expect(otherShare.adapter.selection.selectedNodeId).toBe(root.layer.defaultNodeId);
      expect(windowRef.localStorage.getItem("relayerLayerSelectionsV1")).toBeNull();
      otherShare.dispose();
    } finally {
      globalThis.DOMParser = previous.DOMParser;
      globalThis.document = previous.document;
      globalThis.lucide = previous.lucide;
      globalThis.marked = previous.marked;
      globalThis.window = previous.window;
      await windowRef.close();
    }
  });
});
