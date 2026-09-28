import { readFile } from "node:fs/promises";
import { Window } from "happy-dom";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("../desktop/renderer/src/composer-model-picker.js", () => ({ refreshNewThreadModelPicker() {}, resetNewThreadModelPicker() {} }));
vi.mock("../desktop/renderer/src/permission-profiles.js", () => ({ preparePermissionProfiles: async () => () => {} }));
vi.mock("../desktop/renderer/src/harness-settings.js", () => ({ renderHarnessSettings() {} }));

let window;
afterEach(async () => { await window?.happyDOM.close(); vi.unstubAllGlobals(); vi.resetModules(); });

it.each(["started", "edited", "cancelled"])("preserves a family draft %s while provider refresh is in flight", async (action) => {
  window = new Window({ url: "http://localhost/" });
  window.document.body.innerHTML = await readFile(new URL("../desktop/renderer/index.html", import.meta.url), "utf8");
  for (const name of ["window", "document", "location"]) vi.stubGlobal(name, name === "window" ? window : window[name]);
  vi.stubGlobal("requestAnimationFrame", (callback) => { callback(); return 0; });
  const provider = { id: "codex", label: "Codex", connected: true, models: [{ id: "model", label: "Model", available: true }] };
  const settings = { providers: [provider], harnesses: [], defaults: { providerId: "codex" }, families: [{ id: 1, kind: "system", name: "Codex", enabled: true, position: 0, members: [{ providerId: "codex", modelId: "model", position: 0 }] }] };
  let completeRefresh;
  let deferRefresh = false;
  let saved;
  vi.stubGlobal("fetch", vi.fn(async (url, options = {}) => {
    if (options.method === "POST") {
      saved = JSON.parse(options.body);
      settings.families.push({ ...saved, id: 2, kind: "custom", position: 1 });
      return { ok: true, json: async () => settings.families[1] };
    }
    if (deferRefresh) { deferRefresh = false; return new Promise((resolve) => { completeRefresh = () => resolve({ ok: true, json: async () => structuredClone(settings) }); }); }
    return { ok: true, json: async () => structuredClone(settings) };
  }));
  const { initializeModelFamilySettings, refreshModelFamilySettings } = await import("../desktop/renderer/src/model-family-settings.js");
  await initializeModelFamilySettings();
  if (action !== "started") window.document.querySelector("#newModelFamily").click();
  deferRefresh = true;
  const refresh = refreshModelFamilySettings();
  if (action === "started") window.document.querySelector("#newModelFamily").click();
  const input = window.document.querySelector("#familyNameInput");
  input.value = "My eval models";
  input.dispatchEvent(new window.Event("input"));
  if (action === "cancelled") window.document.querySelector("#cancelFamilyEdit").click();
  completeRefresh();
  await refresh;
  if (action === "cancelled") {
    expect(window.document.querySelector("#saveFamilyEdit")).toBeNull();
    expect(window.document.querySelector("#familyPosition").textContent).toBe("1 / 1");
    return;
  }
  expect(window.document.querySelector("#familyNameInput")?.value).toBe("My eval models");
  await window.document.querySelector("#saveFamilyEdit").onclick();
  expect(saved).toEqual({ name: "My eval models", enabled: true, members: [{ providerId: "codex", modelId: "model" }] });
});
