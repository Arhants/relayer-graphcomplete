import { Window } from "happy-dom";
import { afterEach, expect, it, vi } from "vitest";
import { preferredLayerNode, rememberLayerSelection, rememberedLayerSelection } from "../desktop/renderer/src/product-workspace/layer-selection.js";
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
