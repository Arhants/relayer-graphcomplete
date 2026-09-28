import { app, BrowserWindow, ipcMain } from "electron";
import { mkdirSync, existsSync, readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { taskSystemFixtureFactory } from "@relayer/eval-runner";

import { startModelCatalogRefreshServer } from "../desktop/main/models/model-catalog-refresh-server.mjs";
import { GraphCompleteRuntimeService } from "../desktop/main/services/graphcomplete-runtime.mjs";
import { RelayerAppServerService } from "../desktop/main/services/relayer-app-server.mjs";
import { createWindowFactory } from "../desktop/main/window.mjs";

const repositoryRoot = resolve(import.meta.dirname, "..");
const dataFlag = process.argv.indexOf("--data-dir");
if (dataFlag < 0 || !process.argv[dataFlag + 1]) throw new Error("An explicit retained --data-dir is required.");
const dataDirectory = resolve(process.argv[dataFlag + 1]);
const markerPath = join(dataDirectory, "human-gate.json");
mkdirSync(join(dataDirectory, "electron-profile"), {recursive:true});
app.setName("Relayer PR 536 Human Review");
app.setPath("userData", join(dataDirectory, "electron-profile"));
process.env.RELAYER_TEST_INTERACTION_PERMISSIONS = "1";
delete process.env.RELAYER_FIXTURE_INVOKE_GATE_FILE;
let services;
let closing = false;
let window;
function registerFixtureIpc() {
  // This isolated fixture has no pending network publication attempts.
  ipcMain.handle("relayer:share-pending", () => null);
  let composerDrafts = {};
  ipcMain.handle("relayer:composer-drafts-read", () => composerDrafts);
  ipcMain.handle("relayer:composer-drafts-write", (_event, value) => { composerDrafts = value; return value; });
  ipcMain.handle("relayer:account-read", () => ({ status: "signed-in", channel: "stable", subject: "fixture|interaction-permissions" }));
  ipcMain.handle("relayer:provider-status", () => ({ adapters: [], definitions: [], hasCompletedOnboarding: true }));
  ipcMain.handle("relayer:tutorial-read", () => ({ status: "dismissed", automaticEligible: false }));
  ipcMain.handle("relayer:appearance-read", () => ({ appearance: "dark" }));
  ipcMain.handle("relayer:update-status", () => ({
    phase: "development",
    channel: "stable",
    version: "test",
    availableVersion: null,
    percent: null,
    error: null,
  }));
}

async function productRequest(session, path, init = {}) {
  const response = await fetch(new URL(path, session.origin), {
    ...init,
    headers: {
      Accept: "application/json",
      Cookie: `${session.cookie.name}=${session.cookie.value}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });
  const value = await response.json();
  if (!response.ok) throw new Error(JSON.stringify(value));
  return value;
}

async function startServices(enabled) {
  const started = [];
  try {
  const configurationPath = join(repositoryRoot, "harnesses", "fixture-task-system.yaml");
  const runtimeOptions = {
    userDataDirectory: dataDirectory,
    interactionPermissions: enabled,
    graphServerBinary: join(repositoryRoot, "target", "debug", "relayer-graph-server"),
    configurationPaths: [configurationPath],
    additionalImplementations: { "fixture.task-system": taskSystemFixtureFactory },
    acquireProviderExecution: async (providerId) => ({
      definition: { id: providerId, adapterId: "codex-subscription", accessContract: "managed-runtime@1" },
      descriptor: { adapterId: "codex-subscription", accessContract: "managed-runtime@1", implementationVersion: "1" },
      runtime: { executionAccess: async () => ({ kind: "managed-runtime", environment: {} }) },
      async release() {},
    }),
  };
  const runtime = new GraphCompleteRuntimeService(runtimeOptions);

  started.push(runtime);
  const runtimeSession = await runtime.start();
  let product;
  const catalogSnapshot = {
    providerId: "codex",
    label: "Codex",
    connected: true,
    models: [{
      id: "fixture-model",
      label: "Fixture model",
      order: 0,
      visible: true,
      available: true,
      providerDefault: true,
      metadata: {},
    }],
    systemFamily: { key: "codex", name: "Codex", modelIds: ["fixture-model"] },
  };
  const modelCatalogRefreshServer = await startModelCatalogRefreshServer({
    refresh: () => product.publishProviderCatalog(catalogSnapshot),
  });

  started.push(modelCatalogRefreshServer);
  const productOptions = {
    userDataDirectory: dataDirectory,
    binaryPath: join(repositoryRoot, "target", "debug", "relayer-app-server"),
    webDirectory: join(repositoryRoot, "desktop", "renderer"),
    permissionCatalogPath: join(repositoryRoot, "permissions", "desktop.json"),
    runtimeSession,
    providerCatalogRefreshSession: modelCatalogRefreshServer.session,
    defaultHarnessConfiguration: "fixture-task-system",
    enableReadOnlySession: true,
  };
  product = new RelayerAppServerService(productOptions);

  started.push(product);
  const productSession = await product.start();
  await product.publishProviderCatalog(catalogSnapshot);
  return {runtime, product, productSession, modelCatalogRefreshServer};
  } catch (error) {
    for (const service of started.reverse()) {
      try { await service.close(); } catch (cleanupError) { console.error(cleanupError); }
    }
    throw error;
  }
}
async function closeServices() {
  if (!services) return;
  await services.product.close();
  await services.modelCatalogRefreshServer.close();
  await services.runtime.close();
  services = null;
}
async function run() {
  registerFixtureIpc();
  if (!existsSync(markerPath)) {
    // Author the two occurrences on the legacy gate-off path; conversion must repair them.
    services = await startServices(false);
    const state = await productRequest(services.productSession, "/api/state");
    if (state.threads.length) throw new Error("Unmarked data directory contains threads; use a fresh directory.");
    const family = await productRequest(services.productSession, "/api/model-families", {
      method:"POST", body:JSON.stringify({name:"Fixture models",enabled:true,
        members:[{providerId:"codex",modelId:"fixture-model"}]}),
    });
    await productRequest(services.productSession, "/api/threads", {
      method:"POST", body:JSON.stringify({title:"PR 536 · Interactive permissions review",
        initialMessage:"Show the deterministic task system.",
        harnessId:"fixture-task-system", permissionProfileId:"auto",
        modelSelection:{familyId:family.id,providerId:"codex",modelId:"fixture-model"}}),
    });
    const deadline = Date.now() + 30000;
    let detail;
    while (Date.now() < deadline) {
      const state = await productRequest(services.productSession, "/api/state");
      detail = await productRequest(services.productSession, `/api/threads/${state.threads[0].id}`);
      if (detail.interactions[0].completionStatus === "accepted") break;
      if (detail.interactions[0].completionStatus === "failed") throw new Error(JSON.stringify(detail.interactions[0]));
      await new Promise(resolve => setTimeout(resolve,100));
    }
    if (detail?.interactions[0].completionStatus !== "accepted") throw new Error("Fixture did not accept within 30 seconds.");
    await writeFile(markerPath, JSON.stringify({threadId:detail.thread.id,
      sourceInteractionId:detail.interactions[0].id, seededGate:false},null,2));
    await closeServices();
  }
  services = await startServices(true);
  const createWindow = createWindowFactory({BrowserWindow,
    desktopDirectory:join(repositoryRoot,"desktop"), getAppearance:()=>"dark",
    updater:{status:()=>({phase:"development"})},
    openExternal:async()=>{throw new Error("External navigation is outside this fixture.");}});
  window = await createWindow(services.productSession);
  window.setTitle("Relayer PR 536 — Human Review");
  window.webContents.setBackgroundThrottling(false);
  window.show(); window.focus(); app.focus({steal:true});
  // No keyboard interception or synthetic input. The production renderer owns input.
  process.stdout.write(`HUMAN_GATE_READY ${JSON.stringify({dataDirectory,
    fixture:JSON.parse(readFileSync(markerPath,"utf8")), keyboard:"native, unintercepted",
    reopen:`cd '${repositoryRoot}' && ./node_modules/.bin/electron scripts/run-interaction-permissions-human-gate.mjs --data-dir '${dataDirectory}'`})}\n`);
}
app.on("window-all-closed", () => app.quit());
app.on("before-quit", event => {
  if (closing) return;
  event.preventDefault(); closing = true;
  void closeServices().finally(()=>app.exit(0));
});
void app.whenReady().then(run).catch(async error=>{
  process.stderr.write(`${error.stack || error}\n`);
  await closeServices(); app.exit(1);
});
