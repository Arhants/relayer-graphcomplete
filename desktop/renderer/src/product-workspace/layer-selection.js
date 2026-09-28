const STORAGE_KEY = "relayerLayerSelectionsV1";
const MAX_SELECTIONS = 512;
const memories = new WeakMap();
const fallback = new Map();
const hydrated = new WeakSet();
const desktopHydration = new WeakMap();
const desktopWrites = new WeakMap();

function desktopWriteMemory(owner) {
  if (!desktopWrites.has(owner)) desktopWrites.set(owner, new Map());
  return desktopWrites.get(owner);
}

/** Hydrate before opening a desktop thread; desktop settings survive port changes. */
export async function initializeLayerSelections(owner = globalThis.window) {
  const bridge = owner === globalThis.window ? owner?.relayerDesktop?.layerSelections : null;
  if (!bridge) return;
  if (!desktopHydration.has(owner)) {
    desktopHydration.set(owner, (async () => {
      readSelections(owner);
      const memory = selectionMemory(owner);
      const before = new Map(memory);
      try {
        const entries = await bridge.read();
        if (!Array.isArray(entries)) return;
        for (const [location, nodeId] of entries) {
          // A selection made while reading settings is newer than the saved value.
          if (memory.get(location) === before.get(location)) memory.set(location, nodeId);
          const writes = desktopWriteMemory(owner);
          if (!writes.has(location)) writes.set(location, { nodeId });
        }
        while (memory.size > MAX_SELECTIONS) memory.delete(memory.keys().next().value);
      } catch { /* Keep browser/session memory if desktop persistence is unavailable. */ }
    })());
  }
  await desktopHydration.get(owner);
}

function selectionMemory(owner) {
  if (!owner || typeof owner !== "object") return fallback;
  if (!memories.has(owner)) memories.set(owner, new Map());
  return memories.get(owner);
}

function key(threadId, interactionId, layerId) {
  if ([threadId, interactionId, layerId].some((id) => id == null)) return null;
  return JSON.stringify([threadId, interactionId, layerId].map(String));
}

function storage(owner) {
  try { return owner === globalThis.window ? owner?.localStorage : null; } catch { return null; }
}

function readSelections(owner) {
  const memory = selectionMemory(owner);
  if (hydrated.has(memory)) return;
  hydrated.add(memory);
  try {
    const entries = JSON.parse(storage(owner)?.getItem(STORAGE_KEY) ?? "null");
    if (Array.isArray(entries)) {
      for (const entry of entries.slice(-MAX_SELECTIONS)) {
        if (Array.isArray(entry) && entry.length === 2 && entry.every((value) => typeof value === "string")) {
          memory.set(entry[0], entry[1]);
        }
      }
    }
  } catch { /* Presentation storage is best effort. */ }
}

export function rememberedLayerSelection(threadId, interactionId, layerId, owner = globalThis.window) {
  readSelections(owner);
  const memory = selectionMemory(owner);
  return memory.get(key(threadId, interactionId, layerId)) ?? null;
}

export function rememberLayerSelection(threadId, interactionId, layerId, nodeId, owner = globalThis.window) {
  const location = key(threadId, interactionId, layerId);
  if (location == null || nodeId == null) return;
  readSelections(owner);
  const memory = selectionMemory(owner);
  const unchanged = memory.get(location) === String(nodeId);
  memory.delete(location);
  memory.set(location, String(nodeId));
  while (memory.size > MAX_SELECTIONS) memory.delete(memory.keys().next().value);
  const bridge = owner === globalThis.window ? owner?.relayerDesktop?.layerSelections : null;
  if (bridge) {
    const writes = desktopWriteMemory(owner);
    if (writes.get(location)?.nodeId !== String(nodeId)) {
      const entry = { nodeId: String(nodeId) };
      writes.delete(location);
      writes.set(location, entry);
      while (writes.size > MAX_SELECTIONS) writes.delete(writes.keys().next().value);
      const failed = () => { if (writes.get(location) === entry) writes.delete(location); };
      try { Promise.resolve(bridge.remember(location, entry.nodeId)).catch(failed); } catch { failed(); }
    }
  }
  if (!unchanged) {
    try { storage(owner)?.setItem(STORAGE_KEY, JSON.stringify([...memory])); } catch { /* Keep the in-memory selection. */ }
  }
}

/** Resolve IDs against canonical membership, never the resolved-node array order. */
export function preferredLayerNode(resolved, selectedNodeId = null, rememberedNodeId = null) {
  const nodes = resolved?.nodes ?? [];
  const members = resolved?.layer?.nodes ?? nodes.map((node) => node.id);
  for (const candidate of [selectedNodeId, rememberedNodeId, resolved?.layer?.defaultNodeId, ...members]) {
    if (candidate == null || !members.some((id) => String(id) === String(candidate))) continue;
    const node = nodes.find((node) => String(node.id) === String(candidate));
    if (node) return candidate;
  }
  return null;
}
