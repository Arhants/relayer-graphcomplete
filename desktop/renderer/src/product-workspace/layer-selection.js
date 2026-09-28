const STORAGE_KEY = "relayerLayerSelectionsV1";
const MAX_SELECTIONS = 512;
const memories = new WeakMap();
const fallback = new Map();
const hydrated = new WeakSet();

function selectionMemory() {
  const owner = globalThis.window;
  if (!owner || typeof owner !== "object") return fallback;
  if (!memories.has(owner)) memories.set(owner, new Map());
  return memories.get(owner);
}

function key(threadId, interactionId, layerId) {
  if ([threadId, interactionId, layerId].some((id) => id == null)) return null;
  return JSON.stringify([threadId, interactionId, layerId].map(String));
}

function storage() {
  try { return globalThis.window?.localStorage; } catch { return null; }
}

function readSelections() {
  const memory = selectionMemory();
  if (hydrated.has(memory)) return;
  hydrated.add(memory);
  try {
    const entries = JSON.parse(storage()?.getItem(STORAGE_KEY) ?? "null");
    if (Array.isArray(entries)) {
      for (const entry of entries.slice(-MAX_SELECTIONS)) {
        if (Array.isArray(entry) && entry.length === 2 && entry.every((value) => typeof value === "string")) {
          memory.set(entry[0], entry[1]);
        }
      }
    }
  } catch { /* Presentation storage is best effort. */ }
}

export function rememberedLayerSelection(threadId, interactionId, layerId) {
  readSelections();
  const memory = selectionMemory();
  return memory.get(key(threadId, interactionId, layerId)) ?? null;
}

export function rememberLayerSelection(threadId, interactionId, layerId, nodeId) {
  const location = key(threadId, interactionId, layerId);
  if (location == null || nodeId == null) return;
  readSelections();
  const memory = selectionMemory();
  memory.delete(location);
  memory.set(location, String(nodeId));
  while (memory.size > MAX_SELECTIONS) memory.delete(memory.keys().next().value);
  try { storage()?.setItem(STORAGE_KEY, JSON.stringify([...memory])); } catch { /* Keep the in-memory selection. */ }
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
