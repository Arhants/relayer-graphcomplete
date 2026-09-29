import { createServer } from "node:http";
import { readFile, realpath } from "node:fs/promises";
import { resolve, sep, extname } from "node:path";
import { randomUUID } from "node:crypto";
import { renderPublicViewerTemplate } from "../../renderer/src/public-share-viewer/template.js";

/** Capture only the frozen redacted publication, never the live desktop window. */
export function createSharePreviewCapture({
  BrowserWindow,
  session,
  rendererDirectory,
}) {
  const captureSession = session.fromPartition("share-preview-capture");
  let previousCapture = Promise.resolve();
  const runCapture = async ({ snapshotBytes, title, theme, signal }) => {
    if (!["light", "dark"].includes(theme))
      throw new TypeError("Invalid capture theme");
    const prefix = `/${randomUUID()}/`;
    let root;
    let html;
    let window;
    let origin;
    let deadline;
    const preventDownload = (event) => event.preventDefault();
    const server = createServer(async (req, res) => {
      try {
        const path = new URL(req.url, "http://localhost").pathname;
        if (req.method !== "GET" || !path.startsWith(prefix)) {
          res.writeHead(404).end();
          return;
        }
        const file = path.slice(prefix.length);
        if (file === "capture") {
          res
            .writeHead(200, {
              "content-type": "text/html",
              "cache-control": "no-store",
            })
            .end(html);
          return;
        }
        if (
          !/^(src\/|vendor\/|assets\/|styles\.css$)/.test(file) ||
          file.includes("..") ||
          file.includes("%")
        ) {
          res.writeHead(404).end();
          return;
        }
        const full = await realpath(resolve(root, file));
        if (!full.startsWith(root + sep)) {
          res.writeHead(404).end();
          return;
        }
        const type = {
          ".js": "text/javascript",
          ".css": "text/css",
          ".svg": "image/svg+xml",
          ".png": "image/png",
          ".woff2": "font/woff2",
        }[extname(full)];
        if (!type) {
          res.writeHead(404).end();
          return;
        }
        res
          .writeHead(200, { "content-type": type, "cache-control": "no-store" })
          .end(await readFile(full));
      } catch {
        if (!res.headersSent) res.writeHead(404);
        res.end();
      }
    });
    const stop = () => {
      if (window && !window.isDestroyed()) window.destroy();
      server.closeAllConnections();
    };
    const abort = () => stop();
    try {
    root = await realpath(rendererDirectory);
    html = renderPublicViewerTemplate({
      snapshot: snapshotBytes,
      title,
      theme,
      assetBase: prefix.slice(0, -1),
    });
      // A prior teardown may have failed. Never reuse this fixed partition
      // until Electron confirms its storage is empty.
      await captureSession.clearStorageData();
      signal?.throwIfAborted();
      await new Promise((yes, no) => {
        server.once("error", no);
        server.listen(0, "127.0.0.1", yes);
      });
      origin = `http://127.0.0.1:${server.address().port}`;
      captureSession.setPermissionRequestHandler((_wc, _permission, callback) =>
        callback(false),
      );
      captureSession.setPermissionCheckHandler(() => false);
      captureSession.on("will-download", preventDownload);
      captureSession.webRequest.onBeforeRequest((details, callback) =>
        callback({
          cancel: !(
            details.url.startsWith(origin + prefix) ||
            details.url.startsWith("data:") ||
            details.url.startsWith("blob:")
          ),
        }),
      );
      window = new BrowserWindow({
        show: false,
        width: 1200,
        height: 630,
        useContentSize: true,
        webPreferences: {
          session: captureSession,
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
          backgroundThrottling: false,
        },
      });
      window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
      window.webContents.on("will-navigate", (event, url) => {
        if (url !== origin + prefix + "capture") event.preventDefault();
      });
      window.webContents.on("will-attach-webview", (event) =>
        event.preventDefault(),
      );
      signal?.addEventListener("abort", abort, { once: true });
      signal?.throwIfAborted();
      const work = async () => {
        await window.loadURL(origin + prefix + "capture");
        await window.webContents.executeJavaScript(`(async()=>{
      const until=Date.now()+10000;
      while(!document.querySelector('#nodeLayer .graph-node')){if(Date.now()>until)throw new Error('Graph unavailable');await new Promise(r=>setTimeout(r,25));}
      await document.fonts.ready;
      const close=document.querySelector('#closeInspector');if(close&&close.getClientRects().length)close.click();
      await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
      document.querySelector('#fitGraph').click();
      await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
    })()`);
        signal?.throwIfAborted();
        const image = await window.webContents.capturePage({
          x: 0,
          y: 0,
          width: 1200,
          height: 630,
        });
        const bytes = image
          .resize({ width: 1200, height: 630, quality: "best" })
          .toPNG();
        if (!bytes.length || bytes.length > 4 * 1024 * 1024)
          throw new Error("Preview too large");
        return new Uint8Array(bytes);
      };
      return await Promise.race([
        work(),
        new Promise((_, reject) => {
          deadline = setTimeout(() => {
            stop();
            reject(new Error("Preview capture timed out"));
          }, 15000);
        }),
      ]);
    } catch (error) {
      signal?.throwIfAborted();
      throw Object.assign(new Error("Share preview capture failed"), {
        code: "share_export_failed",
        failureStage: "export",
        cause: error,
      });
    } finally {
      clearTimeout(deadline);
      signal?.removeEventListener("abort", abort);
      stop();
      await new Promise((resolve) => server.close(resolve));
      captureSession.setPermissionRequestHandler(null);
      captureSession.setPermissionCheckHandler(null);
      captureSession.removeListener("will-download", preventDownload);
      captureSession.webRequest.onBeforeRequest(null);
      await captureSession.clearStorageData();
    }
  };
  return function capture(input) {
    const pending = previousCapture.then(() => runCapture(input));
    previousCapture = pending.catch(() => {});
    return pending;
  };
}
