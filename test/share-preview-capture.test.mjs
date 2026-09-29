import { EventEmitter } from "node:events";

import { describe, expect, it, vi } from "vitest";

import { createSharePreviewCapture } from "../desktop/main/services/share-preview-capture.mjs";

describe("desktop share preview capture", () => {
  it("reuses one isolated session, serializes captures, and removes session handlers", async () => {
    const gates = [];
    const windows = [];
    class BrowserWindow {
      constructor(options) {
        this.options = options;
        this.destroyed = false;
        this.webContents = Object.assign(new EventEmitter(), {
          setWindowOpenHandler: vi.fn(),
          executeJavaScript: vi.fn(async () => {}),
          capturePage: vi.fn(async () => ({
            resize: () => ({ toPNG: () => Buffer.from("png") }),
          })),
        });
        windows.push(this);
      }
      async loadURL() {
        await new Promise((resolve) => gates.push(resolve));
      }
      isDestroyed() { return this.destroyed; }
      destroy() { this.destroyed = true; }
    }
    const captureSession = Object.assign(new EventEmitter(), {
      setPermissionRequestHandler: vi.fn(),
      setPermissionCheckHandler: vi.fn(),
      clearStorageData: vi.fn(async () => {}),
      webRequest: { onBeforeRequest: vi.fn() },
    });
    const session = { fromPartition: vi.fn(() => captureSession) };
    const capture = createSharePreviewCapture({
      BrowserWindow,
      session,
      rendererDirectory: new URL("../desktop/renderer", import.meta.url),
    });

    const first = capture({ snapshotBytes: new Uint8Array(), title: "First", theme: "light" });
    const second = capture({ snapshotBytes: new Uint8Array(), title: "Second", theme: "dark" });
    await vi.waitFor(() => expect(windows).toHaveLength(1));
    expect(session.fromPartition).toHaveBeenCalledOnce();
    expect(session.fromPartition).toHaveBeenCalledWith("share-preview-capture");

    gates.shift()();
    await expect(first).resolves.toEqual(new Uint8Array(Buffer.from("png")));
    await vi.waitFor(() => expect(windows).toHaveLength(2));
    gates.shift()();
    await expect(second).resolves.toEqual(new Uint8Array(Buffer.from("png")));

    expect(captureSession.listenerCount("will-download")).toBe(0);
    expect(captureSession.setPermissionRequestHandler).toHaveBeenLastCalledWith(null);
    expect(captureSession.setPermissionCheckHandler).toHaveBeenLastCalledWith(null);
    expect(captureSession.webRequest.onBeforeRequest).toHaveBeenLastCalledWith(null);
    expect(captureSession.clearStorageData).toHaveBeenCalledTimes(4);
  });

  it("serves the generated design tokens and fonts the viewer stylesheet imports", async () => {
    const served = {};
    class BrowserWindow {
      constructor() {
        this.webContents = Object.assign(new EventEmitter(), {
          setWindowOpenHandler: vi.fn(),
          executeJavaScript: vi.fn(async () => {}),
          capturePage: vi.fn(async () => ({ resize: () => ({ toPNG: () => Buffer.from("png") }) })),
        });
      }
      async loadURL(url) {
        const base = url.replace(/capture$/, "");
        for (const path of ["styles.css", "design/design.css", "design/fonts/figtree/figtree-latin-wght-normal.woff2", "../package.json"]) {
          const response = await fetch(base + path);
          served[path] = [response.status, response.headers.get("content-type")];
        }
      }
      isDestroyed() { return false; }
      destroy() {}
    }
    const captureSession = Object.assign(new EventEmitter(), {
      setPermissionRequestHandler: vi.fn(),
      setPermissionCheckHandler: vi.fn(),
      clearStorageData: vi.fn(async () => {}),
      webRequest: { onBeforeRequest: vi.fn() },
    });
    const capture = createSharePreviewCapture({
      BrowserWindow,
      session: { fromPartition: () => captureSession },
      rendererDirectory: new URL("../desktop/renderer", import.meta.url),
    });
    await capture({ snapshotBytes: new Uint8Array(), title: "Styled", theme: "dark" });
    expect(served).toEqual({
      "styles.css": [200, "text/css"],
      "design/design.css": [200, "text/css"],
      "design/fonts/figtree/figtree-latin-wght-normal.woff2": [200, "font/woff2"],
      "../package.json": [404, null],
    });
  });

  it("tears down handlers after failures and aborts before running the next capture", async () => {
    const abort = new AbortController();
    const plans = ["load-failure", "abort", "success"];
    const windows = [];
    class BrowserWindow {
      constructor(options) {
        this.options = options;
        this.plan = plans[windows.length];
        this.destroyed = false;
        this.webContents = Object.assign(new EventEmitter(), {
          setWindowOpenHandler: vi.fn(),
          executeJavaScript: vi.fn(async () => {}),
          capturePage: vi.fn(async () => ({ resize: () => ({ toPNG: () => Buffer.from("png") }) })),
        });
        windows.push(this);
      }
      async loadURL() {
        if (this.plan === "load-failure") throw new Error("load failed");
        if (this.plan === "abort") abort.abort();
      }
      isDestroyed() { return this.destroyed; }
      destroy() { this.destroyed = true; }
    }
    const captureSession = Object.assign(new EventEmitter(), {
      setPermissionRequestHandler: vi.fn(),
      setPermissionCheckHandler: vi.fn(),
      clearStorageData: vi.fn(async () => {}),
      webRequest: { onBeforeRequest: vi.fn() },
    });
    const capture = createSharePreviewCapture({
      BrowserWindow,
      session: { fromPartition: () => captureSession },
      rendererDirectory: new URL("../desktop/renderer", import.meta.url),
    });
    const input = { snapshotBytes: new Uint8Array(), title: "Failure", theme: "light" };

    await expect(capture(input)).rejects.toMatchObject({ code: "share_export_failed" });
    expectSessionTeardown(captureSession);
    await expect(capture({ ...input, signal: abort.signal })).rejects.toMatchObject({ name: "AbortError" });
    expectSessionTeardown(captureSession);
    await expect(capture({ ...input, title: "Recovery" })).resolves.toEqual(new Uint8Array(Buffer.from("png")));
    expectSessionTeardown(captureSession);
    expect(windows.every((window) => window.destroyed)).toBe(true);
  });

  it.each(["missing-renderer", "invalid-utf8"])("classifies %s setup failures as export failures", async (failure) => {
    const BrowserWindow = vi.fn();
    const captureSession = Object.assign(new EventEmitter(), {
      setPermissionRequestHandler: vi.fn(),
      setPermissionCheckHandler: vi.fn(),
      clearStorageData: vi.fn(async () => {}),
      webRequest: { onBeforeRequest: vi.fn() },
    });
    const capture = createSharePreviewCapture({
      BrowserWindow,
      session: { fromPartition: () => captureSession },
      rendererDirectory: new URL(failure === "missing-renderer" ? "../missing-renderer" : "../desktop/renderer", import.meta.url),
    });
    await expect(capture({ snapshotBytes: new Uint8Array([255]), title: "Setup", theme: "light" })).rejects.toMatchObject({
      code: "share_export_failed", failureStage: "export",
    });
    expect(BrowserWindow).not.toHaveBeenCalled();
    expectSessionTeardown(captureSession);
  });

  it.each(["clear-failure", "abort-during-clear"])("closes %s before reusing the fixed partition", async (failure) => {
    const abort = new AbortController();
    const windows = [];
    class BrowserWindow {
      constructor() {
        this.destroyed = false;
        this.webContents = Object.assign(new EventEmitter(), {
          setWindowOpenHandler: vi.fn(),
          executeJavaScript: vi.fn(async () => {}),
          capturePage: vi.fn(async () => ({ resize: () => ({ toPNG: () => Buffer.from("png") }) })),
        });
        windows.push(this);
      }
      async loadURL() {}
      isDestroyed() { return this.destroyed; }
      destroy() { this.destroyed = true; }
    }
    const captureSession = Object.assign(new EventEmitter(), {
      setPermissionRequestHandler: vi.fn(),
      setPermissionCheckHandler: vi.fn(),
      clearStorageData: vi.fn()
        .mockResolvedValueOnce()
        .mockImplementationOnce(async () => {
          if (failure === "abort-during-clear") abort.abort();
          else throw new Error("clear failed");
        })
        .mockResolvedValue(undefined),
      webRequest: { onBeforeRequest: vi.fn() },
    });
    const capture = createSharePreviewCapture({
      BrowserWindow,
      session: { fromPartition: () => captureSession },
      rendererDirectory: new URL("../desktop/renderer", import.meta.url),
    });
    const input = { snapshotBytes: new Uint8Array(), title: "Cleanup", theme: "light" };

    await expect(capture({ ...input, signal: abort.signal })).rejects.toMatchObject(
      failure === "abort-during-clear" ? { name: "AbortError" } : {
        code: "share_export_failed", failureStage: "export", cause: { message: "clear failed" },
      },
    );
    await expect(capture(input)).resolves.toEqual(new Uint8Array(Buffer.from("png")));
    expect(captureSession.clearStorageData).toHaveBeenCalledTimes(4);
    expect(windows).toHaveLength(2);
  });


});

function expectSessionTeardown(captureSession) {
  expect(captureSession.listenerCount("will-download")).toBe(0);
  expect(captureSession.setPermissionRequestHandler).toHaveBeenLastCalledWith(null);
  expect(captureSession.setPermissionCheckHandler).toHaveBeenLastCalledWith(null);
  expect(captureSession.webRequest.onBeforeRequest).toHaveBeenLastCalledWith(null);
}
