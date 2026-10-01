import { runInNewContext } from "node:vm";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";

import { captureInstalledUpdateState, driveElectronUpdateCanary } from "../desktop/release/electron-cdp-canary.mjs";

afterEach(() => vi.unstubAllGlobals());

function installedRenderer() {
  const element = () => ({
    classList: { add() {}, remove() {} }, style: { setProperty() {} },
    click() {}, scrollIntoView() {}, contains: () => true,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 200, height: 100 }),
  });
  const section = element();
  section.querySelector = () => ({ textContent: "Application updates" });
  const elements = new Map([
    ["#appShell", element()], ["#settingsView", element()],
    ["#currentVersion", { textContent: "Current version 0.2.37" }],
    ["#updateStatus", { textContent: "Up to date" }],
    ["#updateChannel", { value: "preview" }],
  ]);
  elements.get("#settingsView").querySelectorAll = () => [section];
  return {
    document: {
      body: element(), querySelector: (selector) => elements.get(selector) || null,
      elementFromPoint: () => ({ tagName: "SECTION", id: "updates", className: "settings-section" }),
    },
    getComputedStyle: () => ({ display: "block", visibility: "visible" }),
  };
}

function cdpFixture({ neverReady = false, seedStartup = false, startupAlreadyComplete = false } = {}) {
  let rendererReads = 0;
  let screenshots = 0;
  let startupReads = 0;
  let startupComplete = startupAlreadyComplete;
  let downloadComplete = false;
  let installs = 0;
  let manualChecks = 0;
  let channelChanges = 0;
  vi.stubGlobal("fetch", async () => ({ ok: true, json: async () => [
    { type: "page", webSocketDebuggerUrl: "ws://canary-fixture" },
  ] }));
  vi.stubGlobal("WebSocket", class extends EventTarget {
    constructor() {
      super();
      queueMicrotask(() => this.dispatchEvent(new Event("open")));
    }
    send(text) {
      const { id, method, params } = JSON.parse(text);
      let result = {};
      if (method === "Runtime.evaluate") {
        if (seedStartup && params.expression.startsWith("window.relayerDesktop")) {
          try {
            const updater = {
              status() {
                startupReads += 1;
                if (startupReads >= 3) startupComplete = true;
                return {
                  phase: downloadComplete ? "ready" : startupComplete ? "available" : startupReads === 1 ? "idle" : "checking",
                  version: "0.2.30", channel: "preview", availableVersion: "0.2.37",
                };
              },
              setChannel() { channelChanges += 1; },
              check() {
                if (!startupComplete) throw new Error("Seed startup discovery still pending");
                manualChecks += 1;
              },
              download() { downloadComplete = true; },
              install() {
                if (!startupComplete || !downloadComplete) throw new Error("No verified update is ready to install.");
                installs += 1;
              },
            };
            result = { result: { value: runInNewContext(params.expression, { window: { relayerDesktop: { updater } } }) } };
          } catch (error) {
            result = { exceptionDetails: { exception: { description: error.message } } };
          }
        } else if (params.expression.startsWith("window.relayerDesktop")) {
          result = { result: { value: { phase: "idle", version: "0.2.37", channel: "preview" } } };
        } else if (seedStartup) {
          result = { result: { value: {
            visible: true, title: downloadComplete ? "Ready to restart" : "Update available",
            detail: downloadComplete ? "Ready to restart" : "Version 0.2.37 available",
          } } };
        } else {
          rendererReads += 1;
          const context = neverReady || rendererReads === 1
            ? { document: { body: null, querySelector: () => null } }
            : installedRenderer();
          try {
            result = { result: { value: runInNewContext(params.expression, context) } };
          } catch (error) {
            result = { exceptionDetails: { exception: { description: error.message } } };
          }
        }
      } else if (method === "Page.captureScreenshot") {
        screenshots += 1;
        result = { data: Buffer.from("captured-after-ready").toString("base64") };
      }
      queueMicrotask(() => this.dispatchEvent(new MessageEvent("message", {
        data: JSON.stringify({ id, result }),
      })));
    }
    close() {}
  });
  return {
    rendererReads: () => rendererReads, screenshots: () => screenshots,
    installs: () => installs, manualChecks: () => manualChecks, channelChanges: () => channelChanges,
  };
}

it("waits for the relaunched renderer body before inspecting and capturing installed Settings", async () => {
  const fixture = cdpFixture();
  const root = await mkdtemp(join(tmpdir(), "relayer-cdp-canary-"));
  try {
    const outputPath = join(root, "installed.png");
    await captureInstalledUpdateState({ port: 9230, outputPath, targetVersion: "0.2.37", timeoutMs: 1500 });
    expect(fixture.rendererReads()).toBeGreaterThan(1);
    expect(fixture.screenshots()).toBe(1);
    expect(await readFile(outputPath, "utf8")).toBe("captured-after-ready");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it("fails closed without capturing evidence when the relaunched document never becomes ready", async () => {
  const fixture = cdpFixture({ neverReady: true });
  await expect(captureInstalledUpdateState({
    port: 9230, outputPath: "/unused-installed.png", targetVersion: "0.2.37", timeoutMs: 100,
  })).rejects.toThrow("Timed out waiting for visible updater evidence");
  expect(fixture.screenshots()).toBe(0);
});

it("drains saved-Preview startup discovery before driving the seed's manual download and install", async () => {
  const fixture = cdpFixture({ seedStartup: true });
  const root = await mkdtemp(join(tmpdir(), "relayer-cdp-canary-"));
  try {
    await driveElectronUpdateCanary({
      port: 9229, targetVersion: "0.2.37", availableScreenshotPath: join(root, "available.png"),
      readyScreenshotPath: join(root, "ready.png"), timeoutMs: 2000,
    });
    expect(fixture.manualChecks()).toBe(1);
    expect(fixture.channelChanges()).toBe(0);
    expect(fixture.installs()).toBe(1);
    expect(fixture.screenshots()).toBe(2);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it("accepts startup discovery that finished before the driver attached without resetting the channel", async () => {
  const fixture = cdpFixture({ seedStartup: true, startupAlreadyComplete: true });
  const root = await mkdtemp(join(tmpdir(), "relayer-cdp-canary-"));
  try {
    await driveElectronUpdateCanary({
      port: 9229, targetVersion: "0.2.37", availableScreenshotPath: join(root, "available.png"),
      readyScreenshotPath: join(root, "ready.png"), timeoutMs: 1000,
    });
    expect(fixture.channelChanges()).toBe(0);
    expect(fixture.installs()).toBe(1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
