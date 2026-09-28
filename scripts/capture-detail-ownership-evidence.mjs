// Inference-free A/B evidence using real authoring clients, Rust storage, and ProductWorkspace.
import { app, BrowserWindow, ipcMain } from "electron";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isDeepStrictEqual } from "node:util";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import * as after from "../packages/graph-client/agent-resource/index.js";
import { GraphCompleteRuntimeService } from "../desktop/main/services/graphcomplete-runtime.mjs";
import { RelayerAppServerService } from "../desktop/main/services/relayer-app-server.mjs";
import { createWindowFactory } from "../desktop/main/window.mjs";

const repositoryRoot = resolve(import.meta.dirname, "..");
if (!process.env.RELAYER_DETAIL_OWNERSHIP_BEFORE) throw new Error("Set RELAYER_DETAIL_OWNERSHIP_BEFORE to the baseline's self-contained graph-client resource");
const beforePath = resolve(process.env.RELAYER_DETAIL_OWNERSHIP_BEFORE);
const baselineReceipt = JSON.parse(await readFile(`${beforePath}.json`, "utf8"));
if (!/^[a-f0-9]{40}$/.test(baselineReceipt.sourceCommit)) throw new Error("Baseline commit required");
execFileSync("git", ["cat-file", "-e", `${baselineReceipt.sourceCommit}^{commit}`]);
if (createHash("sha256").update(await readFile(beforePath)).digest("hex") !== baselineReceipt.sha256) throw new Error("Baseline resource does not match build receipt");
const before = await import(pathToFileURL(beforePath).href);
const outputDirectory = join(resolve(process.env.RELAYER_DETAIL_OWNERSHIP_EVIDENCE || ".relayer/issue557/evidence"), `run-${new Date().toISOString().replaceAll(":", "-")}`);
const dataDirectory = mkdtempSync(join(tmpdir(), "relayer-detail-ownership-"));
const services = [], ipcChannels = [], artifacts = [];
let mainWindow, exitCode = 1, executions = 0, failure;
let manifest = {};
const rendered = [];
app.setName("Relayer detail ownership evidence");
mkdirSync(join(dataDirectory, "electron-profile"), { recursive: true });
app.setPath("userData", join(dataDirectory, "electron-profile"));
app.commandLine.appendSwitch("disable-gpu");
app.on("window-all-closed", () => {});
const titles = ["The short answer", "What the air does", "Why sunsets turn red"];
const pages = [
  '<section><h2>The sky is blue</h2><div class="sky">BLUE LIGHT REACHES YOUR EYES</div><p>Air scatters short wavelengths of sunlight more strongly, filling the daytime sky with blue light.</p></section>',
  '<section><h2>Air redirects sunlight</h2><p>Small molecules scatter short wavelengths much more strongly.</p><div class="blue">BLUE · MORE SCATTERING</div><div class="red">RED · LESS SCATTERING</div><p>Light is redirected in many directions, including toward your eyes.</p></section>',
  '<section><h2>A longer path at sunset</h2><div class="sunset">SUN → LONG PATH THROUGH AIR → YOU</div><p>Much of the blue light scatters out of the direct beam. More red and orange light remains along the sunset path.</p></section>',
];
const style = 'section { display: grid; gap: 20px; padding: 24px; color: #eef5ff; } h2 { font-size: 26px; } p { font-size: 18px; line-height: 1.6; } .sky { padding: 48px 20px; background-color: #1459aa; border-radius: 14px; } .blue { padding: 20px; background-color: #1459aa; width: 90%; } .red { padding: 20px; background-color: #973630; width: 55%; } .sunset { padding: 48px 20px; background-color: #8f391e; border-radius: 14px; }';
const literal = (text) => Object.assign([text], { raw: [text] });
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
function assert(value, message) { if (!value) throw new Error(message); }
async function sourceSnapshot() {
  const baseCommit = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const paths = new Set([
    ...execFileSync("git", ["diff", "--name-only", "HEAD"], { encoding: "utf8" }).trim().split("\n"),
    ...execFileSync("git", ["ls-files", "--others", "--exclude-standard"], { encoding: "utf8" }).trim().split("\n"),
  ].filter((path) => path && !path.startsWith("docs/")));
  const files = [];
  for (const path of [...paths].sort()) files.push({ path, sha256: await readFile(join(repositoryRoot, path)).then(sha256, () => null) });
  const identity = { baseCommit, files };
  return { ...identity, sha256: sha256(JSON.stringify(identity)) };
}
function ownershipFixtureFactory() {
  return () => ({
    traceSupport: () => ({ prompt: "none", messages: "none", reasoningSummaries: "none", modelCalls: "none", toolCalls: "none", usage: "none", childStreams: "none", nativeArtifacts: "none" }),
    state: () => ({}),
    async complete(context) {
      try {
      const phase = executions++ === 0 ? "before" : "after";
      const api = phase === "before" ? before : after;
      const graph = new api.RelayerGraphClient(context.graph.acquireCapability());
      const nodes = titles.map((title, i) => new api.NodeObject("info", title, "Why is the sky blue?", "concept", ["answer", "mechanism", "sunset"][i]));
      const page = api.html(literal(pages[0])), common = api.css(literal(style));
      let rejection;
      try {
        for (const n of nodes) {
          n.detailAuthoring.setComponent("main", page, common);
          await graph.checkpointNodeDetail(n);
        }
      } catch (error) {
        rejection = { message: error.message, issues: error.issues };
      }
      if (phase === "before") assert(!rejection, `Baseline must reproduce shared-template acceptance: ${JSON.stringify(rejection)}`);
      else {
        assert(rejection?.issues?.[0]?.code === "detail_template_owner_mismatch", "Fixed loop must fail on mechanism ownership");
        assert(rejection.message.includes('"mechanism"'), "Must fail at first cross-node reuse");
        assert(nodes[1].detailAuthoring.checkpoint().components.length === 0, "Rejected component must not enter draft");
        for (let i = 0; i < nodes.length; i++) nodes[i].detailAuthoring.setComponent("main", api.html(literal(pages[i])), common);
      }
      const packages = [];
      for (const node of nodes) {
        packages.push(await graph.checkpointNodeDetail(node));
        await graph.submitNode(node);
      }
      const distinct = new Set(packages.map((detail) => detail.integritySha256)).size;
      assert(distinct === (phase === "before" ? 1 : 3), "Unexpected authored package identity count");
      const edges = [];
      for (let i = 1; i < nodes.length; i++) edges.push(await graph.createEdge(nodes[0], nodes[i], `edge-${i}`));
      const layer = new api.LayerObject(nodes, edges, new api.LayerLayoutObject(nodes.map((node, i) => new api.NodePlacementObject(node, .5, .2 + i * .3))), "root");
      await graph.submitLayer(layer);
      await graph.addAction(context.inputGraph.id, { kind: "navigate", relation: "expand", label: "Response", target: layer, clientKey: "response" });
      const result = await graph.submit(context.inputGraph.id);
      const acceptedPackages = result.rootLayer.nodes.map((node) => node.authoredDetail);
      assert(acceptedPackages.length === 3 && acceptedPackages.every((detail, i) => isDeepStrictEqual(detail, packages[i])), "Accepted packages differ from checkpoints");
      artifacts.push({ phase, rejection, distinctPackages: distinct, accepted: true, interactionId: context.inputGraph.id, rootLayerId: result.rootLayer.layer.id, packages: acceptedPackages });
      } catch (error) {
        failure = error.stack || error.message;
        process.stderr.write(`${failure}\n`);
        throw error;
      }
    },
  });
}
function registerIpc(channel, handler) {
  ipcMain.handle(channel, handler);
  ipcChannels.push(channel);
}

function registerProductIpc() {
  let drafts = { version: 1, drafts: {} };
  registerIpc("relayer:composer-drafts-read", () => drafts);
  registerIpc("relayer:composer-drafts-write", (_event, value) => (drafts = value));
  registerIpc("relayer:layer-selections-read", () => ({}));
  registerIpc("relayer:layer-selections-remember", () => ({}));
  registerIpc("relayer:account-read", () => ({ status: "signed-in", channel: "stable", subject: "fixture|detail-ownership" }));
  registerIpc("relayer:share-pending", () => null);
  registerIpc("relayer:provider-status", () => ({ adapters: [], definitions: [], hasCompletedOnboarding: true }));
  registerIpc("relayer:tutorial-read", () => ({ status: "dismissed", automaticEligible: false }));
  registerIpc("relayer:account-login", () => ({ status: "connected" }));
  registerIpc("relayer:account-logout", () => ({ status: "disconnected" }));
  registerIpc("relayer:model-catalog-settings-open", () => null);
  registerIpc("relayer:model-catalog-refresh", () => null);
  registerIpc("relayer:folder-choose", () => null);
  registerIpc("relayer:appearance-read", () => ({ appearance: "dark" }));
  registerIpc("relayer:appearance-set", () => ({ appearance: "dark" }));
  registerIpc("relayer:update-status", () => ({ phase: "development", channel: "stable", version: "evidence" }));
  registerIpc("relayer:update-check", () => ({ phase: "development" }));
  registerIpc("relayer:update-download", () => ({ phase: "development" }));
  registerIpc("relayer:update-install", () => ({ installing: false }));
  registerIpc("relayer:update-channel", () => ({ phase: "development" }));
}

async function productRequest(session, path, init = {}) {
  const response = await fetch(new URL(path, session.origin), {
    ...init,
    headers: {
      Accept: "application/json",
      Cookie: `${session.cookie.name}=${session.cookie.value}`,
      ...(init.body === undefined ? {} : { "Content-Type": "application/json" }),
      ...init.headers,
    },
  });
  const value = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(value.error?.message || JSON.stringify(value));
  return value;
}

async function waitFor(label, check, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await check();
    if (value) return value;
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  }
  throw new Error(`Timed out waiting for ${label}.`);
}

async function pause(milliseconds) {
  await new Promise((resolveWait) => setTimeout(resolveWait, milliseconds));
}

async function waitForWindow(label, expression) {
  return waitFor(label, () => mainWindow.webContents.executeJavaScript(expression));
}

async function run() {
  await mkdir(outputDirectory, { recursive: true });
  manifest = { sourceSnapshot: await sourceSnapshot(), baselineReceipt };
  registerProductIpc();
  const configurationPath = join(repositoryRoot, "harnesses", "fixture-task-system.yaml");
  const runtime = new GraphCompleteRuntimeService({
    userDataDirectory: dataDirectory,
    graphServerBinary: join(repositoryRoot, "target", "debug", "relayer-graph-server"),
    configurationPaths: [configurationPath],
    additionalImplementations: { "fixture.task-system": ownershipFixtureFactory() },
  });
  services.push(runtime);
  const runtimeSession = await runtime.start();
  const product = new RelayerAppServerService({
    userDataDirectory: dataDirectory,
    binaryPath: join(repositoryRoot, "target", "debug", "relayer-app-server"),
    webDirectory: join(repositoryRoot, "desktop", "renderer"),
    permissionCatalogPath: join(repositoryRoot, "permissions", "desktop.json"),
    runtimeSession,
    allowHarnessOverride: true,
    defaultHarnessConfiguration: "fixture-task-system",
  });
  services.push(product);
  const productSession = await product.start();
  const threads = [];
  for (const phase of ["A · Before ownership guard", "B · After rejection and repair"]) {
    const thread = await productRequest(productSession, "/api/threads", { method: "POST", body: JSON.stringify({ title: phase, initialMessage: "Why is the sky blue?", harnessConfigurationName: "fixture-task-system", permissionProfileId: "auto" }) });
    await waitFor("accepted " + phase, async () => {
      const detail = await productRequest(productSession, `/api/threads/${thread.id}`);
      if (detail.interactions[0]?.completionStatus === "failed") throw new Error(JSON.stringify(detail));
      return detail.interactions[0]?.completionStatus === "accepted";
    }, 30000);
    const stored = await productRequest(productSession, `/api/threads/${thread.id}`);
    const acceptedNodes = stored.interactions[0].completionOutput.rootLayer.nodes;
    const artifact = artifacts[threads.length];
    assert(acceptedNodes.length === 3 && acceptedNodes.every((node, i) => isDeepStrictEqual(node.authoredDetail, artifact.packages[i])), "Persisted accepted packages differ from submitted result");
    artifact.persistedPackagesVerified = true;
    threads.push(thread);
  }
  const createWindow = createWindowFactory({
    BrowserWindow,
    desktopDirectory: join(repositoryRoot, "desktop"),
    getAppearance: () => "dark",
    openExternal: async () => { throw new Error("External navigation is outside this fixture"); },
    updater: { status: () => ({ phase: "development" }) },
  });
  mainWindow = await createWindow(productSession);

  mainWindow.setSize(1420, 900);
  mainWindow.show();
  if (process.platform === "darwin") app.focus({ steal: true });
  mainWindow.focus();
  const frames = [];
  for (let phase = 0; phase < 2; phase++) {
    await mainWindow.loadURL(`${productSession.origin}/?threadId=${threads[phase].id}`);
    await waitForWindow("graph nodes", `document.querySelectorAll('.graph-node').length === 3`);
      for (let i = 0; i < titles.length; i++) {
        await mainWindow.webContents.executeJavaScript(`[...document.querySelectorAll('.graph-node')].find(n => n.textContent.includes(${JSON.stringify(titles[i])}))?.click()`);
        await waitForWindow("selected detail", `document.querySelector('#detailTitle')?.textContent === ${JSON.stringify(titles[i])} && !!document.querySelector('.node-detail-runtime-host')?.shadowRoot?.querySelector('h2')`);
        const visual = await mainWindow.webContents.executeJavaScript(`(() => { const root = document.querySelector('.node-detail-runtime-host').shadowRoot; return { heading: root.querySelector('h2').textContent, text: root.textContent }; })()`);
        const heading = visual.heading;
        rendered.push({ phase: phase === 0 ? "before" : "after", title: titles[i], ...visual });
        assert(heading === ["The sky is blue", "Air redirects sunlight", "A longer path at sunset"][phase === 0 ? 0 : i], "Rendered detail differs from accepted fixture");
        await pause(2500);
        const filename = `${phase === 0 ? "before" : "after"}-${i + 1}.png`;
        const bytes = (await mainWindow.webContents.capturePage()).toPNG();
        await writeFile(join(outputDirectory, filename), bytes);
        frames.push({ file: filename, duration: 3, sha256: sha256(bytes) });
      }
      if (phase === 0) {
        // Explicit recording annotation: this is actual tool output, not a product dialog.
        await mainWindow.webContents.executeJavaScript(`(() => {
          const note = document.createElement('div');
          note.style.cssText = 'position:fixed;inset:160px 160px;z-index:99999;background:#182536;color:#edf5ff;padding:40px;border:2px solid #599cf2;border-radius:18px;font:20px/1.6 system-ui;white-space:pre-wrap';
          note.textContent = ${JSON.stringify("Recording annotation · actual authoring API error (B)\n\n" + artifacts[1].rejection.message + "\n\nNext: repair with fresh node-specific HTML, sharing the same CSS.")};
          document.body.append(note);
        })()`);
        await pause(500);
        const bytes = (await mainWindow.webContents.capturePage()).toPNG();
        await writeFile(join(outputDirectory, "rejection.png"), bytes);
        frames.push({ file: "rejection.png", duration: 6, sha256: sha256(bytes) });
      }
  }
  const timeline = frames.map(({ file, duration }) => `file '${file}'\nduration ${duration}\n`).join("") + `file '${frames.at(-1).file}'\n`;
  await writeFile(join(outputDirectory, "timeline.txt"), timeline);
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "concat", "-safe", "0", "-i", join(outputDirectory, "timeline.txt"), "-an", "-r", "30", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", join(outputDirectory, "ownership-a-to-b.mp4")]);
  assert((await sourceSnapshot()).sha256 === manifest.sourceSnapshot.sha256, "Source changed during capture");
  manifest = { ...manifest, rendered, scenario: "issue-557", paidInferenceCalls: 0, sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(), baselineResourceSha256: sha256(await readFile(beforePath)), fixedResourceSha256: sha256(await readFile(join(repositoryRoot, "packages/graph-client/agent-resource/index.js"))), videoSha256: sha256(await readFile(join(outputDirectory, "ownership-a-to-b.mp4"))), frames, artifacts, capture: "A-to-B walkthrough video assembled from verified Electron captures of six production ProductWorkspace selections plus actual tool error in a labelled recording annotation; deterministic fixture, not continuous screen recording or live model behavior" };
  process.stdout.write(`Evidence: ${outputDirectory}\n`);
  exitCode = 0;
}
async function shutdown() {
  mainWindow?.destroy();
  for (const channel of ipcChannels) ipcMain.removeHandler(channel);
  for (const service of services.reverse()) {
    try {
      await service.close();
    } catch (error) {
      process.stderr.write(`${error.stack || error.message}\n`);
      failure ??= error.stack || error.message;
      exitCode = 1;
    }
  }
  await rm(dataDirectory, { recursive: true, force: true });
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(join(outputDirectory, "manifest.json"), JSON.stringify({ ...manifest, status: exitCode === 0 ? "passed" : "failed", cleanupCompleted: !failure, failure, artifacts }, null, 2) + "\n");
  app.exit(exitCode);
}

process.stdout.write("Starting isolated detail-ownership evidence capture...\n");
void app.whenReady()
  .then(run)
  .catch(async (error) => { failure = error.stack || error.message; process.stderr.write(`${failure}\n`); if (mainWindow) { try { await writeFile(join(outputDirectory, "failure.png"), (await mainWindow.webContents.capturePage()).toPNG()); } catch {} } })
  .finally(shutdown);
