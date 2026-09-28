import { readFile } from "node:fs/promises";

import { Window } from "happy-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  defaultFamilyRecoveryPresentation,
  defaultHarnessError,
} from "../desktop/renderer/src/model-family-model.js";
import {
  defaultFamilyModelSetup,
  isModelSelectionCatalogError,
  pickerSelectionIsAvailable,
} from "../desktop/renderer/src/model-picker-model.js";
import {
  composerSendTitle,
  createModelPicker,
  modelPickerFamilyPresentation,
  modelPickerMarkup,
  selectionForNextInteraction,
} from "../desktop/renderer/src/model-picker.js";

// PROV-008 (Q15). This is the app server's real /api/model-settings response after a refresh
// reported provider_no_eligible_execution_models for the default family's provider. The Rust
// flow test a_default_family_without_eligible_models_needs_model_setup_until_a_refresh_restores_it
// asserts that the server still returns exactly this.
const recoveringResponse = await readFile(
  new URL("./fixtures/model-settings-default-family-recovery.json", import.meta.url),
  "utf8",
);
const recovering = () => JSON.parse(recoveringResponse);
const source = (path) => readFile(new URL(`../desktop/renderer/${path}`, import.meta.url), "utf8");

afterEach(() => vi.unstubAllGlobals());

function mountPicker(settings, { mode = "new", ...options } = {}) {
  vi.stubGlobal("requestAnimationFrame", (callback) => { callback(); return 0; });
  const window = new Window({ url: "http://127.0.0.1/" });
  vi.stubGlobal("document", window.document);
  window.document.body.innerHTML = modelPickerMarkup({ mode });
  const root = window.document.querySelector(`[data-model-picker="${mode}"]`);
  const picker = createModelPicker({ root, mode, settings, ...options });
  return { root, picker, document: window.document };
}

// The same server response after the user explicitly chose Work as the default during recovery.
// The Rust flow test asserts that the server then reports only familiesNeedingModelSetup.
function recoveringWithWorkDefault() {
  const settings = recovering();
  settings.defaults = { ...settings.defaults, providerId: "work", familyId: 2 };
  settings.defaultFamilyRecovery = null;
  return settings;
}

describe("default family that needs model setup (PROV-008)", () => {
  it("keeps the default family selected and names its provider's recovery", () => {
    const settings = recovering();
    expect(settings.defaults.familyId).toBe(settings.defaultFamilyRecovery.familyId);
    expect(defaultFamilyModelSetup(settings)).toMatchObject({
      familyId: settings.defaults.familyId,
      familyName: "Codex defaults",
      providerId: "codex",
      providerLabel: "Codex",
      label: "Needs model setup",
      actionLabel: "Refresh models",
      actionName: "Refresh models for Codex",
    });
    expect(defaultFamilyModelSetup(settings).message).toBe(
      "Codex defaults needs model setup. Codex has no models eligible for agent execution.",
    );
    expect(settings.familiesNeedingModelSetup).toEqual([settings.defaultFamilyRecovery]);
    expect(defaultFamilyModelSetup({
      ...settings,
      defaultFamilyRecovery: null,
      familiesNeedingModelSetup: [],
    })).toBeNull();
  });

  it("does not pre-show another provider's family, but still offers it as an explicit choice", () => {
    const settings = recovering();
    const presentation = modelPickerFamilyPresentation(settings, "codex-basic", null);
    expect(presentation.selectedFamily).toBeNull();
    expect(presentation.modelSetup?.familyId).toBe(settings.defaults.familyId);
    expect(presentation.families.map((family) => family.name)).toEqual(["Work defaults"]);

    const chosen = { harnessId: "codex-basic", familyId: 2, providerId: "work", modelId: "gpt-5.6-sol" };
    expect(pickerSelectionIsAvailable(settings, chosen)).toBe(true);
    expect(modelPickerFamilyPresentation(settings, "codex-basic", chosen).modelSetup).toBeNull();
  });

  it("shows Needs model setup in the composer with an exact-provider Refresh models action", async () => {
    const onRefreshModels = vi.fn(async () => {});
    const { root, picker } = mountPicker(recovering(), { onRefreshModels });
    const trigger = root.querySelector("[data-model-picker-trigger]");
    expect(root.querySelector("[data-model-picker-label]").textContent).toBe("Needs model setup");
    expect(trigger.title).toBe(
      "Codex defaults needs model setup. Codex has no models eligible for agent execution.",
    );
    expect(picker.isReady()).toBe(false);
    expect(picker.modelSetup()).toMatchObject({ providerId: "codex" });

    picker.open();
    const panel = root.querySelector('[data-model-picker-panel="model"]');
    expect(panel.textContent).toContain("Needs model setup");
    expect(panel.querySelector("[data-model-option]")).toBeNull();
    const refresh = panel.querySelector("[data-model-picker-refresh]");
    expect(refresh.textContent).toBe("Refresh models");
    expect(refresh.getAttribute("aria-label")).toBe("Refresh models for Codex");
    refresh.focus();
    refresh.click();
    await vi.waitFor(() => expect(onRefreshModels).toHaveBeenCalledWith("codex"));
    // The panel re-renders, and focus returns to the refresh action rather than the page.
    await vi.waitFor(() => expect(
      root.ownerDocument.activeElement?.hasAttribute("data-model-picker-refresh"),
    ).toBe(true));
    picker.dispose();
  });

  it("names a thread's non-default family that needs model setup", () => {
    const settings = recoveringWithWorkDefault();
    const interaction = {
      modelSelection: { familyId: 1, providerId: "codex", modelId: "gpt-5.6-sol" },
    };
    const selection = selectionForNextInteraction(settings, "codex-basic", interaction);
    expect(selection).toMatchObject({ familyId: 1, providerId: "codex" });
    const { root, picker } = mountPicker(settings, {
      mode: "ongoing",
      pinnedHarnessId: "codex-basic",
      selection,
      onRefreshModels: async () => {},
    });
    expect(root.querySelector("[data-model-picker-label]").textContent).toBe("Needs model setup");
    expect(picker.modelSetup()).toMatchObject({ familyId: 1, providerId: "codex" });
    picker.open();
    expect(root.querySelector("[data-model-picker-refresh]").getAttribute("aria-label"))
      .toBe("Refresh models for Codex");
    picker.dispose();
  });

  it("offers Open Settings instead of a refresh the host cannot run", () => {
    const { root, picker } = mountPicker(recovering(), { onRefreshModels: null });
    picker.open();
    const panel = root.querySelector('[data-model-picker-panel="model"]');
    expect(panel.textContent).toContain("Needs model setup");
    expect(panel.querySelector("[data-model-picker-refresh]")).toBeNull();
    expect(panel.querySelector("[data-model-picker-settings]")).not.toBeNull();
    picker.dispose();
  });

  it("says why Send is blocked", () => {
    const modelSetup = defaultFamilyModelSetup(recovering());
    expect(composerSendTitle({ ready: false, modelSetup, readyTitle: "Send" })).toBe(
      "Needs model setup. Refresh models for Codex to send.",
    );
    expect(composerSendTitle({ ready: true, modelSetup: null, readyTitle: "Send" })).toBe("Send");
    expect(composerSendTitle({ ready: false, modelSetup: null, readyTitle: "Send" })).toBe(
      "Choose an available model in Settings before sending",
    );
  });

  it("shows the recovery in the Settings default section instead of a harness error", () => {
    const settings = recovering();
    expect(defaultFamilyRecoveryPresentation(settings)).toEqual({
      providerId: "codex",
      title: "Needs model setup",
      message: "Codex defaults needs model setup. Codex has no models eligible for agent execution.",
      actionLabel: "Refresh models",
      actionName: "Refresh models for Codex",
    });
    expect(defaultHarnessError(settings)).toBeNull();
    // With the default provider as the only provider, the harness has no usable route either.
    const onlyProvider = {
      ...settings,
      providers: settings.providers.filter((provider) => provider.id === "codex"),
      families: [],
      harnesses: settings.harnesses.map((harness) => ({ ...harness, usableNow: false, usableFamilyIds: [] })),
    };
    expect(defaultFamilyRecoveryPresentation(onlyProvider)?.providerId).toBe("codex");
    expect(defaultHarnessError(onlyProvider)).toBeNull();

    const withoutRecovery = { ...settings, defaultFamilyRecovery: null, familiesNeedingModelSetup: [] };
    expect(defaultFamilyRecoveryPresentation(withoutRecovery)).toBeNull();
    expect(defaultHarnessError(withoutRecovery)).toBe(
      "No eligible model in the default family can use this harness.",
    );
  });

  it("counts every typed family rejection as one that refreshes model settings", () => {
    for (const code of [
      "model_family_removed",
      "model_family_unresolvable",
      "provider_no_eligible_execution_models",
    ]) {
      expect(isModelSelectionCatalogError({ code })).toBe(true);
    }
  });

  it("wires every Refresh models action to the existing provider refresh", async () => {
    const [html, settingsSource, composer, workspace, graph, main, threads, refresh] = await Promise.all([
      source("index.html"),
      source("src/model-family-settings.js"),
      source("src/composer-model-picker.js"),
      source("src/product-workspace/workspace.js"),
      source("src/graph.js"),
      source("src/main.js"),
      source("src/threads.js"),
      source("src/provider-models-refresh.js"),
    ]);
    expect(refresh).toContain("await desktop.models.refresh(providerId);");
    expect(html).toContain('id="defaultFamilyRecovery"');
    expect(html).toContain('id="refreshDefaultFamilyModels"');
    expect(settingsSource).toContain("defaultFamilyRecoveryPresentation(settings)");
    expect(settingsSource).toContain("await refreshProviderModels(recovery.providerId);");
    expect(refresh).toContain("return desktop?.models?.refresh ? refreshProviderModels : null;");
    expect(composer).toContain("onRefreshModels: providerModelsRefreshAction(),");
    expect(graph).toContain("onRefreshModels: providerModelsRefreshAction(),");
    expect(settingsSource).toContain(
      'refreshButton.setAttribute("aria-disabled", String(refreshingDefaultFamily || savingDefaults));',
    );
    expect(settingsSource).toContain("if (!recovery || refreshingDefaultFamily || savingDefaults) return;");
    expect(threads).toContain("if (!isModelSelectionCatalogError(error)) return;");
    expect(workspace).toContain("send.title = composerSendTitle({");
    expect(threads).toContain('$("#createThread").title = composerSendTitle({');
    expect(main).toContain("setProviderModelsRefreshedHandler(");
  });
});
