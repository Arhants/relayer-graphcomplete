// PREV-004: real Electron draft previews in both themes (PRD §11.10). It runs
// the fixture-graph-preview harness through the real graph server, harness
// host and Electron render bridge, then checks isolation, cleanup and that the
// preview frames equal the in-app frames of a real 1420×900 product window.
import { app, BrowserWindow, ipcMain, session } from "electron";
import { createHash } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { graphPreviewFixtureFactory } from "@relayer/eval-runner";
import { DRAFT_PREVIEW_FRAMES, createElectronDraftPreviewRenderer } from "../desktop/main/services/draft-preview-renderer.mjs";
import { GraphCompleteRuntimeService } from "../desktop/main/services/graphcomplete-runtime.mjs";
import { RelayerAppServerService } from "../desktop/main/services/relayer-app-server.mjs";
import { createWindowFactory } from "../desktop/main/window.mjs";

const root = resolve(import.meta.dirname, "..");
const rendererDirectory = join(root, "desktop/renderer");
const output = resolve(root, ".relayer/evidence/agent-preview");
const data = mkdtempSync(join(tmpdir(), "relayer-agent-preview-"));
const sourceFiles = [
  "crates/relayer-graph-server/src/draft_preview.rs",
  "crates/relayer-graph-server/src/lib.rs",
  "desktop/main/services/graphcomplete-runtime.mjs",
  "packages/harness-host/src/host.ts",
  "desktop/renderer/src/public-share-viewer/adapter.js",
  "desktop/main/services/draft-preview-renderer.mjs",
  "desktop/main/services/isolated-page-capture.mjs",
  "desktop/renderer/src/draft-preview/main.js",
  "desktop/renderer/src/draft-preview/snapshot.js",
  "desktop/renderer/src/draft-preview/template.js",
  "packages/eval-runner/src/fixtures/graph-preview.ts",
  "scripts/capture-agent-preview-evidence.mjs",
];
const EXPECTED = [DRAFT_PREVIEW_FRAMES.node, DRAFT_PREVIEW_FRAMES.layer, DRAFT_PREVIEW_FRAMES.layer];
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const services = [];
let theme = "light";

app.setPath("userData", join(data, "electron-profile"));
app.on("window-all-closed", () => {});
for (const [channel, value] of Object.entries({
  "relayer:composer-drafts-read": { version: 1, drafts: {} }, "relayer:composer-drafts-write": null,
  "relayer:layer-selections-read": {}, "relayer:layer-selections-remember": {},
  "relayer:account-read": { status: "signed-in", channel: "stable", subject: "fixture|agent-preview" },
  "relayer:share-pending": null, "relayer:provider-status": { adapters: [], definitions: [], hasCompletedOnboarding: true },
  "relayer:tutorial-read": { status: "dismissed", automaticEligible: false },
  "relayer:appearance-read": { appearance: "dark" }, "relayer:appearance-set": { appearance: "dark" },
  "relayer:update-status": { phase: "development", channel: "stable", version: "evidence" },
  "relayer:workspace-layout-read": 0.5, "relayer:workspace-layout-set": null,
})) ipcMain.handle(channel, () => value);

function assert(value, message) { if (!value) throw new Error(message); }
function pngSize(bytes) {
  assert(bytes.subarray(0, 8).toString("hex") === "89504e470d0a1a0a", "Preview is not a PNG");
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}
async function waitFor(label, check, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await check();
    if (value) return value;
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  throw new Error(`Timed out waiting for ${label}.`);
}

async function main() {
  const previewSession = session.fromPartition("draft-preview-capture");
  const runtime = new GraphCompleteRuntimeService({
    userDataDirectory: data,
    graphServerBinary: join(root, "target/debug/relayer-graph-server"),
    configurationPaths: [join(root, "harnesses/fixture-graph-preview.yaml")],
    additionalImplementations: { "fixture.graph-preview": graphPreviewFixtureFactory },
    draftPreviewRenderer: createElectronDraftPreviewRenderer({ BrowserWindow, session, rendererDirectory, getTheme: () => theme }),
    retainDraftPreviews: true,
  });
  services.push(runtime);
  const product = new RelayerAppServerService({
    userDataDirectory: data,
    binaryPath: join(root, "target/debug/relayer-app-server"),
    webDirectory: rendererDirectory,
    permissionCatalogPath: join(root, "permissions/desktop.json"),
    runtimeSession: await runtime.start(),
    allowHarnessOverride: true,
    defaultHarnessConfiguration: "fixture-graph-preview",
  });
  services.push(product);
  const productSession = await product.start();
  const request = async (path, init = {}) => {
    const response = await fetch(new URL(path, productSession.origin), {
      ...init,
      headers: { Accept: "application/json", Cookie: `${productSession.cookie.name}=${productSession.cookie.value}`, ...(init.body ? { "Content-Type": "application/json" } : {}) },
    });
    const value = await response.json();
    if (!response.ok) throw new Error(JSON.stringify(value));
    return value;
  };

  await mkdir(output, { recursive: true });
  const retained = join(data, "graphcomplete-runtime", "draft-previews");
  const captures = [];
  let lastThread;
  for (theme of ["light", "dark"]) {
    const thread = await request("/api/threads", {
      method: "POST",
      body: JSON.stringify({ title: `Draft previews · ${theme}`, initialMessage: "Plan a launch and name its risks.", harnessConfigurationName: "fixture-graph-preview", permissionProfileId: "auto" }),
    });
    const interaction = await waitFor(`accepted ${theme} turn`, async () => {
      const detail = await request(`/api/threads/${thread.id}`);
      const turn = detail.interactions[0];
      if (turn?.completionStatus === "failed") throw new Error(`The ${theme} fixture turn failed: ${JSON.stringify(turn)}`);
      return turn?.completionStatus === "accepted" ? turn : null;
    });
    lastThread = { thread, interaction };
    const folder = join(retained, String(interaction.graphNodeId));
    const names = (await readdir(folder)).sort();
    assert(names.length === 3, `Expected three ${theme} renders, found ${names}`);
    for (const [index, name] of names.entries()) {
      const bytes = await readFile(join(folder, name));
      const size = pngSize(bytes);
      assert(size.width === EXPECTED[index].width && size.height === EXPECTED[index].height, `${name} is ${size.width}×${size.height}`);
      const file = `${theme}-${["node", "layer", "moved-layer"][index]}.png`;
      await cp(join(folder, name), join(output, file));
      captures.push({ theme, file, ...size, bytes: bytes.length, sha256: sha256(bytes) });
    }
    if (theme === "light") {
      await previewSession.cookies.set({ url: "http://127.0.0.1", name: "preview-residue-probe", value: "must-not-survive" });
    } else {
      assert((await previewSession.cookies.get({ name: "preview-residue-probe" })).length === 0, "Preview session storage survived reuse");
    }
  }
  for (const kind of ["node", "layer", "moved-layer"]) {
    const [light, dark] = ["light", "dark"].map((mode) => captures.find(({ file }) => file === `${mode}-${kind}.png`));
    assert(light.sha256 !== dark.sha256, `Theme did not affect the ${kind} preview`);
  }
  assert(BrowserWindow.getAllWindows().length === 0, "A preview render leaked a window");

  // Re-measure the in-app frames in a real 1420×900 product window.
  const window = await createWindowFactory({
    BrowserWindow, desktopDirectory: join(root, "desktop"), getAppearance: () => "dark",
    openExternal: async () => { throw new Error("External navigation is outside this evidence"); },
    updater: { status: () => ({ phase: "development" }) },
  })(productSession);
  await window.webContents.session.cookies.set({ url: productSession.origin, name: productSession.cookie.name, value: productSession.cookie.value, httpOnly: true, sameSite: "strict", secure: false });
  window.setSize(1420, 900);
  window.show();
  await window.loadURL(`${productSession.origin}/?threadId=${lastThread.thread.id}&interactionId=${lastThread.interaction.id}`);
  const js = (expression) => window.webContents.executeJavaScript(expression);
  const rect = (selector) => js(`(() => { const r = document.querySelector(${JSON.stringify(selector)})?.getBoundingClientRect(); return r && r.width ? { width: Math.round(r.width), height: Math.round(r.height) } : null; })()`);
  await waitFor("graph nodes", () => js("document.querySelectorAll('#nodeLayer .graph-node').length === 2"));
  await js("document.querySelector('#nodeLayer .graph-node')?.click()");
  const inspector = await waitFor("Node Details", () => rect("#inspector"));
  await js("document.querySelector('#closeInspector')?.click()");
  await waitFor("closed Node Details", () => js("document.querySelector('#inspector').classList.contains('hidden')"));
  await new Promise((resolveWait) => setTimeout(resolveWait, 500));
  const stage = await rect("#graphStage");
  const inApp = { contentSize: window.getContentSize(), layer: stage, node: inspector };
  window.destroy();
  assert(stage.width === DRAFT_PREVIEW_FRAMES.layer.width && stage.height === DRAFT_PREVIEW_FRAMES.layer.height, `In-app graph pane is ${JSON.stringify(stage)}`);
  assert(inspector.width === DRAFT_PREVIEW_FRAMES.node.width && inspector.height === DRAFT_PREVIEW_FRAMES.node.height, `In-app Node Details is ${JSON.stringify(inspector)}`);

  const receipt = {
    sourceFiles: Object.fromEntries(await Promise.all(sourceFiles.map(async (path) => [path, sha256(await readFile(join(root, path)))]))),
    captures,
    inAppFrames: inApp,
    isolation: "passed",
    windowCleanup: "passed",
    platform: process.platform === "darwin" && process.arch === "arm64" ? "macOS ARM64" : `${process.platform} ${process.arch}`,
    electron: process.versions.electron,
  };
  await writeFile(join(output, "receipt.json"), `${JSON.stringify(receipt, null, 2)}\n`);
  console.log(JSON.stringify({ passed: true, output, receipt }));
}

app.whenReady().then(main).then(() => 0, (error) => { console.error(error); return 1; }).then(async (code) => {
  for (const service of services.reverse()) await service.close?.().catch(() => {});
  await rm(data, { recursive: true, force: true });
  app.exit(code);
});
