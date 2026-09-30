import { readFile } from "node:fs/promises";
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
  const style = document.createElement("style");
  style.textContent = await readFile(new URL("../desktop/renderer/styles.css", import.meta.url), "utf8");
  document.head.append(style);
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
    thread = { ...thread, icon: "database", activity: "failed" };
    state.interactions = [{ id: 1, threadId: 801, sequence: 1, text: "Inspect", completionStatus: "failed", contexts: [] }];
    render();
    expect(document.querySelector('[data-thread="802"] [data-relayer-icon="database"]')).not.toBeNull();
    expect(document.querySelector('[data-thread="801"] .thread-topic-icon').innerHTML).toBe(document.querySelector("#threadIcon").innerHTML);
    expect(document.querySelector('[data-thread="801"] .thread-activity svg')).not.toBeNull();
    expect(document.querySelector('[data-thread="801"]').getAttribute("aria-label")).toContain("Failed");
    expect(document.querySelector("#threadStatusSymbol").getAttribute("aria-label")).toBe("Failed");
    expect(document.querySelector("#threadIcon svg").getAttribute("aria-hidden")).toBe("true");
    thread = JSON.parse(JSON.stringify({ ...thread, title: "Renamed topic", activity: undefined }));
    state.interactions = []; render();
    expect(document.querySelector("#threadStatusSymbol").classList.contains("hidden")).toBe(true);
    let idleRow = document.querySelector('[data-thread="801"]');
    expect(browser.getComputedStyle(idleRow.querySelector(".thread-activity")).display).toBe("none");
    document.body.classList.add("sidebar-collapsed");
    renderSidebar(); idleRow = document.querySelector('[data-thread="801"]');
    expect(idleRow.querySelector('[data-relayer-icon="database"]')).not.toBeNull();
    expect(browser.getComputedStyle(idleRow.querySelector(".thread-activity")).display).toBe("grid");
    // The permanent 16px topic and secondary 12px neutral mark fit the 38px rail content.
    expect(browser.getComputedStyle(idleRow).gap).toBe("4px");
    expect(browser.getComputedStyle(idleRow).paddingLeft).toBe("0px");
    const neutralRule = [...style.sheet.cssRules].find((rule) => rule.selectorText === 'body.sidebar-collapsed .entry:not([data-activity]) .thread-activity::before');
    expect(neutralRule.style.width).toBe("6px");
    expect(neutralRule.style.borderRadius).toBe("50%");
    document.body.classList.remove("sidebar-collapsed");
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
