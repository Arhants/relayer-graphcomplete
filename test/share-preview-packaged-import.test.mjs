import { copyFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { EventEmitter } from "node:events";
import { expect, it, vi } from "vitest";

it("imports the packaged capture service and loads its external renderer template", async () => {
  const resources = await mkdtemp(join(tmpdir(), "relayer-packaged-capture-"));
  try {
    const service = join(resources, "app/main/services/share-preview-capture.mjs");
    const rendererDirectory = join(resources, "renderer");
    await mkdir(join(resources, "app/main/services"), { recursive: true });
    await mkdir(join(rendererDirectory, "src/public-share-viewer"), { recursive: true });
    await copyFile(new URL("../desktop/main/services/share-preview-capture.mjs", import.meta.url), service);
    await copyFile(new URL("../desktop/renderer/src/public-share-viewer/template.js", import.meta.url), join(rendererDirectory, "src/public-share-viewer/template.js"));
    const { createSharePreviewCapture } = await import(pathToFileURL(service).href);
    let html;
    class BrowserWindow {
      webContents = Object.assign(new EventEmitter(), {
        setWindowOpenHandler() {},
        async executeJavaScript() {},
        async capturePage() { return { resize: () => ({ toPNG: () => Buffer.from("png") }) }; },
      });
      async loadURL(url) { html = await (await fetch(url)).text(); }
      isDestroyed() { return false; }
      destroy() {}
    }
    const captureSession = Object.assign(new EventEmitter(), {
      clearStorageData: vi.fn(async () => {}),
      setPermissionRequestHandler() {},
      setPermissionCheckHandler() {},
      webRequest: { onBeforeRequest() {} },
    });
    const capture = createSharePreviewCapture({ BrowserWindow, session: { fromPartition: () => captureSession }, rendererDirectory });
    await expect(capture({ snapshotBytes: new Uint8Array(), title: "Packaged graph", theme: "dark" })).resolves.toEqual(new Uint8Array(Buffer.from("png")));
    expect(html).toContain("Packaged graph");
    expect(html).toContain("dark");
    expect(captureSession.clearStorageData).toHaveBeenCalledTimes(2);
  } finally {
    await rm(resources, { recursive: true, force: true });
  }
});
