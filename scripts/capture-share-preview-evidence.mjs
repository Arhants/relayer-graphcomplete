import { app, BrowserWindow, session } from "electron";
import { readFile, mkdir, readdir, writeFile } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";
import { createHash } from "node:crypto";
import { createSharePreviewCapture } from "../desktop/main/services/share-preview-capture.mjs";
app.on("window-all-closed", () => {});
const root = resolve(import.meta.dirname, "..");
const rendererDirectory = resolve(root, "desktop/renderer");
const sourceFiles = [
  "desktop/main/services/share-preview-capture.mjs",
  "desktop/main/services/share-publish-coordinator.mjs",
  "desktop/main/services/share-publish-attempt-store.mjs",
  "desktop/main/services/share-service-client.mjs",
  "desktop/main/index.mjs",
  "contracts/share-service-v1/contract.json",
  "scripts/capture-share-preview-evidence.mjs",
  "test/fixtures/social-preview.jsonl",
  "desktop/shared/telemetry-module-inventory.mjs",
];

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function rendererArtifact(directory = rendererDirectory) {
  const files = {};
  async function visit(current) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const path = resolve(current, entry.name);
      if (entry.isSymbolicLink()) throw new Error("Renderer evidence cannot include symbolic links");
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile()) {
        const name = relative(rendererDirectory, path).split(sep).join("/");
        if (!/^(src\/|vendor\/|assets\/|styles\.css$)/.test(name)) continue;
        const bytes = await readFile(path);
        files[name] = { bytes: bytes.length, sha256: sha256(bytes) };
      }
    }
  }
  await visit(directory);
  const canonical = Object.entries(files)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([path, identity]) => `${path}\0${identity.bytes}\0${identity.sha256}\n`)
    .join("");
  return { directory: "desktop/renderer", digest: sha256(canonical), files };
}

async function main() {
  try {
    const capture = createSharePreviewCapture({
      BrowserWindow,
      session,
      rendererDirectory,
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
        sha256: sha256(bytes),
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
      rendererDirectory,
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
    const sourceIdentity = Object.fromEntries(await Promise.all(sourceFiles.map(async (path) => [
      path,
      sha256(await readFile(resolve(root, path))),
    ])));
    const receipt = {
      sourceFiles: sourceIdentity,
      rendererArtifact: await rendererArtifact(),
      captures: receipts,
      platform: process.platform === "darwin" && process.arch === "arm64"
        ? "macOS ARM64"
        : `${process.platform} ${process.arch}`,
      electron: process.versions.electron,
      captureCancellation: "passed",
      windowAndServerCleanup: "passed",
    };
    await writeFile(resolve(dir, "receipt.json"), `${JSON.stringify(receipt, null, 2)}\n`);
    console.log(JSON.stringify({ passed: true, dir, receipt }));
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
