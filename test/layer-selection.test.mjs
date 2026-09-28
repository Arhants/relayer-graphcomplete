import { Window } from "happy-dom";
import { afterEach, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSettingsStore } from "../desktop/main/services/settings-store.mjs";
import { registerLayerSelectionIpc } from "../desktop/main/ipc/register-ipc.mjs";
import { initializeLayerSelections, preferredLayerNode, rememberLayerSelection, rememberedLayerSelection } from "../desktop/renderer/src/product-workspace/layer-selection.js";
afterEach(() => vi.unstubAllGlobals());
it("recovers presentation memory after a new window and ignores stale membership", () => {
  const first = new Window({ url: "http://localhost" });
  vi.stubGlobal("window", first);
  rememberLayerSelection(10, 20, 30, 2);
  const persisted = first.localStorage.getItem("relayerLayerSelectionsV1");
  const reopened = new Window({ url: "http://localhost" });
  reopened.localStorage.setItem("relayerLayerSelectionsV1", persisted);
  vi.stubGlobal("window", reopened);
  const remembered = rememberedLayerSelection(10, 20, 30);
  const layer = { layer: { nodes: [1, 2], defaultNodeId: 1 }, nodes: [{ id: 2 }, { id: 1 }] };
  expect(String(preferredLayerNode(layer, null, remembered))).toBe("2");
  expect(preferredLayerNode(layer, 1, remembered)).toBe(1);
  expect(rememberedLayerSelection(11, 20, 30)).toBeNull();
  expect(preferredLayerNode({ ...layer, layer: { nodes: [1] } }, null, remembered)).toBe(1);
  expect(preferredLayerNode({ ...layer, layer: { nodes: [1, 2] } })).toBe(1);
  expect(preferredLayerNode({ layer: { nodes: [] }, nodes: [] })).toBeNull();
});

it("keeps the current choice when persistence fails instead of restoring stale disk data", () => {
  const saved = JSON.stringify([[JSON.stringify(["10", "20", "30"]), "1"]]);
  vi.stubGlobal("window", { localStorage: { getItem: () => saved, setItem: () => { throw new Error("quota"); } } });
  rememberLayerSelection(10, 20, 30, 2);
  expect(rememberedLayerSelection(10, 20, 30)).toBe("2");
});

it("isolates portable IDs between public viewer instances without browser persistence", () => {
  const windowRef = new Window({ url: "https://share.example.test" });
  vi.stubGlobal("window", windowRef);
  const shareA = {}; const shareB = {};
  rememberLayerSelection("conversation:1", "turn:1", "layer:1", "node:2", shareA);
  expect(rememberedLayerSelection("conversation:1", "turn:1", "layer:1", shareA)).toBe("node:2");
  expect(rememberedLayerSelection("conversation:1", "turn:1", "layer:1", shareB)).toBeNull();
  expect(windowRef.localStorage.getItem("relayerLayerSelectionsV1")).toBeNull();
});

it("deduplicates reconciliation writes while migrating browser choices and retrying failed writes", async () => {
  const windowRef = new Window({ url: "http://localhost:4001" });
  windowRef.localStorage.setItem("relayerLayerSelectionsV1", JSON.stringify([['["10","20","30"]', "2"]]));
  const remember = vi.fn().mockRejectedValueOnce(new Error("unavailable")).mockResolvedValue(undefined);
  windowRef.relayerDesktop = { layerSelections: { read: async () => [], remember } };
  vi.stubGlobal("window", windowRef);
  await initializeLayerSelections();
  rememberLayerSelection(10, 20, 30, 2);
  rememberLayerSelection(10, 20, 30, 2);
  expect(remember).toHaveBeenCalledTimes(1);
  await Promise.resolve();
  rememberLayerSelection(10, 20, 30, 2);
  await Promise.resolve();
  rememberLayerSelection(10, 20, 30, 2);
  expect(remember).toHaveBeenCalledTimes(2);
  rememberLayerSelection(10, 20, 30, 1);
  expect(remember).toHaveBeenCalledTimes(3);
});

it("restores desktop selections through production settings IPC after the origin changes", async () => {
  const directory = await mkdtemp(join(tmpdir(), "relayer-selections-"));
  const open = async (port) => {
    const handlers = new Map();
    const settings = createSettingsStore(directory);
    registerLayerSelectionIpc({ ipcMain: { handle: (name, fn) => handlers.set(name, fn) }, settings });
    const windowRef = new Window({ url: `http://127.0.0.1:${port}` });
    windowRef.relayerDesktop = { layerSelections: {
      read: () => handlers.get("relayer:layer-selections-read")(),
      remember: (key, nodeId) => handlers.get("relayer:layer-selections-remember")(null, { key, nodeId }),
    } };
    vi.stubGlobal("window", windowRef);
    await initializeLayerSelections();
    return { settings, bridge: windowRef.relayerDesktop.layerSelections };
  };
  try {
    const first = await open(41001);
    await first.settings.update((current) => ({ ...current, appearance: "light" }));
    rememberLayerSelection(10, 20, 30, 2);
    await first.settings.flush();
    const reopened = await open(41002);
    expect(window.localStorage.getItem("relayerLayerSelectionsV1")).toBeNull();
    expect(rememberedLayerSelection(10, 20, 30)).toBe("2");
    expect(rememberedLayerSelection(11, 20, 30)).toBeNull();
    await expect(reopened.bridge.remember('["10","20","30"]', "bad")).rejects.toThrow("Invalid layer selection");
    await Promise.all(Array.from({ length: 513 }, (_, id) => reopened.bridge.remember(JSON.stringify(["10", "20", String(id + 1)]), "3")));
    const saved = await reopened.settings.read();
    expect(saved.appearance).toBe("light");
    expect(saved.layerSelections).toHaveLength(512);
    expect(saved.layerSelections[0][0]).toBe('["10","20","2"]');
  } finally { await rm(directory, { recursive: true, force: true }); }
});
