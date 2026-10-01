import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSettingsStore } from "../desktop/main/services/settings-store.mjs";
import { registerProjectSidebarIpc } from "../desktop/main/ipc/register-ipc.mjs";
import { afterEach, expect, it, vi } from "vitest";
import { Window } from "happy-dom";

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.resetModules(); });

it("toggles real project headers independently of the active chat, preserves preference on reload, and expands rail navigation", async () => {
  const browser = new Window({ url: "http://127.0.0.1:43123/" });
  vi.stubGlobal("location", browser.location); vi.useFakeTimers();
  vi.stubGlobal("window", browser); vi.stubGlobal("document", browser.document);
  vi.stubGlobal("lucide", { createElement: (name) => {
    const svg = document.createElement("svg"); svg.dataset.glyph = name; return svg;
  }, Circle: "Circle", Hand: "Hand", LoaderCircle: "LoaderCircle", OctagonX: "OctagonX" });
  let saved = [];
  browser.relayerDesktop = { projectSidebar: { read: async () => saved, set: async (ids) => { saved = ids; } } };
  document.body.innerHTML = '<button id="collapseSidebar"></button><div id="chatList"></div><div id="projectList"></div>';
  document.querySelector('#collapseSidebar').onclick = () => document.body.classList.toggle('sidebar-collapsed');
  const preference = await import('../desktop/renderer/src/project-sidebar.js');
  await preference.initializeProjectSidebar();
  const { appState, viewState } = await import('../desktop/renderer/src/state.js');
  const { renderSidebar } = await import('../desktop/renderer/src/navigation.js');
  viewState.evalContext = null; viewState.currentThreadId = 1;
  appState.projects = [{ id: 7, name: 'Project' }, { id: 9, name: 'Empty' }];
  appState.threads = [{ id: 1, projectId: 8, groupedProjectId: 7, title: 'Active' }, { id: 2, projectId: 7, title: 'Running', activity: 'running' }, { id: 3, projectId: 7, title: 'Approval', activity: 'needs_approval' }];
  renderSidebar();
  const header = () => document.querySelector('[data-project-toggle="7"]');
  expect(header().getAttribute('aria-expanded')).toBe('true');
  expect(document.querySelector('[data-project-toggle="9"] .project-chevron')).toBeNull();
  const composer = document.querySelector('[data-project-new-thread="7"]');
  composer.click(); expect(header().getAttribute('aria-expanded')).toBe('true');
  header().click();
  expect(document.activeElement).toBe(header());
  expect(viewState.currentThreadId).toBe(1);
  expect(document.querySelector('#project-threads-7').classList.contains('hidden')).toBe(true);
  expect(header().getAttribute('aria-expanded')).toBe('false');
  expect(header().getAttribute('aria-label')).toBe('Project, Needs approval');
  await Promise.resolve(); await Promise.resolve(); await preference.initializeProjectSidebar(); renderSidebar();
  expect(header().getAttribute('aria-expanded')).toBe('false');
  appState.threads[2].activity = 'failed'; renderSidebar();
  expect(header().getAttribute('aria-label')).toBe('Project, Failed');
  expect(header().getAttribute('aria-expanded')).toBe('false');
  preference.expandThreadProject(appState.threads[0]); renderSidebar();
  expect(header().getAttribute('aria-expanded')).toBe('true');
  header().click(); document.body.classList.add('sidebar-collapsed'); header().click();
  expect(document.body.classList.contains('sidebar-collapsed')).toBe(false);
  expect(header().getAttribute('aria-expanded')).toBe('true');
  // Consolidation reads only the surviving identity: its existing preference wins.
  preference.setProjectCollapsed(7, true);
  preference.setProjectCollapsed(8, false);
  renderSidebar();
  expect(header().getAttribute('aria-expanded')).toBe('false');
  expect(document.querySelector('#project-threads-7 [data-thread="1"]')).not.toBeNull();
  // A survivor with no preference does not inherit a retired project's collapse.
  preference.setProjectCollapsed(7, false);
  preference.setProjectCollapsed(8, true);
  renderSidebar();
  expect(header().getAttribute('aria-expanded')).toBe('true');
  browser.happyDOM.abort();
});


it("restores project preferences through production settings IPC after a changed-origin restart", async () => {
  const directory = await mkdtemp(join(tmpdir(), "relayer-project-sidebar-"));
  const open = async (port) => {
    const settings = createSettingsStore(directory);
    const handlers = new Map();
    registerProjectSidebarIpc({ ipcMain: { handle: (name, handler) => handlers.set(name, handler) }, settings });
    const owner = new Window({ url: `http://127.0.0.1:${port}` });
    vi.stubGlobal("window", owner);
    const pending = [];
    owner.relayerDesktop = { projectSidebar: {
      read: () => handlers.get("relayer:project-sidebar-read")(),
      set: (ids) => { const write = handlers.get("relayer:project-sidebar-set")(null, ids); pending.push(write); return write; },
    } };
    const preference = await import("../desktop/renderer/src/project-sidebar.js");
    await preference.initializeProjectSidebar();
    return { owner, settings, handlers, pending, preference };
  };
  try {
    const first = await open(41001);
    await first.settings.update((current) => ({ ...current, appearance: "light" }));
    first.preference.setProjectCollapsed(7, true);
    await Promise.resolve(); await Promise.all(first.pending); await first.settings.flush();
    const reopened = await open(41002);
    expect(reopened.owner.localStorage.getItem("relayerCollapsedProjectsV1")).toBeNull();
    expect(reopened.preference.projectCollapsed(7)).toBe(true);
    expect(reopened.preference.projectCollapsed(8)).toBe(false);
    expect((await reopened.settings.read()).appearance).toBe("light");
    await expect(reopened.handlers.get("relayer:project-sidebar-set")(null, ["0"])).rejects.toThrow();
  } finally { await rm(directory, { recursive: true, force: true }); }
});


it("remembers stable demo project IDs in origin-local storage", async () => {
  const owner = new Window({ url: "http://localhost:43123" });
  vi.stubGlobal("window", owner);
  const preference = await import("../desktop/renderer/src/project-sidebar.js");
  await preference.initializeProjectSidebar();
  const id = "a0ea85ae-6b32-4fb0-a519-baa10b53eaa2";
  preference.setProjectCollapsed(id, true);
  await preference.initializeProjectSidebar();
  expect(preference.projectCollapsed(id)).toBe(true);
  expect(preference.projectCollapsed("new-project")).toBe(false);
});
