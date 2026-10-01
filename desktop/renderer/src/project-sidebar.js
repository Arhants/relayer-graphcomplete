// Presentation preference keyed by the surviving product project identity.
const STORAGE_KEY = "relayerCollapsedProjectsV1";
let collapsed = new Set();
let writes = Promise.resolve();
function validIds(value, desktop = false) {
  return Array.isArray(value) && value.every((id) => typeof id === "string" && (desktop ? /^[1-9]\d*$/.test(id) : id.length > 0));
}
export async function initializeProjectSidebar() {
  collapsed = new Set();
  const bridge = window.relayerDesktop?.projectSidebar;
  try {
    const saved = bridge ? await bridge.read() : JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]");
    if (validIds(saved, Boolean(bridge))) collapsed = new Set(saved);
  } catch { /* Unavailable preference storage leaves projects expanded. */ }
}
export function projectCollapsed(id) { return collapsed.has(String(id)); }
export function setProjectCollapsed(id, value) {
  if (value) collapsed.add(String(id));
  else collapsed.delete(String(id));
  const ids = [...collapsed];
  const bridge = window.relayerDesktop?.projectSidebar;
  if (bridge) writes = writes.catch(() => {}).then(() => bridge.set(ids)).catch(() => {});
  else try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ids)); } catch { /* Best effort. */ }
}
export function expandThreadProject(thread) {
  const id = thread?.groupedProjectId ?? thread?.projectId;
  if (id != null) setProjectCollapsed(id, false);
}
export function projectActivity(threads) {
  return ["needs_approval", "failed", "stopping", "running"].find((state) => threads.some((thread) => thread.activity === state));
}
