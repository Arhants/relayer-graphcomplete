import { app, BrowserWindow, session } from "electron";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { createSharePreviewCapture } from "../desktop/main/services/share-preview-capture.mjs";
app.on("window-all-closed", () => {});
const root = resolve(import.meta.dirname, "..");
async function main() {
  try {
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
    await writeFile(
      resolve(dir, "receipt.json"),
      JSON.stringify(receipts, null, 2),
    );
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
