import { app, BrowserWindow } from "electron";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { startEmbedFixtureServer } from "./fixtures/public-share-embed.mjs";

// Input comes only from the zero-inference joined fixture, never a user database.
if (process.env.RELAYER_CAPTURE_ATTACHED_PORTABILITY !== "1") throw new Error("Explicit synthetic capture opt-in required.");
const output = resolve(import.meta.dirname, "../docs/evidence/attached-workflow-rollout");

const shareId = "c".repeat(32);
const host = "document.querySelector('#detailContent [data-node-detail-runtime]')?.shadowRoot";
async function wait(window, label, expression) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    if (await window.webContents.executeJavaScript(expression)) return;
    await new Promise(done => setTimeout(done, 30));
  }
  throw new Error(`Missing ${label}`);
}
app.on("window-all-closed", () => {});
async function main() {
await app.whenReady();
const snapshot = await readFile(resolve(output, "synthetic-snapshot.jsonl"), "utf8");
const fixture = await startEmbedFixtureServer({ editorialSnapshots: [{ shareId, title: "Attached workflow — synthetic snapshot", snapshot }] });
const captures = [];
try {
  for (const theme of ["light", "dark"]) {
    for (const [size, width, height] of [["desktop", 1440, 1000], ["mobile", 375, 812]]) {
      const window = new BrowserWindow({ width, height, useContentSize: true, show: false,
        webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, partition: `attached-portability-${theme}-${size}` } });
      const url = `${fixture.origin}/t/${shareId}?theme=${theme}`;
      const unexpected = [];
      window.webContents.session.webRequest.onBeforeRequest((details, done) => {
        const allowed = details.url.startsWith(fixture.origin + "/") || details.url.startsWith("blob:") || details.url === "about:blank";
        if (!allowed) unexpected.push(details.url);
        done({ cancel: !allowed });
      });
      const openSource = async () => {
        await window.loadURL(url);
        await wait(window, "turn picker", "Boolean(document.querySelector('#turnPickerButton:not(:disabled)'))");
        await window.webContents.executeJavaScript("document.querySelector('#turnPickerButton').click()");
        await wait(window, "source turn", "Boolean(document.querySelector('[data-turn-id=\"turn:1\"]'))");
        await window.webContents.executeJavaScript("document.querySelector('[data-turn-id=\"turn:1\"]').click()");
        await wait(window, "source node", "Boolean(document.querySelector('.graph-node[aria-label=\"Open Source\"]'))");
        await window.webContents.executeJavaScript("document.querySelector('.graph-node[aria-label=\"Open Source\"]').click()");
        await wait(window, "two enabled controls and pinned asset", `${host}?.querySelectorAll('button:not(:disabled)').length === 2 && ${host}?.querySelector('img')?.dataset.assetState === 'available'`);
      };
      try {
        await openSource();
        const geometry = await window.webContents.executeJavaScript(`(() => {
          const buttons = [...${host}.querySelectorAll('button')].map(button => { const r = button.getBoundingClientRect(); return { text: button.textContent, left: r.left, right: r.right, top: r.top, bottom: r.bottom }; });
          return { buttons, viewportWidth: innerWidth, viewportHeight: innerHeight };
        })()`);
        if (geometry.buttons.some(r => r.left < 0 || r.right > geometry.viewportWidth || r.top < 0 || r.bottom > geometry.viewportHeight)) throw new Error(`Controls outside viewport: ${JSON.stringify(geometry)}`);
        const file = `public-${theme}-${size}.png`;
        window.showInactive();
        await window.webContents.executeJavaScript("new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)))");
        const image = (await window.webContents.capturePage()).toPNG();
        await writeFile(resolve(output, file), image);
        for (const [label, destination] of [["Invoked result", "Invoked response"], ["Attached response", "Attached response"]]) {
          await window.webContents.executeJavaScript(`[...${host}.querySelectorAll('button')].find(button => button.textContent === ${JSON.stringify(label)}).click()`);
          await wait(window, `${label} destination`, `Boolean(document.querySelector('.graph-node[aria-label=${JSON.stringify(`Open ${destination}`)}]'))`);
          if (window.webContents.getURL() !== url) throw new Error("Public navigation changed URL");
          await openSource();
        }
        if (unexpected.length) throw new Error(`Unexpected network destinations: ${unexpected.length}`);
        captures.push({ file, theme, size, geometry, sha256: createHash("sha256").update(image).digest("hex"), bothNavigationTargetsPassed: true, externalNetworkRequests: 0 });
      } finally { window.destroy(); }
    }
  }
  await writeFile(resolve(output, "public-captures.json"), JSON.stringify({ snapshotSha256: createHash("sha256").update(snapshot).digest("hex"), captures }, null, 2) + "\n");
  process.stdout.write(JSON.stringify({ passed: true, captures: captures.length, inferenceCalls: 0 }) + "\n");
} finally { await new Promise(done => fixture.server.close(done)); app.quit(); }

}
main().catch(error => { console.error(error); app.exit(1); });
