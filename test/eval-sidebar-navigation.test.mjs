import { afterEach, describe, expect, it } from "vitest";

const globalNames = ["document", "location", "window"];
const originalGlobals = new Map(
  globalNames.map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]),
);

afterEach(() => {
  for (const [name, descriptor] of originalGlobals) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else delete globalThis[name];
  }
});

describe("Eval review sidebar", () => {
  it("keeps the complete named thread list visible across rerenders", async () => {
    const classList = () => {
      const values = new Set();
      return {
        add: (...names) => names.forEach((name) => values.add(name)),
        remove: (...names) => names.forEach((name) => values.delete(name)),
        contains: (name) => values.has(name),
      };
    };
    const chatLabel = { textContent: "Chats" };
    const projectLabel = { textContent: "Projects" };
    const chatSection = {
      classList: classList(),
      querySelector: (selector) => selector === ".section-label" ? chatLabel : null,
    };
    const projectSection = { classList: classList() };
    const injectedCaseLabel = { closest: () => chatSection };
    let caseLabelsInjected = false;
    const chatList = {
      value: "",
      closest: () => chatSection,
      get innerHTML() { return this.value; },
      set innerHTML(value) {
        this.value = value;
        caseLabelsInjected = true;
      },
    };
    const elements = new Map([
      [".sidebar-title strong", { textContent: "Relayer" }],
      ["#newThread", { classList: classList() }],
      ["#chatList", chatList],
      ["#projectList", { closest: () => projectSection }],
      ["#settingsButton", { classList: classList() }],
    ]);
    Object.assign(globalThis, {
      location: new URL("http://127.0.0.1:43123/?review=1"),
      window: { relayerDesktop: undefined, relayerEvalReview: undefined },
      document: {
        querySelector: (selector) => elements.get(selector) || null,
        querySelectorAll: (selector) => selector === ".section-label"
          ? caseLabelsInjected
            ? [chatLabel, injectedCaseLabel, projectLabel]
            : [chatLabel, projectLabel]
          : [],
        createElement: () => ({
          innerHTML: "",
          set textContent(value) {
            this.innerHTML = String(value)
              .replaceAll("&", "&amp;")
              .replaceAll("<", "&lt;")
              .replaceAll(">", "&gt;");
          },
        }),
      },
    });

    const { renderSidebar } = await import("../desktop/renderer/src/navigation.js");
    const { viewState } = await import("../desktop/renderer/src/state.js");
    viewState.currentThreadId = "diagnosis-thread";
    viewState.evalContext = {
      harnessConfigurationName: "codex-basic-high",
      cases: [{
        name: "h3 · status-code sanitization",
        status: "failed",
        threads: [
          { id: "architecture-thread", name: "Architecture question" },
          { id: "diagnosis-thread", name: "Read-only bug diagnosis" },
          { id: "implementation-thread", name: "Implement and commit the repair" },
        ],
      }],
    };

    renderSidebar();
    renderSidebar();

    expect(chatSection.classList.contains("hidden")).toBe(false);
    expect(projectSection.classList.contains("hidden")).toBe(true);
    expect(chatLabel.textContent).toBe("Cases · codex-basic-high");
    expect(chatList.innerHTML).toContain("Architecture question");
    expect(chatList.innerHTML).toContain("Read-only bug diagnosis");
    expect(chatList.innerHTML).toContain("Implement and commit the repair");
    expect(chatList.innerHTML).toContain('class="entry active" data-thread="diagnosis-thread"');
    expect(chatList.innerHTML).not.toContain("Thread 1");
  });
});

it("keeps quoted chat, project, and Eval destination names on the actual buttons", async () => {
  const { Window } = await import("happy-dom");
  const browser = new Window({ url: "http://127.0.0.1:43123/" });
  Object.assign(globalThis, { window: browser, document: browser.document, location: browser.location });
  document.body.innerHTML = `<div class="sidebar-title"><strong>Relayer</strong></div><button id="newThread"></button>
    <section class="side-section"><div class="section-label"></div><div id="chatList"></div></section>
    <section class="side-section"><div class="section-label"></div><div id="projectList"></div></section><button id="settingsButton"></button>`;
  const { renderSidebar } = await import("../desktop/renderer/src/navigation.js");
  const { appState, viewState } = await import("../desktop/renderer/src/state.js");
  const previous = { threads: appState.threads, projects: appState.projects, evalContext: viewState.evalContext };
  const name = 'Review "quotes" & names';
  try {
    viewState.evalContext = null;
    appState.threads = [{ id: 10, title: name }, { id: 11, title: `Project ${name}`, projectId: 1 }];
    appState.projects = [{ id: 1, name }];
    renderSidebar();
    for (const [selector, expected] of [['[data-thread="10"]', name], ['[data-thread="11"]', `Project ${name}`], ['.project-button', name]]) {
      const button = document.querySelector(selector);
      expect(button.getAttribute("aria-label")).toBe(expected);
      expect(button.getAttribute("title")).toBe(expected);
      expect(button.querySelector(".entry-icon,i").getAttribute("aria-hidden")).toBe("true");
    }
    viewState.evalContext = { harnessConfigurationName: "fixture", cases: [{ name: "Case", status: "passed", threads: [{ id: 12, name }] }] };
    renderSidebar();
    expect(document.querySelector('[data-thread="12"]').getAttribute("aria-label")).toBe(name);
    expect(document.querySelector('[data-thread="12"] .entry-icon').getAttribute("aria-hidden")).toBe("true");
    expect(document.querySelector("markup")).toBeNull();
  } finally {
    appState.threads = previous.threads;
    appState.projects = previous.projects;
    viewState.evalContext = previous.evalContext;
    browser.happyDOM.abort();
  }
});
