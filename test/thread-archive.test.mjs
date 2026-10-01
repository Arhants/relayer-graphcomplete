import { afterEach, expect, it, vi } from "vitest";
import { Window } from "happy-dom";

vi.mock("../desktop/renderer/src/graph.js", () => ({ renderThread: vi.fn() }));

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); vi.useRealTimers(); });

it("archives the open chat without navigation, offers Undo, and exposes archived search only in Settings", async () => {
  const browser = new Window({ url: "http://127.0.0.1:43123/" });
  vi.stubGlobal("window", browser); vi.stubGlobal("document", browser.document); vi.stubGlobal("location", browser.location);
  vi.stubGlobal("lucide", { Circle: "Circle", createElement: () => document.createElement("svg") });
  document.body.innerHTML = `<section><div id="chatList"></div></section><section><div id="projectList"></div></section>
    <div id="toast" class="hidden"></div><input id="archivedChatSearch"><div id="archivedChatList"></div>`;
  const { appState, viewState } = await import("../desktop/renderer/src/state.js");
  const { renderSidebar } = await import("../desktop/renderer/src/navigation.js");
  const { bindArchiveActions, loadArchivedChats } = await import("../desktop/renderer/src/thread-archive.js");
  const thread = { id: 1, title: "Saved graph", updatedAt: "1", projectId: 7 };
  appState.projects = [{ id: 7, name: "My project" }]; appState.threads = [thread];
  viewState.currentThreadId = 1; viewState.mainView = "thread";
  let archived = false;
  const fetch = vi.fn(async (path, options) => {
    if (path.endsWith("/archive")) { archived = JSON.parse(options.body).archived; return Response.json({ ...thread, archivedAt: archived ? "2" : null }); }
    return Response.json({ threads: archived ? [{ ...thread, archivedAt: "2" }] : [] });
  });
  vi.stubGlobal("fetch", fetch); bindArchiveActions(); renderSidebar();
  document.querySelector('[data-archive-thread="1"]').click();
  await vi.waitFor(() => expect(document.querySelector('[data-thread="1"]')).toBeNull());
  expect(viewState.mainView).toBe("thread"); expect(viewState.currentThreadId).toBe(1);
  expect(appState.threads[0].archivedAt).toBe("2");
  expect(document.querySelector("#toast button").textContent).toBe("Undo");
  document.querySelector("#toast button").click();
  await vi.waitFor(() => expect(document.querySelector('[data-thread="1"]')).not.toBeNull());
  expect(archived).toBe(false);
  document.querySelector('[data-archive-thread="1"]').click();
  await vi.waitFor(() => expect(archived).toBe(true));
  await loadArchivedChats();
  expect(document.querySelector("#archivedChatList").textContent).toContain("My project");
  expect(document.querySelector("#archivedChatList [data-thread]").textContent).toBe("Open");
  const search = document.querySelector("#archivedChatSearch"); search.value = "missing"; search.dispatchEvent(new browser.Event("input"));
  expect(document.querySelector("#archivedChatList").textContent).toBe("No matching archived chats.");
  search.value = "saved"; search.dispatchEvent(new browser.Event("input"));
  document.querySelector('[data-unarchive-thread="1"]').click();
  await vi.waitFor(() => expect(document.querySelector("#archivedChatList").textContent).toBe("No matching archived chats."));
  expect(document.querySelector('#projectList [data-thread="1"]')).not.toBeNull();
});

it("disables archive for every active state, including backend-only recursive activity", async () => {
  const browser = new Window({ url: "http://127.0.0.1/" });
  vi.stubGlobal("window", browser); vi.stubGlobal("document", browser.document); vi.stubGlobal("location", browser.location);
  const { sidebarArchiveMenu } = await import("../desktop/renderer/src/thread-archive.js");
  for (const state of [{ activity: "running" }, { activity: "stopping" }, { activity: "needs_approval" }, { archiveBlocked: true }]) {
    document.body.innerHTML = sidebarArchiveMenu({ id: 1, title: "Busy", ...state });
    expect(document.querySelector("button").disabled).toBe(true);
    expect(document.querySelector("button").title).toBe("Available when work finishes.");
  }
  document.body.innerHTML = sidebarArchiveMenu({ id: 1, title: 'Failed chat', activity: "failed" });
  expect(document.querySelector("button").disabled).toBe(false);
  expect(document.querySelector("summary").getAttribute("aria-label")).toBe("Chat menu for Failed chat");
});

it("restores only archived interactive navigation and preserves preview/read-only reads", async () => {
  const browser = new Window({ url: "http://127.0.0.1/?review=1" });
  vi.stubGlobal("window", browser); vi.stubGlobal("document", browser.document); vi.stubGlobal("location", browser.location);
  const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
  const { restoreArchivedForNavigation } = await import("../desktop/renderer/src/thread-archive.js");
  const archived = { id: 1, archivedAt: "1" };
  expect(await restoreArchivedForNavigation(archived)).toBe(archived);
  const { query } = await import("../desktop/renderer/src/state.js"); query.delete("review");
  const normal = { id: 2, archivedAt: null };
  expect(await restoreArchivedForNavigation(normal)).toBe(normal);
  expect(fetch).not.toHaveBeenCalled();
  fetch.mockResolvedValue(Response.json({ id: 1, archivedAt: null }));
  expect(await restoreArchivedForNavigation(archived)).toEqual({ id: 1, archivedAt: null });
  expect(fetch).toHaveBeenCalledOnce();
});
