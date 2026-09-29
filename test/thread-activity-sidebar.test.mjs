import { afterEach, expect, it, vi } from "vitest";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.resetModules();
});

// PRD §8.1: a thread shows a symbol only while it runs, stops, waits for approval or has failed.
it("marks live and failed threads in the thread list and refreshes background state while any is live", async () => {
  const { Window } = await import("happy-dom");
  const browser = new Window({ url: "http://127.0.0.1:43123/" });
  vi.stubGlobal("window", browser);
  vi.stubGlobal("document", browser.document);
  vi.stubGlobal("location", browser.location);
  vi.stubGlobal("lucide", {
    Circle: "Circle", LoaderCircle: "LoaderCircle", Square: "Square", Hand: "Hand", OctagonX: "OctagonX",
    createElement: (name) => {
      const icon = browser.document.createElement("svg");
      icon.setAttribute("data-glyph", name);
      return icon;
    },
  });
  let listed = { threads: [{ id: 1, title: "Build", activity: "running" }] };
  const fetch = vi.fn(async () => new Response(JSON.stringify(listed), { status: 200, headers: { "Content-Type": "application/json" } }));
  vi.stubGlobal("fetch", fetch);
  vi.useFakeTimers();
  document.body.innerHTML = `<div class="sidebar-title"><strong>Relayer</strong></div><button id="newThread"></button>
    <section class="side-section"><div class="section-label"></div><div id="chatList"></div></section>
    <section class="side-section"><div class="section-label"></div><div id="projectList"></div></section><button id="settingsButton"></button>`;
  const { renderSidebar } = await import("../desktop/renderer/src/navigation.js");
  const { appState, viewState } = await import("../desktop/renderer/src/state.js");
  viewState.evalContext = null;
  appState.projects = [{ id: 7, name: "Project" }];
  appState.threads = [
    { id: 1, title: "Build", activity: "running" },
    { id: 2, title: "Deploy", activity: "stopping" },
    { id: 3, title: "Review", activity: "needs_approval" },
    { id: 4, title: "Migrate", activity: "failed", projectId: 7 },
    { id: 5, title: "Notes" },
  ];
  renderSidebar();
  const row = (id) => document.querySelector(`[data-thread="${id}"]`);
  const glyph = (id) => row(id).querySelector(".thread-activity svg")?.dataset.glyph ?? null;
  expect([1, 2, 3, 4, 5].map(glyph)).toEqual(["LoaderCircle", "Square", "Hand", "OctagonX", null]);
  expect(row(3).getAttribute("aria-label")).toBe("Review, Needs approval");
  expect(row(4).getAttribute("title")).toBe("Migrate · Failed");
  expect(row(5).getAttribute("aria-label")).toBe("Notes");
  expect(row(5).dataset.activity).toBeUndefined();
  expect(row(5).querySelector(".thread-activity").textContent).toBe("");

  // A background thread finishes: the next poll clears its symbol and polling stops once nothing is live.
  listed = { threads: [{ id: 1, title: "Build" }, { id: 2, title: "Deploy", activity: "stopping" }, { id: 3, title: "Review", activity: "needs_approval" }, { id: 4, title: "Migrate", activity: "failed" }, { id: 5, title: "Notes" }] };
  await vi.advanceTimersByTimeAsync(2000);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(glyph(1)).toBeNull();
  listed = { threads: [{ id: 1, title: "Build" }, { id: 2, title: "Deploy" }, { id: 3, title: "Review" }, { id: 4, title: "Migrate", activity: "failed" }, { id: 5, title: "Notes" }] };
  await vi.advanceTimersByTimeAsync(2000);
  expect([1, 2, 3, 4].map(glyph)).toEqual([null, null, null, "OctagonX"]);
  await vi.advanceTimersByTimeAsync(10000);
  expect(fetch).toHaveBeenCalledTimes(2);
  browser.happyDOM.abort();
});
