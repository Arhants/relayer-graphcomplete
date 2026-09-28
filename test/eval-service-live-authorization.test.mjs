import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";
import { EvalService } from "../desktop/eval-main/eval-service.mjs";
import { createSyntheticExternalCatalog } from "../packages/eval-runner/test/fixtures/external-catalog.ts";

const repositoryRoot = resolve(import.meta.dirname, "..");
const directories = [];
const externalCaseIds = ["fixture.external-a", "fixture.external-b"];
const externalSuiteId = "synthetic-external-suite";
const providerReference = "connected-product-provider";
const originalFetch = globalThis.fetch;
const directoriesForFixture = () => [
  join(repositoryRoot, "harnesses", "fixture-task-system.yaml"),
  join(repositoryRoot, "harnesses", "codex-basic.yaml"),
  join(repositoryRoot, "harnesses", "codex-layered-navigation-luna.yaml"),
];

afterEach(async () => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
  for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true });
});

describe("EvalService live external authorization", () => {
  it.each([
    ["individual", { testCaseIds: [externalCaseIds[0]] }],
    ["suite", { suiteId: externalSuiteId }],
  ])("rejects an external live %s before queueing without exact authorization", async (_kind, caseSelection) => {
    const { service, validateLiveCredential } = await openService();
    const selection = liveSelection({ ...caseSelection, includeAuthorization: false });

    await expect(service.createRun(selection)).rejects.toThrow("External live Eval requires confirmation");
    expect(service.listRuns()).toEqual([]);
    expect(validateLiveCredential).not.toHaveBeenCalled();
  });

  it("rejects a suite whose authorization binds a different resolved member order", async () => {
    const { service, validateLiveCredential } = await openService();
    const selection = liveSelection({ suiteId: externalSuiteId });
    selection.liveAuthorization = authorization({
      testCaseIds: [...externalCaseIds].reverse(),
    });

    await expect(service.createRun(selection)).rejects.toThrow("bound to the resolved cases");
    expect(service.listRuns()).toEqual([]);
    expect(validateLiveCredential).not.toHaveBeenCalled();
  });

  it.each([undefined, 0, Number.NaN])("requires a positive declared cap before live admission (%s)", async (declaredCostCapUsd) => {
    const { service, validateLiveCredential } = await openService();
    const selection = liveSelection({ testCaseIds: [externalCaseIds[0]] });
    selection.liveAuthorization = authorization();
    if (declaredCostCapUsd === undefined) delete selection.liveAuthorization.declaredCostCapUsd;
    else selection.liveAuthorization.declaredCostCapUsd = declaredCostCapUsd;

    await expect(service.createRun(selection)).rejects.toThrow("declared positive USD cost cap");
    expect(service.listRuns()).toEqual([]);
    expect(validateLiveCredential).not.toHaveBeenCalled();
  });

  it.each(["missing validator", "disconnected credential"])("fails closed before queueing when the trusted credential check is %s", async (mode) => {
    const validateLiveCredential = mode === "missing validator"
      ? undefined
      : vi.fn(async () => { throw new Error("credential disconnected"); });
    const { service } = await openService({ validateLiveCredential });

    await expect(service.createRun(liveSelection({ testCaseIds: [externalCaseIds[0]] })))
      .rejects.toThrow(mode === "missing validator" ? "no trusted credential validator" : "credential disconnected");
    expect(service.listRuns()).toEqual([]);
  });

  it("persists the exact suite authorization and validates Codex for a paid judge over a deterministic fixture", async () => {
    const validateLiveCredential = vi.fn(async () => {});
    const { service } = await openService({
      validateLiveCredential,
      simulatedUserJudgeRunner: async () => ({ status: "failed", error: "Synthetic judge fixture." }),
    });
    const selection = liveSelection({
      suiteId: externalSuiteId,
      harnessConfigurationNames: ["fixture-task-system"],
      judgeConfigurationName: "simulated-user",
    });
    const created = await service.createRun(selection);
    const completed = await waitForTerminal(service, created.id);
    expect(completed.executions[0].turns).not.toHaveLength(0);

    expect(validateLiveCredential).toHaveBeenCalledOnce();
    expect(validateLiveCredential).toHaveBeenCalledWith(
      { name: "simulated-user", implementation: "codex.basic" },
      providerReference,
    );
    expect(completed.testCaseIds).toEqual(externalCaseIds);
    expect(completed.liveAuthorization).toEqual(authorization({
      testCaseIds: externalCaseIds,
      harnessConfigurationNames: ["fixture-task-system"],
      judgeConfigurationName: "simulated-user",
    }));
    const stored = JSON.parse(await readFile(service.stateFile, "utf8"));
    expect(stored.runs[0].liveAuthorization).toEqual(completed.liveAuthorization);
  });

  it("pins the credential-validated provider route into every matching external execution", async () => {
    const pinnedModelResolution = {
      selectedModel: {
        harnessId: "codex-basic",
        familyId: 7,
        providerId: "codex",
        modelId: "gpt-6-sol",
      },
      productModelSelection: true,
    };
    const validateLiveCredential = vi.fn(async () => pinnedModelResolution);
    const { service, product } = await openService({ validateLiveCredential });

    const created = await service.createRun(liveSelection({ testCaseIds: [externalCaseIds[0]] }));
    const completed = await waitForTerminal(service, created.id);

    expect(validateLiveCredential).toHaveBeenCalledWith(
      expect.objectContaining({ name: "codex-basic", implementation: "codex.basic" }),
      providerReference,
    );
    expect(completed.executions[0]).toMatchObject({
      pinnedModelResolution,
      modelResolution: pinnedModelResolution,
    });
    const threadRequest = product.mock.calls.find(([url, options]) => (
      new URL(url).pathname === "/api/threads" && options?.method === "POST"
    ));
    expect(JSON.parse(threadRequest[1].body)).toMatchObject({
      harnessConfigurationName: "codex-basic",
      modelSelection: {
        familyId: 7,
        providerId: "codex",
        modelId: "gpt-6-sol",
      },
    });
  });

  it("preserves the admitted configuration-owned Codex model without a product selection override", async () => {
    const pinnedModelResolution = {
      selectedModel: null,
      productModelSelection: false,
      configurationModel: "gpt-5.6-luna",
    };
    const validateLiveCredential = vi.fn(async () => pinnedModelResolution);
    const { service, product } = await openService({ validateLiveCredential });

    const created = await service.createRun(liveSelection({
      testCaseIds: [externalCaseIds[0]],
      harnessConfigurationNames: ["codex-layered-navigation-luna"],
    }));
    const completed = await waitForTerminal(service, created.id);

    expect(validateLiveCredential).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "codex-layered-navigation-luna",
        implementation: "codex.basic",
        settings: { model: "gpt-5.6-luna", modelReasoningEffort: "medium", promptProfile: "layered-navigation-v1", skipGitRepoCheck: true },
      }),
      providerReference,
    );
    expect(completed.executions[0]).toMatchObject({
      pinnedModelResolution,
      modelResolution: pinnedModelResolution,
    });
    const threadRequest = product.mock.calls.find(([url, options]) => (
      new URL(url).pathname === "/api/threads" && options?.method === "POST"
    ));
    const threadBody = JSON.parse(threadRequest[1].body);
    expect(threadBody.harnessConfigurationName).toBe("codex-layered-navigation-luna");
    expect(threadBody).not.toHaveProperty("modelSelection");
  });

  it("rejects a credential route that would omit its selected model before queueing", async () => {
    const validateLiveCredential = vi.fn(async () => ({
      selectedModel: {
        harnessId: "codex-basic",
        providerId: "codex",
        modelId: "gpt-6-sol",
      },
      productModelSelection: false,
    }));
    const { service, product } = await openService({ validateLiveCredential });

    await expect(service.createRun(liveSelection({ testCaseIds: [externalCaseIds[0]] })))
      .rejects.toThrow("did not resolve an exact provider model route");
    expect(service.listRuns()).toEqual([]);
    expect(product.mock.calls.some(([url]) => new URL(url).pathname === "/api/threads")).toBe(false);
  });

  it("keeps an external deterministic fixture run exempt from live authorization", async () => {
    const validateLiveCredential = vi.fn(async () => {});
    const { service } = await openService({ validateLiveCredential });
    const created = await service.createRun({
      testCaseIds: [externalCaseIds[0]],
      harnessConfigurationNames: ["fixture-task-system"],
      judgeConfigurationName: "deterministic-graph-contract",
    });
    const completed = await waitForTerminal(service, created.id);

    expect(completed.liveAuthorization).toBeNull();
    expect(validateLiveCredential).not.toHaveBeenCalled();
  });

  it("requires fresh auth for an external live rejudge even after the catalog is absent", async () => {
    const validateLiveCredential = vi.fn(async () => {});
    const simulatedUserJudgeRunner = vi.fn(async () => ({ status: "failed", error: "Synthetic judge fixture." }));
    const { service, stateFile, product } = await openService({ validateLiveCredential });
    const created = await service.createRun({
      testCaseIds: [externalCaseIds[0]],
      harnessConfigurationNames: ["fixture-task-system"],
      judgeConfigurationName: "deterministic-graph-contract",
    });
    const completed = await waitForTerminal(service, created.id);
    expect(completed.executions[0].turns).not.toHaveLength(0);
    const executionId = completed.executions[0].id;
    const persistedCatalogFree = await new EvalService({
      stateFile,
      productSession: { origin: "http://127.0.0.1:43123", cookie: { name: "relayer", value: "test" } },
      configurationPaths: directoriesForFixture(),
      platform: "darwin",
      validateLiveCredential,
      simulatedUserJudgeRunner,
    }).open();
    const requestsBeforeUnauthorizedAttempt = product.mock.calls.length;

    await expect(persistedCatalogFree.rejudgeExecution(executionId, "simulated-user"))
      .rejects.toThrow("External live Eval requires confirmation");
    expect(product.mock.calls).toHaveLength(requestsBeforeUnauthorizedAttempt);
    expect(simulatedUserJudgeRunner).not.toHaveBeenCalled();

    product.emptyAcceptedThread = true;
    const requestsBeforeAuthorizedAttempt = product.mock.calls.length;
    await expect(persistedCatalogFree.rejudgeExecution(executionId, "simulated-user", authorization({
      testCaseIds: [externalCaseIds[0]],
      harnessConfigurationNames: ["fixture-task-system"],
      judgeConfigurationName: "simulated-user",
    }))).rejects.toThrow("no accepted turns eligible for rejudging");
    expect(validateLiveCredential).toHaveBeenCalledWith(
      { name: "simulated-user", implementation: "codex.basic" },
      providerReference,
    );
    expect(product.mock.calls).toHaveLength(requestsBeforeAuthorizedAttempt + 1);
    expect(simulatedUserJudgeRunner).not.toHaveBeenCalled();
    expect(persistedCatalogFree.getRun(created.id).executions[0].liveJudgeAuthorizations).toMatchObject([{
      confirmed: true,
      credentialReference: providerReference,
      declaredCostCapUsd: 5,
      testCaseIds: [externalCaseIds[0]],
      harnessConfigurationNames: ["fixture-task-system"],
      judgeConfigurationName: "simulated-user",
    }]);
  });
});

async function openService(options = {}) {
  const validateLiveCredential = Object.hasOwn(options, "validateLiveCredential")
    ? options.validateLiveCredential
    : vi.fn(async () => {});
  const simulatedUserJudgeRunner = options.simulatedUserJudgeRunner ?? null;
  const directory = await mkdtemp(join(tmpdir(), "eval-live-auth-"));
  directories.push(directory);
  const stateFile = join(directory, "eval-data", "test-runs.json");
  const product = fakeExternalProduct();
  globalThis.fetch = product;
  const service = await new EvalService({
    stateFile,
    productSession: { origin: "http://127.0.0.1:43123", cookie: { name: "relayer", value: "test" } },
    configurationPaths: directoriesForFixture(),
    platform: "darwin",
    externalCatalog: withExternalIdentity(createSyntheticExternalCatalog()),
    validateLiveCredential,
    simulatedUserJudgeRunner,
    targetKey: "macos-arm64",
  }).open();
  return { service, validateLiveCredential, product, stateFile };
}

function liveSelection({
  suiteId,
  testCaseIds = [],
  harnessConfigurationNames = ["codex-basic"],
  judgeConfigurationName = "deterministic-graph-contract",
  includeAuthorization = true,
} = {}) {
  const selection = {
    ...(suiteId ? { suiteId } : {}),
    testCaseIds,
    harnessConfigurationNames,
    judgeConfigurationName,
  };
  if (includeAuthorization) selection.liveAuthorization = authorization({
    testCaseIds: suiteId ? externalCaseIds : testCaseIds,
    harnessConfigurationNames,
    judgeConfigurationName,
  });
  return selection;
}

function authorization({
  confirmed = true,
  credentialReference = providerReference,
  declaredCostCapUsd = 5,
  testCaseIds = [externalCaseIds[0]],
  harnessConfigurationNames = ["codex-basic"],
  judgeConfigurationName = "deterministic-graph-contract",
} = {}) {
  return { confirmed, credentialReference, declaredCostCapUsd, testCaseIds, harnessConfigurationNames, judgeConfigurationName };
}

function withExternalIdentity(catalog) {
  return {
    ...catalog,
    identity: { schemaVersion: 1, repositoryUrl: "https://example.invalid/eval-catalog.git", commit: "a".repeat(40), tree: "b".repeat(40), entrypoint: "src/index.mjs", entrypointSha256: "c".repeat(64) },
    assertUnchanged: async () => {},
  };
}

function fakeExternalProduct() {
  const output = {
    nodeId: 1,
    rootAction: { id: 11, sourceNodeId: 1, sourceLayerId: null, kind: "navigate", relation: "expand", label: "Response", targetLayerId: 10, state: "accepted" },
    rootLayer: {
      layer: { id: 10, nodes: [2], edges: [], layout: { version: 1, placements: [{ nodeId: 2, x: 0.5, y: 0.5 }] }, state: "accepted" },
      nodes: [{ id: 2, kind: "concept", icon: "queue", title: "Queue", detail: "Tasks wait here.", state: "accepted" }],
      edges: [], actions: [],
    },
  };
  const interaction = { id: "interaction-1", sequence: 1, graphNodeId: 1, completionStatus: "accepted", completionOutput: output, completionError: null, text: "Synthetic project task.", permissionProfileId: "auto", effectiveExecutionDigest: `sha256:${"d".repeat(64)}`, effectivePermissionReceipt: { permissionProfileId: "auto" } };
  let projectId = 0;
  const fetch = vi.fn(async (url, options = {}) => {
    const path = new URL(url).pathname;
    if (path === "/api/model-settings" && (!options.method || options.method === "GET")) return jsonResponse({
      defaults: { harnessId: "fixture-task-system", familyId: 1 },
      harnesses: [
        { id: "fixture-task-system", available: true, modelCompatibility: [{ providerId: "codex" }] },
        { id: "codex-layered-navigation-luna", available: true, modelCompatibility: [], compatibleProviderIds: [] },
      ],
      providers: [{ id: "openai", adapterId: "openai-api", connected: true, models: [{ id: "test-model", visible: true, available: true }] }],
      families: [{ id: 1, enabled: true, position: 0, members: [{ position: 0, providerId: "openai", modelId: "test-model" }] }],
    });
    if (path === "/api/projects" && options.method === "POST") return jsonResponse({ id: `project-${++projectId}` });
    if (path === "/api/threads" && options.method === "POST") return jsonResponse({ id: "thread-1", rootInteractionId: interaction.id });
    if (path === "/api/threads/thread-1" && (!options.method || options.method === "GET")) return jsonResponse({ id: "thread-1", interactions: fetch.emptyAcceptedThread ? [] : [interaction] });
    const layerRoute = /^\/api\/threads\/thread-1\/interactions\/interaction-1\/layers\/(\d+)$/.exec(path);
    if (layerRoute) return jsonResponse({ layer: output.rootLayer.layer, nodes: output.rootLayer.nodes, edges: [], actions: [] });
    return jsonResponse({ error: `Unexpected test request ${options.method || "GET"} ${path}` }, 404);
  });
  return fetch;
}

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
}

async function waitForTerminal(service, runId) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const run = service.getRun(runId);
    if (!["queued", "running"].includes(run.status) && typeof run.bundleRef === "string") {
      await service.persistTail;
      return run;
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 10));
  }
  throw new Error("Eval authorization fixture did not finish in time.");
}
