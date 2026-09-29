import { Window } from "happy-dom";
import { afterEach, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSettingsStore } from "../desktop/main/services/settings-store.mjs";
import { registerWorkspaceLayoutIpc } from "../desktop/main/ipc/register-ipc.mjs";
import { createWorkspaceLayout } from "../desktop/renderer/src/product-workspace/workspace-layout.js";
import { productWorkspaceMarkup } from "../desktop/renderer/src/product-workspace/view.js";

const opened = [];
afterEach(() => { for (const view of opened.splice(0)) view.dispose(); vi.restoreAllMocks(); });
function mount(owner = new Window({ url: "https://share.example.test" }), width = 1012) {
  owner.document.body.innerHTML = productWorkspaceMarkup();
  const root = owner.document.body;
  const layout = root.querySelector(".workspace-layout");
  vi.spyOn(layout, "getBoundingClientRect").mockReturnValue({ left: 0, width });
  const view = createWorkspaceLayout(root, owner);
  opened.push(view);
  return { owner, root, view, layout, divider: root.querySelector("#workspaceDivider"),
    ratio: () => Number(root.querySelector("#workspaceDivider").getAttribute("aria-valuenow")),
    key(key) { root.querySelector("#workspaceDivider").dispatchEvent(new owner.KeyboardEvent("keydown", { key, bubbles: true })); },
  };
}
const drain = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

it("opens Environment only on request and dismisses it before Node Details handles Escape", () => {
  const { owner, root, layout } = mount();
  const panel = root.querySelector("#environmentPanel");
  const toggle = root.querySelector("#environmentToggle");
  const inspector = root.querySelector("#inspector");
  inspector.classList.remove("hidden");
  const detailEscape = vi.fn(() => inspector.classList.add("hidden"));
  owner.document.addEventListener("keydown", detailEscape);
  expect(panel.classList.contains("hidden")).toBe(true);
  const originalSplit = layout.style.getPropertyValue("--graph-share");
  toggle.click();
  expect(panel.classList.contains("hidden")).toBe(false);
  expect(toggle.getAttribute("aria-expanded")).toBe("true");
  expect(owner.document.activeElement.id).toBe("closeEnvironment");
  owner.document.dispatchEvent(new owner.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
  expect(panel.classList.contains("hidden")).toBe(true);
  expect(detailEscape).not.toHaveBeenCalled();
  expect(inspector.classList.contains("hidden")).toBe(false);
  expect(owner.document.activeElement).toBe(toggle);
  toggle.click();
  layout.dispatchEvent(new owner.PointerEvent("pointerdown", { bubbles: true }));
  expect(panel.classList.contains("hidden")).toBe(true);
  expect(layout.style.getPropertyValue("--graph-share")).toBe(originalSplit);
});

it("defaults to equal panes, persists keyboard and pointer adjustments, and clamps to usable minimums", () => {
  const { owner, divider, ratio, key, view } = mount();
  expect(ratio()).toBe(50);
  key("ArrowRight");
  expect(ratio()).toBe(52);
  expect(JSON.parse(owner.localStorage.getItem("relayerWorkspaceSplitV1"))).toBe(0.52);
  divider.dispatchEvent(new owner.PointerEvent("pointerdown", { button: 0, pointerId: 1 }));
  divider.dispatchEvent(new owner.PointerEvent("pointermove", { clientX: -400, pointerId: 1 }));
  expect(ratio()).toBe(28);
  divider.dispatchEvent(new owner.PointerEvent("pointermove", { clientX: 2000, pointerId: 1 }));
  expect(ratio()).toBe(72);
  // Native release can be retargeted to the pane after the divider moves.
  owner.document.dispatchEvent(new owner.PointerEvent("pointerup", { pointerId: 1 }));
  expect(JSON.parse(owner.localStorage.getItem("relayerWorkspaceSplitV1"))).toBe(0.72);
  view.dispose();
  expect(mount(owner).ratio()).toBe(72);
  expect(mount(new Window({ url: "https://other.example.test" })).ratio()).toBe(50);
});

it("ignores a late durable preference read after the user adjusts the divider", async () => {
  let resolveRead;
  const owner = new Window({ url: "http://localhost:41001" });
  const set = vi.fn(async () => {});
  owner.relayerDesktop = { workspaceLayout: { read: () => new Promise(resolve => { resolveRead = resolve; }), set } };
  const { key, ratio } = mount(owner);
  await drain();
  key("ArrowLeft");
  resolveRead(0.7);
  await drain();
  expect(ratio()).toBe(48);
  expect(set).toHaveBeenLastCalledWith(0.48);
});

it("restores durable desktop split through production settings IPC after a changed-origin restart", async () => {
  const directory = await mkdtemp(join(tmpdir(), "relayer-layout-"));
  const open = async (port) => {
    const handlers = new Map();
    const settings = createSettingsStore(directory);
    registerWorkspaceLayoutIpc({ ipcMain: { handle: (name, fn) => handlers.set(name, fn) }, settings });
    const owner = new Window({ url: `http://127.0.0.1:${port}` });
    const pending = [];
    owner.relayerDesktop = { workspaceLayout: {
      read: () => handlers.get("relayer:workspace-layout-read")(),
      set: value => { const write = handlers.get("relayer:workspace-layout-set")(null, value); pending.push(write); return write; },
    } };
    const saved = await owner.relayerDesktop.workspaceLayout.read();
    const view = mount(owner);
    await vi.waitFor(() => expect(view.ratio()).toBe(Math.round(saved * 100)));
    return { ...view, settings, handlers, pending };
  };
  try {
    const first = await open(41001);
    await first.settings.update(current => ({ ...current, appearance: "light" }));
    first.key("ArrowRight");
    await drain();
    await Promise.all(first.pending);
    await first.settings.flush();
    first.view.dispose();
    const reopened = await open(41002);
    expect(reopened.owner.localStorage.getItem("relayerWorkspaceSplitV1")).toBeNull();
    expect(reopened.ratio()).toBe(52);
    expect((await reopened.settings.read()).appearance).toBe("light");
    await expect(reopened.handlers.get("relayer:workspace-layout-set")(null, 1)).rejects.toThrow("Invalid workspace split ratio");
  } finally { await rm(directory, { recursive: true, force: true }); }
});


it("hydrates and saves the live human task split without activating review mode", async () => {
  const owner = new Window({ url: "http://127.0.0.1:43123/?humanTask=1" });
  const set = vi.fn(async () => {});
  owner.relayerHumanTask = { workspaceLayout: { read: async () => 0.64, set } };
  const workspace = mount(owner);
  await drain();
  expect(workspace.ratio()).toBe(64);
  workspace.key("ArrowRight");
  await drain();
  expect(set).toHaveBeenCalledWith(0.66);
  expect(owner.relayerEvalReview).toBeUndefined();
});
