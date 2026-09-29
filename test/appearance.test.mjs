import { EventEmitter } from "node:events";
import { readFile } from "node:fs/promises";

import { Window } from "happy-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { savedAppearance, startAppearance } from "../desktop/main/appearance.mjs";
import { registerAppearanceIpc } from "../desktop/main/ipc/register-ipc.mjs";

// Electron's nativeTheme: an explicit source wins; "system" reports the OS.
function fakeNativeTheme({ osDark = true } = {}) {
  const theme = new EventEmitter();
  let source = "system";
  Object.defineProperties(theme, {
    themeSource: { get: () => source, set: (value) => { source = value; theme.emit("updated"); } },
    shouldUseDarkColors: { get: () => (source === "system" ? osDark : source === "dark") },
  });
  theme.setOperatingSystemDark = (dark) => {
    osDark = dark;
    if (source === "system") theme.emit("updated");
  };
  return theme;
}

// A media query whose answer follows the fake operating system.
function fakeMatchMedia(light) {
  const listeners = [];
  const query = { get matches() { return light; }, addEventListener: (_type, listener) => listeners.push(listener) };
  return {
    matchMedia: () => query,
    setOperatingSystemLight(value) {
      light = value;
      for (const listener of listeners) listener();
    },
  };
}

describe("desktop appearance preference", () => {
  it("uses System for installs without a saved choice and keeps a saved one", () => {
    expect([undefined, null, "", "blue"].map(savedAppearance)).toEqual(["system", "system", "system", "system"]);
    expect(["system", "light", "dark"].map(savedAppearance)).toEqual(["system", "light", "dark"]);
  });

  it("saves a valid choice, paints the resolved window colour, and rejects anything else", async () => {
    const handlers = new Map();
    const nativeTheme = fakeNativeTheme({ osDark: false });
    const window = { setBackgroundColor: vi.fn() };
    let saved = { appearance: "dark", updateChannel: "preview" };
    const settings = { update: async (mutate) => { saved = await mutate(structuredClone(saved)); return saved; } };
    registerAppearanceIpc({ ipcMain: { handle: (name, fn) => handlers.set(name, fn) }, nativeTheme, settings, getWindow: () => window });
    const set = (value) => handlers.get("relayer:appearance-set")(null, value);

    await expect(set("blue")).rejects.toThrow("Invalid appearance.");
    expect(saved).toEqual({ appearance: "dark", updateChannel: "preview" });

    await expect(set("system")).resolves.toEqual({ appearance: "system" });
    expect(await handlers.get("relayer:appearance-read")()).toEqual({ appearance: "system" });
    expect(window.setBackgroundColor).toHaveBeenLastCalledWith("#fafafa");
    expect(saved).toEqual({ appearance: "system", updateChannel: "preview" });

    await set("dark");
    expect(window.setBackgroundColor).toHaveBeenLastCalledWith("#0b0c0d");
    expect(nativeTheme.themeSource).toBe("dark");
  });

  it("starts an install without a saved choice on System and repaints when the operating system changes", () => {
    const nativeTheme = fakeNativeTheme({ osDark: true });
    const window = { setBackgroundColor: vi.fn() };
    const stop = startAppearance(nativeTheme, undefined, () => window);
    expect(nativeTheme.themeSource).toBe("system");
    nativeTheme.setOperatingSystemDark(false);
    expect(window.setBackgroundColor).toHaveBeenLastCalledWith("#fafafa");
    nativeTheme.themeSource = "dark";
    expect(window.setBackgroundColor).toHaveBeenLastCalledWith("#0b0c0d");
    stop();
    nativeTheme.themeSource = "light";
    expect(window.setBackgroundColor).toHaveBeenCalledTimes(2);
  });
});

describe("renderer appearance", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  async function mountRenderer({ light }) {
    const owner = new Window({ url: "http://127.0.0.1:41001" });
    const html = await readFile(new URL("../desktop/renderer/index.html", import.meta.url), "utf8");
    owner.document.body.innerHTML = html.match(/<select id="appearanceSelect">.*?<\/select>/)[0];
    const media = fakeMatchMedia(light);
    vi.stubGlobal("document", owner.document);
    vi.stubGlobal("localStorage", owner.localStorage);
    vi.stubGlobal("matchMedia", media.matchMedia);
    const { applyAppearance } = await import("../desktop/renderer/src/ui.js");
    const theme = () => owner.document.documentElement.dataset.theme;
    const select = owner.document.querySelector("#appearanceSelect");
    return { applyAppearance, media, theme, select };
  }

  it("offers System first and follows the operating system in place only under System", async () => {
    const { applyAppearance, media, theme, select } = await mountRenderer({ light: true });
    expect([...select.options].map((option) => option.value)).toEqual(["system", "light", "dark"]);

    applyAppearance("system");
    expect([theme(), select.value]).toEqual(["light", "system"]);
    media.setOperatingSystemLight(false);
    expect(theme()).toBe("dark");

    applyAppearance("light");
    media.setOperatingSystemLight(true);
    media.setOperatingSystemLight(false);
    expect([theme(), select.value]).toEqual(["light", "light"]);

    applyAppearance("dark");
    media.setOperatingSystemLight(true);
    expect([theme(), select.value]).toEqual(["dark", "dark"]);
  });

  it("declares the native color scheme for both themes so browser-drawn controls match", async () => {
    const css = await readFile(new URL("../desktop/renderer/styles.css", import.meta.url), "utf8");
    expect(css.match(/^:root\{[^}]*\}/)[0]).toContain("color-scheme:dark");
    expect(css.match(/html\[data-theme="light"\]\{[^}]*\}/)[0]).toContain("color-scheme:light");
  });

  it("paints the first frame from the resolved desktop appearance and keeps browser-hosted review dark", async () => {
    const source = await readFile(new URL("../desktop/renderer/theme-bootstrap.js", import.meta.url), "utf8");
    const boot = ({ desktop, light, saved = null }) => {
      const owner = new Window({ url: "http://127.0.0.1:41001" });
      if (saved) owner.localStorage.setItem("relayerAppearance", saved);
      const window = desktop ? { relayerDesktop: {} } : {};
      new Function("window", "document", "localStorage", "matchMedia", source)(
        window, owner.document, owner.localStorage, fakeMatchMedia(light).matchMedia);
      return owner.document.documentElement.dataset.theme;
    };
    expect(boot({ desktop: true, light: true, saved: "dark" })).toBe("light");
    expect(boot({ desktop: true, light: false })).toBe("dark");
    expect(boot({ desktop: false, light: true })).toBe("dark");
    expect(boot({ desktop: false, light: false, saved: "light" })).toBe("light");
  });
});
