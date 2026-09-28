import { app, BrowserWindow, session } from "electron";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { startEmbedFixtureServer, repositoryRoot, sharePath } from "./fixtures/public-share-embed.mjs";

if (process.env.RELAYER_CAPTURE_PUBLIC_SHARE_EMBED_EVIDENCE !== "1") {
  throw new Error("Set RELAYER_CAPTURE_PUBLIC_SHARE_EMBED_EVIDENCE=1 to run the local iframe proof.");
}
const output = resolve(repositoryRoot, ".relayer/evidence/issue-558-embed-slice-one");
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");

async function waitFor(frame, expression) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (await frame.executeJavaScript(expression)) return;
    await new Promise((done) => setTimeout(done, 40));
  }
  throw new Error(`Condition did not become true: ${expression}`);
}

async function main() {
  await mkdir(output, { recursive: true });
  const fixture = await startEmbedFixtureServer();
  const requests = [];
  const errors = [];
  const knownDiagnostics = [];
  const assertions = {};
  const captures = [];
  const partition = "embed-slice-one-evidence";
  session.fromPartition(partition).webRequest.onBeforeRequest({ urls: ["*://*/*"] }, (details, callback) => {
    requests.push({ url: details.url, type: details.resourceType });
    callback({ cancel: new URL(details.url).origin !== fixture.origin });
  });
  const window = new BrowserWindow({ width: 1440, height: 1100, useContentSize: true, show: false,
    webPreferences: { partition, sandbox: true, nodeIntegration: false, contextIsolation: true } });
  window.webContents.on("console-message", (details) => {
    if (details.message === "The Content Security Policy directive 'frame-ancestors' is ignored when delivered via a <meta> element.") {
      knownDiagnostics.push(details.message); // Existing template; HTTP header owns framing.
    } else if (details.level === "error") errors.push(details.message);
  });
  let openedUrl;
  window.webContents.setWindowOpenHandler(({ url }) => { openedUrl = url; return { action: "deny" }; });
  try {
    await window.loadURL(`${fixture.origin}/`);
    await waitFor(window.webContents.mainFrame, "Boolean(document.querySelector('iframe')?.contentDocument?.querySelector('.graph-node'))");
    const frame = window.webContents.mainFrame.frames.find((candidate) => candidate.url.endsWith("/embed"));
    if (!frame) throw new Error("The production viewer did not load in an iframe.");
    const run = (expression) => frame.executeJavaScript(expression);
    const check = async (name, expression) => {
      const actual = await run(expression);
      if (actual !== true) throw new Error(`${name}: ${JSON.stringify(actual)}`);
      assertions[name] = true;
    };
    const click = async (selector) => run(`(() => { const element = document.querySelector(${JSON.stringify(selector)}); if (!element) throw new Error('Missing rendered control'); element.click(); return true; })()`);
    const selected = async () => { await click('[data-node="node:root-1"]'); await waitFor(frame, "!document.querySelector('#inspector').classList.contains('hidden')"); };
    const capture = async (name) => {
      await run("new Promise(done => requestAnimationFrame(() => requestAnimationFrame(() => done(true))))");
      const bytes = (await window.webContents.capturePage()).toPNG();
      await writeFile(resolve(output, `${name}.png`), bytes);
      captures.push({ file: `${name}.png`, sha256: hash(bytes) });
    };
    await check("firstAcceptedTurn", "document.querySelector('#turnPickerButton').textContent.trim() === 'Turn 1 of 5'");
    await check("embedChromeOnly", "!document.querySelector('.public-share-download-card') && !document.querySelector('.environment-panel') && Boolean(document.querySelector('.public-share-embed-branding a'))");
    await capture("article-overview");
    await selected();
    await waitFor(frame, "Boolean(document.querySelector('[data-action-id=\"action:completed\"]'))");
    await run("new Promise(done => requestAnimationFrame(() => requestAnimationFrame(() => done(true))))");
    await check("graphRemainsVisibleAfterSplit", `(() => {
      const stage = document.querySelector('#graphStage').getBoundingClientRect();
      return [...document.querySelectorAll('.graph-node')].every(node => {
        const r = node.getBoundingClientRect();
        return r.left >= stage.left && r.right <= stage.right && r.top >= stage.top && r.bottom <= stage.bottom;
      });
    })()`);
    const geometry = await run(`(() => {
      const box = selector => { const r = document.querySelector(selector).getBoundingClientRect(); return { x:r.x, y:r.y, width:r.width, height:r.height, right:r.right, bottom:r.bottom }; };
      return { graph:box('.graph-column'), details:box('#inspector'), viewport:{width:innerWidth,height:innerHeight} };
    })()`);
    if (Math.abs(geometry.graph.width - geometry.details.width) > 1 || geometry.graph.width < 300
      || geometry.graph.right > geometry.details.x || geometry.details.right > geometry.viewport.width
      || geometry.details.bottom > geometry.viewport.height + 1) throw new Error(`Invalid split: ${JSON.stringify(geometry)}`);
    assertions.equalVisibleColumns = true;
    await check("inputControlsDisabled", "document.querySelectorAll('#nodeInputActions button').length > 0 && [...document.querySelectorAll('#nodeInputActions button')].every(button => button.disabled)");
    await check("unexecutedInvokeDisabled", "document.querySelector('[data-action-id=\"action:unexecuted\"]').disabled");
    await capture("node-details-split");
    await click('#closeInspector');
    await waitFor(frame, "document.querySelector('#inspector').classList.contains('hidden')");
    await run("new Promise(done => requestAnimationFrame(() => requestAnimationFrame(() => done(true))))");
    await check("closingDetailsRestoresGraphWidth", `(() => {
      const graph=document.querySelector('.graph-column').getBoundingClientRect();
      const workspace=document.querySelector('.thread-workspace').getBoundingClientRect();
      return Math.abs(graph.width-workspace.width)<1 && [...document.querySelectorAll('.graph-node')].every(node => {
        const r=node.getBoundingClientRect();return r.left>=graph.left && r.right<=graph.right && r.top>=graph.top && r.bottom<=graph.bottom;
      });
    })()`);
    await selected();
    await waitFor(frame, "Boolean(document.querySelector('[data-action-id=\"action:completed\"]'))");
    await click('[data-action-id="action:unexecuted"]');
    await check("unexecutedInvokeDidNotNavigate", "document.querySelector('#turnPickerButton').textContent.trim() === 'Turn 1 of 5'");
    await click('[data-action-id="action:details-1"]');
    await waitFor(frame, "Boolean(document.querySelector('[data-node=\"node:details-1\"]'))");
    assertions.expansionReachedNestedLayer = true;
    await click('#nextTurn');
    await waitFor(frame, "document.querySelector('#turnPickerButton').textContent.trim() === 'Turn 2 of 5'");
    await click('[data-node="node:root-2"]');
    await waitFor(frame, "Boolean(document.querySelector('[data-action-id=\"action:prior-reference\"]'))");
    await click('[data-action-id="action:prior-reference"]');
    await waitFor(frame, "Boolean(document.querySelector('[data-node=\"node:details-1\"]'))");
    await check("priorTurnReferenceWithinAcceptedClosure", "document.querySelector('#turnPickerButton').textContent.trim() === 'Turn 2 of 5'");
    await click('#previousTurn');
    await selected();
    await click('[data-action-id="action:completed"]');
    await waitFor(frame, "Boolean(document.querySelector('[data-node=\"node:root-2\"]')) && document.querySelector('#turnPickerButton').textContent.trim() === 'Turn 2 of 5'");
    assertions.completedInvokeOpenedAcceptedResult = true;
    await check("mutationControlsUnavailable", "['#threadComposerShell','#approvalDock','#annotationPanel','#nodeContextDock'].every(selector => {const e=document.querySelector(selector);return !e || getComputedStyle(e).display === 'none';})");
    await check("frameUrlUnchanged", `location.href === ${JSON.stringify(`${fixture.origin}${sharePath}/embed`)}`);
    if (window.webContents.getURL() !== `${fixture.origin}/`) throw new Error("Parent URL changed");
    assertions.parentUrlUnchanged = true;
    await check("fullGraphLinkSafe", `(() => {const a=document.querySelector('.public-share-embed-branding a');return a.getAttribute('href')===${JSON.stringify(sharePath)} && a.target==='_blank' && a.rel.includes('noopener') && a.rel.includes('noreferrer');})()`);
    await click('.public-share-embed-branding a');
    await waitFor(window.webContents.mainFrame, "true");
    if (openedUrl !== `${fixture.origin}${sharePath}`) throw new Error(`Full graph opened wrong destination: ${openedUrl}`);
    assertions.fullGraphRequestedNewWindow = true;
    await window.loadURL(`${fixture.origin}/`);
    await waitFor(window.webContents.mainFrame, "document.querySelector('iframe')?.contentDocument?.querySelector('#turnPickerButton')?.textContent.trim() === 'Turn 1 of 5'");
    assertions.reloadResetFirstTurn = true;
    const unexpected = requests.filter(({ url, type }) => new URL(url).origin !== fixture.origin || ["xhr", "webSocket", "ping"].includes(type));
    if (unexpected.length) throw new Error(`Unexpected requests: ${JSON.stringify(unexpected)}`);
    assertions.noOutboundOrApiRequests = true;
    if (errors.length) throw new Error(`Browser errors: ${JSON.stringify(errors)}`);
    const sourcePaths = [...new Set([...fixture.servedFiles, "desktop/renderer/src/public-share-viewer/template.js",
      "scripts/fixtures/public-share-embed.mjs", "scripts/capture-public-share-embed-evidence.mjs",
      "docs/evidence/issue-471-public-share-viewer/synthetic-snapshot.jsonl"])].sort();
    const sourceFiles = {};
    for (const path of sourcePaths) sourceFiles[path] = hash(await readFile(resolve(repositoryRoot, path)));
    const manifest = { schemaVersion: 1, evidence: "issue-558-embed-slice-one", scope: "Local wide iframe; not hosted or mobile proof",
      source: { commit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: repositoryRoot, encoding: "utf8" }).trim(), sourceFiles, digest: hash(JSON.stringify(sourceFiles)) },
      fixture: { sha256: hash(fixture.snapshot), kind: "synthetic" }, browser: { electron: process.versions.electron, viewport: { width:1440,height:1100 }, geometry, assertions, requests, errors, knownDiagnostics }, captures };
    await writeFile(resolve(output, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
    console.log(`Passed ${Object.keys(assertions).length} iframe checkpoints. Evidence: ${output}`);
  } finally {
    window.destroy();
    await new Promise((done) => fixture.server.close(done));
  }
}
app.whenReady().then(main).then(() => app.quit()).catch(error => { console.error(error); app.exit(1); });
