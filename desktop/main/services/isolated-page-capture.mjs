import { createServer } from "node:http";
import { readFile, realpath } from "node:fs/promises";
import { resolve, sep, extname } from "node:path";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";

const STATIC_TYPES = {
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
};

/**
 * Serves one generated page plus the bundled renderer's static files on an
 * ephemeral loopback origin under a random prefix. Nothing else is reachable.
 */
export async function startIsolatedPageServer({ root, prefix, html }) {
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
        !/^(src\/|vendor\/|assets\/|design\/|styles\.css$)/.test(file) ||
        file.includes("..") ||
        file.includes("%")
      ) {
        res.writeHead(404).end();
        return;
      }
      const full = await realpath(resolve(root, file));
      const type = STATIC_TYPES[extname(full)];
      if (!full.startsWith(root + sep) || !type) {
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
  await new Promise((yes, no) => {
    server.once("error", no);
    server.listen(0, "127.0.0.1", yes);
  });
  const origin = `http://127.0.0.1:${server.address().port}`;
  return {
    origin,
    prefix,
    url: origin + prefix + "capture",
    closeAllConnections: () => server.closeAllConnections(),
    close: () => new Promise((done) => server.close(done)),
  };
}

/**
 * Captures a bundled renderer page in a hidden, sandboxed window on a fixed
 * partition: no preload, product IPC, credentials, permissions, downloads,
 * popups, navigation or network beyond the page's own loopback origin.
 * Captures on one partition run one at a time.
 */
export function createIsolatedPageCapture({
  BrowserWindow,
  session,
  rendererDirectory,
  partition,
}) {
  // Resolved on first use: a renderer may be created before Electron is ready.
  let captureSession;
  let previousCapture = Promise.resolve();
  const runCapture = async ({ template, render, size, prepare, maxBytes, signal }) => {
    captureSession ??= session.fromPartition(partition);
    let window;
    let page;
    let deadline;
    const preventDownload = (event) => event.preventDefault();
    const stop = () => {
      if (window && !window.isDestroyed()) window.destroy();
      page?.closeAllConnections();
    };
    const abort = () => stop();
    try {
      const root = await realpath(rendererDirectory);
      // Packaged renderer resources live beside app.asar, not inside it.
      const templateModule = await import(pathToFileURL(resolve(root, template)).href);
      const prefix = `/${randomUUID()}/`;
      const html = render(templateModule, prefix.slice(0, -1));
      // A prior teardown may have failed. Never reuse this fixed partition
      // until Electron confirms its storage is empty.
      await captureSession.clearStorageData();
      signal?.throwIfAborted();
      page = await startIsolatedPageServer({ root, prefix, html });
      const allowed = page.origin + page.prefix;
      captureSession.setPermissionRequestHandler((_wc, _permission, callback) =>
        callback(false),
      );
      captureSession.setPermissionCheckHandler(() => false);
      captureSession.on("will-download", preventDownload);
      captureSession.webRequest.onBeforeRequest((details, callback) =>
        callback({
          cancel: !(
            details.url.startsWith(allowed) ||
            details.url.startsWith("data:") ||
            details.url.startsWith("blob:")
          ),
        }),
      );
      window = new BrowserWindow({
        show: false,
        width: size.width,
        height: size.height,
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
        if (url !== page.url) event.preventDefault();
      });
      window.webContents.on("will-attach-webview", (event) =>
        event.preventDefault(),
      );
      signal?.addEventListener("abort", abort, { once: true });
      signal?.throwIfAborted();
      const work = async () => {
        await window.loadURL(page.url);
        const { clip, output } = await prepare(window);
        signal?.throwIfAborted();
        const image = await window.webContents.capturePage(clip);
        const bytes = image
          .resize({ width: output.width, height: output.height, quality: "best" })
          .toPNG();
        if (!bytes.length || bytes.length > maxBytes)
          throw new Error("Preview too large");
        return { png: new Uint8Array(bytes), ...output };
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
    } finally {
      clearTimeout(deadline);
      signal?.removeEventListener("abort", abort);
      stop();
      await page?.close();
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
