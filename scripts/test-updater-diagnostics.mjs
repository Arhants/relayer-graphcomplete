import { app, BrowserWindow } from "electron";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { updaterFailure } from "../desktop/main/services/updater-diagnostics.mjs";

// Real shell and renderer; isolated from accounts, product data and update feeds.
const root = resolve("desktop/renderer");
const evidence = resolve(".relayer/evidence/updater-diagnostics");
const server = createServer(async (request, response) => {
  try {
    const path = resolve(root, `.${new URL(request.url, "http://localhost").pathname}`);
    if (!path.startsWith(root + sep)) throw new Error("Invalid path");
    let content = await readFile(path);
    if (path.endsWith("index.html")) content = content.toString().replace('<script type="module" src="./src/main.js"></script>', "");
    response.setHeader("Content-Type", ({ ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml" })[extname(path)] || "application/octet-stream");
    response.end(content);
  } catch { response.writeHead(404).end(); }
});

async function main() {
  const timer = setTimeout(() => { console.error("Updater renderer proof timed out"); app.exit(1); }, 30_000);
  await new Promise((ready) => server.listen(0, "127.0.0.1", ready));
  await app.whenReady();
  await mkdir(evidence, { recursive: true });
  const window = new BrowserWindow({ width: 1100, height: 700, show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } });
  const evaluate = (source) => window.webContents.executeJavaScript(source);
  const results = [];
  try {
    await window.loadURL(`http://127.0.0.1:${server.address().port}/index.html`);
    await evaluate(`(async () => { document.body.classList.remove('desktop-account-pending');
      document.querySelector('.app-shell').classList.remove('hidden');
      const { setMainView, setSettingsTab } = await import('./src/navigation.js');
      const { initializeSidebar } = await import('./src/sidebar.js');
      initializeSidebar({ body: document.body, toggle: document.querySelector('#collapseSidebar'), mediaQuery: matchMedia('(max-width: 760px)') });
      setSettingsTab('updates'); setMainView('settings');
      document.querySelector('#updatePopover').classList.remove('hidden'); })()`);
    for (const width of [1100, 375]) {
      window.setContentSize(width, 700);
      for (const stage of ["check", "download", "install"]) {
        const state = { phase: "failed", channel: "preview", version: "0.2.35", ...updaterFailure({ code: "ERR_NAME_NOT_RESOLVED" }, stage) };
        await evaluate(`(async () => { const { renderUpdate } = await import('./src/updates.js'); renderUpdate(${JSON.stringify(state)}); await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); })()`);
        const result = await evaluate(`(() => {
          const status = document.querySelector('#updateStatus'), detail = document.querySelector('#updateDetail'), action = document.querySelector('#updateAction');
          const within = element => { const box = element.getBoundingClientRect(); return element.checkVisibility() && box.left >= 0 && box.right <= innerWidth && box.top >= 0 && box.bottom <= innerHeight; };
          return { status: status.textContent, detail: detail.textContent, action: action.textContent, statusVisible: within(status), detailVisible: within(detail), actionVisible: within(action), width: innerWidth, pageWidth: document.documentElement.scrollWidth };
        })()`);
        assert.ok(result.status.includes("ERR_NAME_NOT_RESOLVED") && result.detail.includes("ERR_NAME_NOT_RESOLVED"), "Both surfaces explain the failure");
        assert.ok(result.statusVisible && result.detailVisible && result.actionVisible, "Failure and retry must remain visible");
        assert.equal(result.action, "Try again");
        assert.equal(result.pageWidth, result.width, "No horizontal overflow");
        await writeFile(resolve(evidence, `${width}-${stage}.png`), (await window.webContents.capturePage()).toPNG());
        results.push({ width, stage, ...result });
      }
    }
    await writeFile(resolve(evidence, "results.json"), `${JSON.stringify(results, null, 2)}\n`);
    console.log(`Passed ${results.length} updater renderer scenarios; evidence: ${evidence}`);
  } finally { clearTimeout(timer); window.destroy(); await new Promise((done) => server.close(done)); }
}
main().then(() => app.exit(0), (error) => { console.error(error); app.exit(1); });
