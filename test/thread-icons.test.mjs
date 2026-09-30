import { Window } from "happy-dom";
import { afterEach, expect, it, vi } from "vitest";
import * as lucide from "lucide";
import { createProductWorkspace } from "../desktop/renderer/src/product-workspace/workspace.js";

afterEach(() => vi.unstubAllGlobals());
it("renders saved topic metadata in Chats, project threads and the workspace across default, acceptance and reopen; Eval keeps ordinals", async () => {
  const browser = new Window({ url: "http://127.0.0.1:3000" });
  vi.stubGlobal("window", browser); vi.stubGlobal("document", browser.document); vi.stubGlobal("location", browser.location); vi.stubGlobal("lucide", lucide);
  document.body.innerHTML = `<div class="sidebar-title"><strong>Relayer</strong></div><button id="newThread"></button>
    <section class="side-section"><div class="section-label"></div><div id="chatList"></div></section>
    <section class="side-section"><div class="section-label"></div><div id="projectList"></div></section><button id="settingsButton"></button><section id="threadView"></section>`;
  const { appState, viewState } = await import("../desktop/renderer/src/state.js");
  const { renderSidebar } = await import("../desktop/renderer/src/navigation.js");
  const previous = { threads: appState.threads, projects: appState.projects, evalContext: viewState.evalContext };
  let thread = { id: 801, title: 'Plan "database"', harnessId: "fixture", icon: null };
  const state = { interactions: [], projects: [], permissionProfiles: [], modelSettings: { defaults: { harnessId: "fixture" }, harnesses: [{ id: "fixture", available: true }], providers: [], families: [] }, modelCatalog: [], nodes: [], actions: [], actionInvocations: [], pendingActionInvocations: [] };
  const workspace = createProductWorkspace({ root: document, getState: () => state, getThread: () => thread, selection: { currentThreadId: 801, currentInteractionId: null, selectedNodeId: null, layerPath: [] }, showThread() {}, showEmpty() {} });
  function render() { appState.threads = [thread, { id: 802, title: "Project topic", projectId: 1, icon: "database" }, { id: 803, title: "Legacy" }, { id: 804, title: "Invalid selection", icon: '<script>bad</script>' }]; appState.projects = [{ id: 1, name: "Repository" }]; renderSidebar(); workspace.render(); }
  try {
    viewState.evalContext = null;
    render();
    expect(document.querySelector('[data-thread="801"] .entry-icon').textContent).toBe("◌");
    expect(document.querySelector("#threadIcon").textContent).toBe("◌");
    expect(document.querySelector('[data-thread="803"] .entry-icon').textContent).toBe("◌");
    expect(document.querySelector('[data-thread="804"] .entry-icon').textContent).toBe("◌");
    expect(document.querySelector('[data-thread="804"] script')).toBeNull();
    thread = { ...thread, icon: "database" }; render();
    expect(document.querySelector('[data-thread="802"] [data-relayer-icon="database"]')).not.toBeNull();
    expect(document.querySelector('[data-thread="801"] .entry-icon').innerHTML).toBe(document.querySelector("#threadIcon").innerHTML);
    expect(document.querySelector("#threadIcon svg").getAttribute("aria-hidden")).toBe("true");
    thread = JSON.parse(JSON.stringify({ ...thread, title: "Renamed topic" })); render();
    expect(document.querySelector("#threadTitle").textContent).toBe("Renamed topic");
    expect(document.querySelector('#threadIcon [data-relayer-icon="database"]')).not.toBeNull();
    viewState.evalContext = { harnessConfigurationName: "fixture", cases: [{ name: "Case", status: "passed", threads: [{ id: 801, name: "Eval", icon: "database" }] }] }; renderSidebar();
    expect(document.querySelector('[data-thread="801"] .entry-icon').textContent).toBe("1");
    expect(document.querySelector('[data-thread="801"] svg')).toBeNull();
  } finally {
    appState.threads = previous.threads; appState.projects = previous.projects; viewState.evalContext = previous.evalContext;
    workspace.dispose(); await browser.happyDOM.close();
  }
});
