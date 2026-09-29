import { app, BrowserWindow, nativeTheme } from "electron";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { resolve, relative } from "node:path";
import { startShareActionFixture, actionShareId, actionEvidenceRoot } from "./fixtures/share-action-details.mjs";

if (process.env.RELAYER_CAPTURE_SHARE_ACTION_DETAILS !== "1") throw new Error("Set RELAYER_CAPTURE_SHARE_ACTION_DETAILS=1 for synthetic evidence.");
app.on("window-all-closed", () => {});
const root = resolve(import.meta.dirname, "..");
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const cardHost = `document.querySelector('#detailContent [data-node-detail-runtime]')?.shadowRoot`;
async function waitFor(window, name, expression) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    if (await window.webContents.executeJavaScript(expression)) return;
    await new Promise((done) => setTimeout(done, 30));
  }
  throw new Error(`Missing checkpoint: ${name}`);
}
async function main() {
await app.whenReady();
const fixture = await startShareActionFixture();
const captures = [];
const networkRequests = [];
const failures = [];
try {
  for (const theme of ["light", "dark"]) {
    nativeTheme.themeSource = theme;
    for (const [name, width, height] of [["desktop", 1440, 1000], ["mobile", 375, 812]]) {
      const window = new BrowserWindow({ width, height, useContentSize: true, show: false,
        webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, partition: `share-action-${theme}-${name}` } });
      const url = `${fixture.origin}/t/${actionShareId}?theme=${theme}`;
      window.webContents.session.webRequest.onBeforeRequest((details, done) => {
        networkRequests.push(details.url);
        const allowed = details.url.startsWith(fixture.origin + "/") || details.url.startsWith("blob:") || details.url === "about:blank";
        if (!allowed) failures.push(`Unexpected network destination: ${details.url}`);
        done({ cancel: !allowed });
      });
      try {
        await window.loadURL(url);
        await waitFor(window, "recommendation node", `Boolean(document.querySelector('.graph-node[aria-label="Open Root evidence"]'))`);
        await window.webContents.executeJavaScript(`document.querySelector('.graph-node[aria-label="Open Root evidence"]').click()`);
        await waitFor(window, "styled card with pinned image", `${cardHost}?.querySelector('h2')?.textContent === 'Meet in the middle' && ${cardHost}?.querySelector('img')?.dataset.assetState === 'available'`);
        const geometry = await window.webContents.executeJavaScript(`(() => {
          const card = ${cardHost}.querySelector('article');
          const bounds = card.getBoundingClientRect();
          const style = getComputedStyle(card);
          const button = card.querySelector("button").getBoundingClientRect();
          return { width: bounds.width, left: bounds.left, right: bounds.right, viewport: innerWidth,
            buttonTop: button.top, buttonBottom: button.bottom, viewportHeight: innerHeight,
            scrollWidth: card.scrollWidth, clientWidth: card.clientWidth, color: style.color,
            background: style.backgroundColor, buttonEnabled: !card.querySelector('button').disabled };
        })()`);
        if (geometry.buttonTop < 0 || geometry.buttonBottom > geometry.viewportHeight || !geometry.buttonEnabled || geometry.right > geometry.viewport + 2 || geometry.left < -2 || geometry.scrollWidth > geometry.clientWidth + 2) {
          throw new Error(`Card geometry/control failure: ${JSON.stringify(geometry)}`);
        }
        await window.webContents.executeJavaScript("new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)))");
        const image = (await window.webContents.capturePage()).toPNG();
        const file = `${theme}-${name}.png`;
        await writeFile(resolve(actionEvidenceRoot, file), image);
        await window.webContents.executeJavaScript(`${cardHost}.querySelector('button').click()`);
        await waitFor(window, "embedded button navigates to exact destination", `Boolean(document.querySelector('.graph-node[aria-label="Open Expanded detail"]'))`);
        if (await window.webContents.getURL() !== url) throw new Error("Navigation changed public URL");
        captures.push({ file, theme, width, height, sha256: sha256(image), geometry, embeddedNavigationPassed: true, unchangedUrl: true });
      } finally { window.destroy(); }
    }
  }
  if (failures.length) throw new Error(failures.join("\n"));
  const sourceFiles = new Set([...fixture.servedFiles,
    "scripts/capture-share-action-details-evidence.mjs", "scripts/fixtures/share-action-details.mjs",
    "scripts/fixtures/public-share-embed.mjs", "test/conversation-export-eval-e2e.test.mjs",
    "crates/relayer-app-server/src/conversation_export_service.rs",
    "crates/relayer-app-server/src/conversation_export_service/share_bindings.rs",
    "crates/relayer-graph-core/src/graph/model/node.rs",
    "desktop/renderer/src/public-share-viewer/template.js",
  ]);
  const hashes = Object.fromEntries(await Promise.all([...sourceFiles].sort().map(async (file) => [file, sha256(await readFile(resolve(root, file)))])));
  await writeFile(resolve(actionEvidenceRoot, "manifest.json"), JSON.stringify({
    commit: execFileSync("git", ["rev-parse", "HEAD"], {cwd: root, encoding: "utf8"}).trim(),
    dirty: Boolean(execFileSync("git", ["status", "--porcelain"], {cwd: root, encoding: "utf8"}).trim()),
    fixture: relative(root, resolve(actionEvidenceRoot, "synthetic-snapshot.jsonl")),
    fixtureSha256: sha256(await readFile(resolve(actionEvidenceRoot, "synthetic-snapshot.jsonl"))),
    sourceFiles: hashes, captures, paidInferenceCalls: 0, externalNetworkRequests: 0, requestCount: networkRequests.length,
    humanAcceptance: "pending", hostedPublication: "not run",
  }, null, 2) + "\n");
  process.stdout.write(`PASS: ${captures.length} styled-card, pinned-image and embedded-navigation scenarios. Human acceptance pending.\n`);
} finally {
  await new Promise((done) => fixture.server.close(done));
  app.quit();
}

}
main().catch((error) => { console.error(error); app.exit(1); });
