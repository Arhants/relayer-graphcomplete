globalThis.lucide = new Proxy({ Circle: {}, createElement: () => document.createElementNS("http://www.w3.org/2000/svg", "svg") }, { get: (target, key) => target[key] ?? {} });
document.body.classList.remove("desktop-account-pending");
document.querySelector("#appShell").classList.remove("hidden");
for (const view of document.querySelector(".main-area").children) view.classList.toggle("hidden", view.id !== "threadView");
document.body.classList.add("sidebar-collapsed");
const { createProductWorkspace } = await import("/desktop/renderer/src/product-workspace/workspace.js");
const node = { id: 1, kind: "concept", icon: "box", title: "Rayleigh scattering", detail: "Shorter wavelengths scatter more strongly." };
const layer = { layer: { id: 91, nodes: [1], defaultNodeId: 1 }, nodes: [node], edges: [], actions: [] };
const turns = [
  { id: 5, graphNodeId: 50, threadId: 801, text: "Why is the sky blue?", completionStatus: "accepted", contexts: [], completionOutput: { rootLayer: layer }, interactionGraph: { enabled: true, complete: true, sources: [] } },
  { id: 6, graphNodeId: 60, threadId: 801, text: "Explain Rayleigh scattering", completionStatus: "accepted", contexts: [], completionOutput: { rootLayer: layer }, interactionGraph: { enabled: true, complete: true, sources: [{ interactionId: 5, threadId: 801, layers: [{ layerId: 91, nodeIds: [1] }] }] } },
];
const state = { status: "accepted", currentInteractionId: 5, interactions: turns, visibleLayer: layer, nodes: [node], actions: [], projects: [], permissionProfiles: [], modelSettings: { defaults: { harnessId: "fixture" }, harnesses: [{ id: "fixture", available: true }], providers: [], families: [] }, modelCatalog: [], actionInvocations: [], pendingActionInvocations: [] };
const selection = { currentThreadId: 801, currentInteractionId: 5, selectedNodeId: 1, layerPath: [] };
globalThis.layoutFixture = { state, selection, turns };
globalThis.layoutWorkspace = createProductWorkspace({ root: document, getState: () => state, getThread: () => ({ id: 801, title: "Sky", harnessId: "fixture" }), selection, onSelectTurnById(id) { selection.currentInteractionId = Number(id); state.currentInteractionId = Number(id); layoutWorkspace.render(); }, showThread() {}, showEmpty() {} });
layoutWorkspace.render();
document.querySelector("#collapseSidebar").onclick = () => document.body.classList.toggle("sidebar-collapsed");
