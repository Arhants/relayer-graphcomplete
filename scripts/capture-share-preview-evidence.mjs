import { app, BrowserWindow, session } from "electron";
import { readFile, mkdir, writeFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { createSharePreviewCapture } from "../desktop/main/services/share-preview-capture.mjs";
app.on("window-all-closed", () => {});
const root = resolve(import.meta.dirname, "..");
async function rendererIdentity() {
  const files = {};
  const walk = async (directory) => {
    for (const entry of (await readdir(resolve(root, directory), { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name, "en"))) {
      const file = `${directory}/${entry.name}`;
      if (entry.isDirectory()) await walk(file);
      else files[file] = createHash("sha256").update(await readFile(resolve(root, file))).digest("hex");
    }
  };
  for (const directory of ["src", "vendor", "assets"]) await walk(`desktop/renderer/${directory}`);
  files["desktop/renderer/styles.css"] = createHash("sha256").update(await readFile(resolve(root, "desktop/renderer/styles.css"))).digest("hex");
  return { algorithm: "sha256 of JSON path-to-sha256 map", sha256: createHash("sha256").update(JSON.stringify(files)).digest("hex"), files };
}
async function main() {
  try {
    const renderer = await rendererIdentity();
    const capture = createSharePreviewCapture({
      BrowserWindow,
      session,
      rendererDirectory: resolve(root, "desktop/renderer"),
    });
    const snapshotBytes = await readFile(
      resolve(root, "test/fixtures/social-preview.jsonl"),
    );
    const dir = resolve(root, ".relayer/evidence/desktop-social-preview");
    await mkdir(dir, { recursive: true });
    const receipts = [];
    const captureSession = session.fromPartition("share-preview-capture");
    for (const theme of ["light", "dark"]) {
      const bytes = await capture({
        snapshotBytes,
        title: "How a request reaches your browser",
        theme,
      });
      if (
        Buffer.from(bytes).readUInt32BE(16) !== 1200 ||
        Buffer.from(bytes).readUInt32BE(20) !== 630
      )
        throw new Error("Wrong PNG size");
      await writeFile(resolve(dir, `${theme}.png`), bytes);
      receipts.push({
        theme,
        sha256: createHash("sha256").update(bytes).digest("hex"),
        bytes: bytes.length,
      });
      if (theme === "light") {
        await captureSession.cookies.set({
          url: "http://127.0.0.1",
          name: "capture-residue-probe",
          value: "must-not-survive",
        });
      } else if ((await captureSession.cookies.get({ name: "capture-residue-probe" })).length) {
        throw new Error("Capture session storage survived reuse");
      }
    }
    if (receipts[0].sha256 === receipts[1].sha256)
      throw new Error("Theme did not affect capture");
    const abort = new AbortController();
    let cancelledUrl;
    class CancelledWindow extends BrowserWindow {
      constructor(options) {
        super(options);
        this.webContents.once("did-start-loading", () => {
          abort.abort();
        });
      }
    }
    const originalLoad=CancelledWindow.prototype.loadURL;
    CancelledWindow.prototype.loadURL=function(url,...args){cancelledUrl=url;return originalLoad.call(this,url,...args);};
    const cancelled = createSharePreviewCapture({
      BrowserWindow: CancelledWindow,
      session,
      rendererDirectory: resolve(root, "desktop/renderer"),
    });
    let rejected = false;
    try {
      await cancelled({
        snapshotBytes,
        title: "Cancelled",
        theme: "light",
        signal: abort.signal,
      });
    } catch (error) {
      rejected = error.name === "AbortError";
    }
    if (!rejected) throw new Error("Cancellation was not closed");
    if (!cancelledUrl) throw new Error("No capture URL observed");
    if (cancelledUrl) {
      let closed = false;
      try {
        await fetch(cancelledUrl);
      } catch {
        closed = true;
      }
      if (!closed) throw new Error("Capture server survived cancellation");
    }
    if (BrowserWindow.getAllWindows().length !== 0)
      throw new Error("Capture leaked a window");
    if ((await rendererIdentity()).sha256 !== renderer.sha256) throw new Error("Renderer changed during capture");
    const sourceFiles = {};
    for (const file of [
      "desktop/main/services/share-preview-capture.mjs",
      "desktop/main/services/share-publish-coordinator.mjs",
      "desktop/main/services/share-publish-attempt-store.mjs",
      "desktop/main/services/share-service-client.mjs",
      "desktop/main/index.mjs",
      "contracts/share-service-v1/contract.json",
      "scripts/capture-share-preview-evidence.mjs",
      "test/fixtures/social-preview.jsonl",
      "desktop/shared/telemetry-module-inventory.mjs",
    ]) sourceFiles[file] = createHash("sha256").update(await readFile(resolve(root, file))).digest("hex");
    await writeFile(resolve(dir, "receipt.json"), JSON.stringify({
      sourceFiles, renderer, captures: receipts,
      platform: `${process.platform} ${process.arch}`, electron: process.versions.electron,
      captureCancellation: "passed", windowAndServerCleanup: "passed",
    }, null, 2) + "\n");
    console.log(JSON.stringify({ passed: true, dir, receipts }));
  } finally {
    app.quit();
  }
}
app
  .whenReady()
  .then(main)
  .catch((error) => {
    console.error(error);
    app.exit(1);
  });
