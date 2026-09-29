// Isolated, inference-free fixture driver for the actual development desktop entry point.
import { app, BrowserWindow } from "electron";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { execFileSync } from "node:child_process";
import { taskSystemFixtureFactory } from "@relayer/eval-runner";
import { GraphCompleteRuntimeService } from "../desktop/main/services/graphcomplete-runtime.mjs";
import { RelayerAppServerService } from "../desktop/main/services/relayer-app-server.mjs";
import { ModelCatalogService } from "../desktop/main/models/model-catalog-service.mjs";

const root = resolve(import.meta.dirname, "..");
const profile = join(root, ".relayer", `legacy-compatibility-review-${Date.now()}`);
const output = join(root, ".relayer", "legacy-compatibility-evidence");
await mkdir(profile, { recursive: true });
await mkdir(output, { recursive: true });
process.env.RELAYER_DESKTOP_USER_DATA_DIR = profile;
await writeFile(join(profile, "desktop-settings.json"), JSON.stringify({ tutorial: { version: 1, status: "dismissed" } }));

let product;
let productSession;
let fixtureCalls = 0;
const startRuntime = GraphCompleteRuntimeService.prototype.start;
GraphCompleteRuntimeService.prototype.start = function () {
  // Native Ladybug initialization competes with the full deterministic suite on
  // this review host. Give startup a bounded review-only budget and retain timing.
  this.startupTimeoutMs = 60_000;
  const spawn = this.spawnProcess;
  this.spawnProcess = (...args) => {
    const started = Date.now();
    const child = spawn(...args);
    child.stdout?.once("data", () => console.log(`GRAPH_STARTUP_OUTPUT after ${Date.now() - started}ms`));
    child.stderr?.on("data", data => console.error(`GRAPH_STARTUP_STDERR ${String(data)}`));
    child.once("exit", (code, signal) => console.log(`GRAPH_EXIT ${code} ${signal}`));
    return child;
  };
  this.additionalImplementations = { "codex.basic": (context) => {
    const fixture = taskSystemFixtureFactory(context);
    const complete = fixture.complete.bind(fixture);
    fixture.complete = async (...args) => { fixtureCalls++; try { return await complete(...args); } catch (error) { console.error("FIXTURE_ERROR", error); throw error; } };
    return fixture;
  } };
  this.validateHarnessRuntime = async () => true;
  this.coordinateHarnessReadiness = false;
  this.acquireProviderExecution = async (providerId) => {
    const secret = providerId !== "codex";
    const adapterId = secret ? "openrouter" : "codex-subscription";
    const accessContract = secret ? "secret@1" : "managed-runtime@1";
    return {
      definition: { id: providerId, adapterId, accessContract, ...(secret ? { endpoint: "https://fixture.invalid/v1" } : {}) },
      descriptor: { adapterId, accessContract, implementationVersion: "1" },
      runtime: { async executionAccess() { return secret ? { kind: "secret", endpoint: "https://fixture.invalid/v1", fields: { "api-key": "inert-fixture" } } : { kind: "managed-runtime", environment: {} }; } },
      async release() {},
    };
  };
  return startRuntime.call(this);
};
const startProduct = RelayerAppServerService.prototype.start;
RelayerAppServerService.prototype.start = async function () {
  this.startupTimeoutMs = 60_000;
  const session = await startProduct.call(this);
  product = this;
  productSession = session;
  return session;
};
// Do not consult user accounts or network model catalogs in this fixture process.
ModelCatalogService.prototype.startup = async () => [];
ModelCatalogService.prototype.refresh = async () => null;
ModelCatalogService.prototype.beforeInference = async () => [];

async function request(path, body, method = "POST") {
  const response = await fetch(new URL(path, productSession.origin), {
    method: body === undefined ? "GET" : method,
    headers: { Cookie: `${productSession.cookie.name}=${productSession.cookie.value}`, "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const value = await response.json();
  if (!response.ok) throw new Error(`${path}: ${response.status} ${JSON.stringify(value)}`);
  return value;
}
async function waitFor(check, label) {
  for (let i = 0; i < 400; i++) { const result = await check(); if (result) return result; await new Promise(r => setTimeout(r, 100)); }
  throw new Error(`Timed out: ${label}`);
}
function catalog(id, models) {
  return { provider: { id, label: id === "legacy-openrouter" ? "OpenRouter (fixture)" : "Unavailable original provider (fixture)", status: "available", unavailableReason: null },
    models: models.map((model, position) => ({ id: model, catalogId: model, executionModel: model, label: model, description: "Deterministic fixture; no inference", visible: true, availability: "available", unavailableReason: null, unavailableReasonCode: null, availabilityNotice: null, isDefault: position === 0, replacementModelId: null, upgradeInfo: null, supportedEfforts: [], defaultEffort: null, inputModalities: ["text"], supportsPersonality: false, serviceTiers: [], defaultServiceTier: null, catalogSource: "legacy-compatibility-fixture" })),
    systemFamily: { id: `${id}-reported`, label: "Legacy fixture models", modelIds: models } };
}
async function seed(window) {
  await product.seedProviderCatalog({ providerId: "codex", label: "Codex Personal (fixture)", connected: true, models: [{ id: "gpt-fixture", label: "Foreign Codex choice", order: 0, visible: true, available: true, providerDefault: true, metadata: {} }], systemFamily: { key: "codex", name: "Codex", modelIds: ["gpt-fixture"] } });
  for (const id of ["legacy-openrouter", "legacy-unavailable"]) await product.providerDefinitionStore().createWithCatalog({ id, adapterId: "openrouter", label: id, endpoint: "https://fixture.invalid/v1", accessContract: "secret@1", credentialReference: `provider:${id}`, lifecycleState: "active", removedAt: null }, catalog(id, ["openai/gpt-fixture", "openai/gpt-compatible"]));
  const families = {};
  for (const id of ["legacy-openrouter", "legacy-unavailable"]) families[id] = await request("/api/model-families", { name: id === "legacy-openrouter" ? "Codex Basic" : "Codex Basic (unavailable)", enabled: true, members: [{ providerId: id, modelId: "openai/gpt-fixture" }, { providerId: id, modelId: "openai/gpt-compatible" }, { providerId: "codex", modelId: "gpt-fixture" }] });
  const ids = [];
  for (const [id, title] of [["legacy-openrouter", "Legacy: compatible choices and preserved history"], ["legacy-unavailable", "Legacy: no compatible route available"]]) {
    const created = await request("/api/threads", { title, initialMessage: "Keep the original decision: use the second option and preserve attached context. This is representative legacy history.", harnessId: "codex-basic", permissionProfileId: "auto", modelSelection: { familyId: families[id].id, providerId: id, modelId: "openai/gpt-fixture" } });
    ids.push(created.id);
    await waitFor(async () => { const detail = await request(`/api/threads/${created.id}`); const last = detail.interactions.at(-1); if (last?.completionStatus === "failed" || (last?.completionStatus === "not_started" && last?.attempts?.length)) throw new Error(JSON.stringify(last)); return last?.completionStatus === "accepted"; }, "fixture accepted graph");
  }
  // Fixture-only historical migration: reproduce failed foreign selections without
  // sending them through today's guarded API. No production profile is opened.
  const sql = `INSERT INTO interactions(thread_id,sequence,text,created_at,completion_status,harness_configuration_name,model_provider_id,provider_model_id,model_family_id,completion_error) VALUES (${ids[0]},2,'Failed foreign-provider attempt. Keep this input in history.','2','failed','codex-basic','codex','gpt-fixture',${families['legacy-openrouter'].id},'Historical missing native session'); UPDATE model_providers SET connected=0 WHERE id='legacy-unavailable';`;
  const db = join(profile, "product-data", "product.sqlite3");
  execFileSync("sqlite3", [db, sql]);
  await window.webContents.executeJavaScript(`localStorage.setItem('relayerDesktopAccountOnboardingV1', 'skipped')`);
  const url = new URL(productSession.origin);
  url.searchParams.set("threadId", ids[0]);
  await window.loadURL(url.href);
  await waitFor(() => window.webContents.executeJavaScript(`document.querySelector('.model-control-ongoing [data-model-picker-trigger]') !== null`), "actual conversation picker");
  await window.webContents.executeJavaScript(`document.querySelector('.model-control-ongoing [data-model-picker-trigger]').click()`);
  window.setTitle("Relayer Dev — Legacy compatibility review");
  window.show(); window.focus(); app.focus({ steal: true });
  await writeFile(join(output, "identity.json"), JSON.stringify({ app: app.getName(), pid: process.pid, source: root, profile, route: url.href, threadIds: ids, fixtureCalls, inference: false, entryPoint: "desktop/main/index.mjs" }, null, 2));
  await writeFile(join(output, "compatible.png"), (await window.webContents.capturePage()).toPNG());
  console.log(`LEGACY_REVIEW_READY ${JSON.stringify({ route: url.href, threadIds: ids, profile, source: root, pid: process.pid })}`);
}
void import("../desktop/main/index.mjs").then(async () => {
await app.whenReady();
const window = await waitFor(() => BrowserWindow.getAllWindows().find(w => !w.isDestroyed() && w.webContents.getURL().startsWith("http://127.0.0.1:")), "Relayer Dev main window");
await waitFor(() => productSession && !window.webContents.isLoading(), "desktop startup");
try { await seed(window); } catch (error) { console.error(error); await writeFile(join(output, "failure.txt"), String(error.stack ?? error)); }

});
