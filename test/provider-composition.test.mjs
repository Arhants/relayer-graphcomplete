import { describe, expect, it, vi } from "vitest";

import { createProviderAdapterRegistry } from "../desktop/main/providers/provider-adapter-contract.mjs";
import { createProviderComposition } from "../desktop/main/providers/provider-composition.mjs";

describe("injectable production provider composition", () => {
  it("publishes missing persisted credentials as unavailable and keeps explicit refresh deterministic", async () => {
    const published = [];
    const composition = createProviderComposition({
      registry: createProviderAdapterRegistry([{
        adapterId: "fake-api", implementationVersion: "1", label: "Fake API",
        accessContract: "secret@1", defaultEndpoint: "https://fake.example/v1",
        connection: { mode: "secret-fields", fields: [{ id: "key", label: "Key", kind: "secret" }] },
        create: vi.fn(),
      }]),
      definitionStore: { async load() { return [{
        id: "missing", adapterId: "fake-api", label: "Missing API", endpoint: "https://fake.example/v1",
        accessContract: "secret@1", credentialReference: "provider:missing", lifecycleState: "active",
      }]; } },
      credentialStore: { async get() { return null; }, async listReferences() { return ["provider:missing"]; } },
      publishCatalog: async (snapshot) => { published.push(snapshot); },
      modelCatalogOptions: { backgroundIntervalMs: 60_000 },
    });

    await composition.start();
    expect(published).toEqual([expect.objectContaining({
      providerId: "missing", connected: false, models: [],
      unavailableReason: expect.objectContaining({ code: "provider_unavailable" }),
    })]);
    await composition.modelCatalog.explicitRefresh("missing");
    expect(published).toHaveLength(2);
    expect(published[1]).toEqual(published[0]);
    await composition.close();
  });

  it("recovers an unavailable API provider through the existing explicit refresh surface", async () => {
    const published = [];
    let runtimeReady = false;
    const prepareRuntime = vi.fn(async () => { runtimeReady = true; });
    const evaluateReadiness = vi.fn(async () => {});
    const create = vi.fn(({ definition }) => {
      if (!runtimeReady) throw new Error("managed runtime unavailable");
      return {
        providerId: definition.id,
        discover: async () => ({
          provider: { id: definition.id, label: definition.label, status: "available" },
          models: [{
            id: "recovered-model", executionModel: "recovered-model", label: "Recovered", description: "",
            visible: true, availability: "available", unavailableReason: null, availabilityNotice: null,
            isDefault: true, replacementModelId: null, upgradeInfo: null, supportedEfforts: [],
            defaultEffort: null, inputModalities: ["text"], supportsPersonality: false,
            serviceTiers: [], defaultServiceTier: null,
          }],
          systemFamily: { id: definition.id, label: definition.label, modelIds: ["recovered-model"] },
        }),
        close: vi.fn(async () => {}),
      };
    });
    const composition = createProviderComposition({
      registry: createProviderAdapterRegistry([{
        adapterId: "recoverable-api", implementationVersion: "1", label: "Recoverable API",
        accessContract: "secret@1", defaultEndpoint: "https://recover.example/v1",
        connection: { mode: "secret-fields", fields: [{ id: "key", label: "Key", kind: "secret" }] },
        create,
      }]),
      definitionStore: { async load() { return [{
        id: "recoverable", adapterId: "recoverable-api", label: "Recoverable", endpoint: "https://recover.example/v1",
        accessContract: "secret@1", credentialReference: "provider:recoverable", lifecycleState: "active",
      }]; } },
      credentialStore: { async get() { return { key: "opaque" }; }, async listReferences() { return ["provider:recoverable"]; } },
      prepareRuntime,
      evaluateReadiness,
      publishCatalog: async (snapshot) => { published.push(snapshot); },
      modelCatalogOptions: { backgroundIntervalMs: 60_000 },
    });

    await composition.start();
    expect(published.at(-1)).toMatchObject({ providerId: "recoverable", connected: false });
    expect(prepareRuntime).not.toHaveBeenCalled();
    await composition.modelCatalog.explicitRefresh("recoverable");
    expect(prepareRuntime).toHaveBeenCalledOnce();
    expect(evaluateReadiness).toHaveBeenCalledWith(expect.objectContaining({
      trigger: "explicit-repair",
      providerDefinition: expect.objectContaining({ id: "recoverable" }),
      models: [expect.objectContaining({ id: "recovered-model" })],
    }));
    expect(create).toHaveBeenCalledTimes(2);
    expect(published.at(-1)).toMatchObject({
      providerId: "recoverable",
      connected: true,
      models: [{ id: "recovered-model" }],
    });
    const lease = await composition.providerDefinitions.acquireExecution("recoverable");
    expect(lease.runtime.providerId).toBe("recoverable");
    await lease.release();
    await composition.close();
  });

  it("does not instantiate or refresh a tombstoned legacy provider", async () => {
    const create = vi.fn(() => { throw new Error("tombstoned provider must not be instantiated"); });
    const composition = createProviderComposition({
      registry: createProviderAdapterRegistry([{
        adapterId: "codex-subscription", implementationVersion: "1", label: "Codex subscription",
        accessContract: "managed-runtime@1", defaultEndpoint: null,
        connection: { mode: "managed-login", fields: [] }, create,
      }]),
      definitionStore: { async load() { return [{
        id: "codex", adapterId: "codex-subscription", label: "Codex", endpoint: null,
        accessContract: "managed-runtime@1", credentialReference: null,
        lifecycleState: "tombstoned", removedAt: "1",
      }]; } },
      credentialStore: { async listReferences() { return []; } },
      publishCatalog: vi.fn(async () => {}),
    });
    await composition.start();
    expect(create).not.toHaveBeenCalled();
    await composition.close();
  });

  it("drives a fake registry through definition, catalog, and execution flows", async () => {
    let definitions = [];
    const published = [];
    const descriptor = {
      adapterId: "fake-composition", implementationVersion: "7", label: "Fake composition",
      accessContract: "secret@1", defaultEndpoint: "https://fake.example/v1",
      endpointEditableDuringCreation: true,
      connection: { mode: "secret-fields", fields: [{ id: "api-key", label: "API key", kind: "secret" }] },
      create: ({ definition }) => ({
        providerId: definition.id,
        discover: async () => ({
          provider: { id: definition.id, label: definition.label, status: "available" },
          models: [{
            id: "fake-model", executionModel: "fake-model", label: "Fake model", description: "",
            visible: true, availability: "available", unavailableReason: null, availabilityNotice: null,
            isDefault: false, replacementModelId: null, upgradeInfo: null, supportedEfforts: [],
            defaultEffort: null, inputModalities: ["text"], supportsPersonality: false,
            serviceTiers: [], defaultServiceTier: null,
          }],
          systemFamily: { id: definition.id, label: definition.label, modelIds: [] },
        }),
        executionAccess: async () => ({ kind: "secret", endpoint: definition.endpoint, fields: { "api-key": "execution-only" } }),
        close: vi.fn(async () => {}),
      }),
    };
    const composition = createProviderComposition({
      registry: createProviderAdapterRegistry([descriptor]),
      definitionStore: {
        async load() { return structuredClone(definitions); },
        async save(next) { definitions = structuredClone(next); },
        async createWithCatalog(candidate) { definitions.push(structuredClone(candidate)); },
      },
      credentialStore: { async set() {}, async get() { return { "api-key": "execution-only" }; }, async delete() {}, async listReferences() { return []; } },
      publishCatalog: async (snapshot) => { published.push(snapshot); },
      modelCatalogOptions: { backgroundIntervalMs: 60_000 },
    });
    await composition.start();
    expect(composition.providerDefinitions.adapters().map(({ adapterId }) => adapterId)).toEqual(["fake-composition"]);

    const connected = await composition.providerDefinitions.connect({
      adapterId: "fake-composition", label: "Fake Work", endpoint: "https://fake.example/v1", fields: { "api-key": "opaque" },
    });
    const providerId = connected.providerDefinition.id;
    await composition.modelCatalog.explicitRefresh(providerId);
    expect(published.at(-1)).toMatchObject({ providerId, connected: true, models: [{ id: "fake-model" }] });

    const lease = await composition.providerDefinitions.acquireExecution(providerId);
    expect(lease.descriptor.implementationVersion).toBe("7");
    await lease.release();
    await composition.close();
  });

  // One provider's leftover removal or cleanup failing must neither stop Relayer from
  // starting nor keep the other providers from activating or finishing their own removals.
  // Each failure is recorded; a removal that fails before its tombstone stays pending.
  it.each([
    ["its tombstone write fails", { failTombstone: true },
      { category: "provider_removal_startup_failed", providerId: "leaving", leaving: "removal_pending", orphan: false }],
    ["the store still counts an attempt on it as running", { deferTombstone: true },
      { category: "provider_removal_startup_deferred", providerId: "leaving", leaving: "removal_pending", orphan: false }],
    ["its credential cleanup fails after the tombstone", { failCredentialDelete: true },
      { category: "provider_removal_startup_failed", providerId: "leaving", leaving: "tombstoned", orphan: false }],
    ["its runtime state cleanup fails after the tombstone", { failRuntimeStateRemoval: true },
      { category: "provider_removal_startup_failed", providerId: "leaving", leaving: "tombstoned", orphan: false }],
    ["the runtime-state sweep fails", { failRuntimeStateSweep: true },
      { category: "provider_runtime_state_startup_cleanup_failed", leaving: "tombstoned", orphan: false }],
    ["listing stored credentials fails", { failListReferences: true },
      { category: "provider_credential_startup_cleanup_failed", leaving: "tombstoned", orphan: true }],
    ["deleting an orphaned credential fails", { failOrphanDelete: true },
      { category: "provider_credential_startup_cleanup_failed", providerId: "orphan", leaving: "tombstoned", orphan: true }],
  ])("starts and activates other providers when %s", async (_, faults, expected) => {
    const published = [];
    const diagnostics = [];
    const pending = (id) => ({
      id, adapterId: "fake-api", label: id, endpoint: "https://fake.example/v1",
      accessContract: "secret@1", credentialReference: `provider:${id}`, lifecycleState: "removal_pending",
    });
    let definitions = [
      pending("leaving"),
      pending("also-leaving"),
      {
        id: "staying", adapterId: "fake-api", label: "Staying", endpoint: "https://fake.example/v1",
        accessContract: "secret@1", credentialReference: "provider:staying", lifecycleState: "active",
      },
    ];
    const credentials = new Set(["provider:leaving", "provider:also-leaving", "provider:staying", "provider:orphan"]);
    const removeRuntimeState = async ({ id }) => {
      if (faults.failRuntimeStateRemoval && id === "leaving") throw new Error("runtime state busy");
      return true;
    };
    removeRuntimeState.reconcile = async () => {
      if (faults.failRuntimeStateSweep) throw new Error("runtime root unreadable");
    };
    const composition = createProviderComposition({
      registry: createProviderAdapterRegistry([{
        adapterId: "fake-api", implementationVersion: "1", label: "Fake API",
        accessContract: "secret@1", defaultEndpoint: "https://fake.example/v1",
        connection: { mode: "secret-fields", fields: [{ id: "key", label: "Key", kind: "secret" }] },
        create: ({ definition }) => ({
          providerId: definition.id,
          discover: async () => ({
            provider: { id: definition.id, label: definition.label, status: "available" },
            models: [{
              id: "staying-model", executionModel: "staying-model", label: "Staying", description: "",
              visible: true, availability: "available", unavailableReason: null, availabilityNotice: null,
              isDefault: true, replacementModelId: null, upgradeInfo: null, supportedEfforts: [],
              defaultEffort: null, inputModalities: ["text"], supportsPersonality: false,
              serviceTiers: [], defaultServiceTier: null,
            }],
            systemFamily: { id: definition.id, label: definition.label, modelIds: ["staying-model"] },
          }),
          close: vi.fn(async () => {}),
        }),
      }]),
      definitionStore: {
        async load() { return structuredClone(definitions); },
        async save(next) {
          const tombstonesLeaving = next.some(({ id, lifecycleState }) => id === "leaving" && lifecycleState === "tombstoned");
          if (faults.failTombstone && tombstonesLeaving) {
            throw Object.assign(new Error("catalog write failed"), { code: "catalog_unavailable" });
          }
          if (faults.deferTombstone && tombstonesLeaving) {
            throw Object.assign(new Error("drain incomplete"), { code: "provider_execution_drain_incomplete" });
          }
          definitions = structuredClone(next);
        },
      },
      credentialStore: {
        async get(reference) { return credentials.has(reference) ? { key: "opaque" } : null; },
        async delete(reference) {
          if (faults.failCredentialDelete && reference === "provider:leaving") throw new Error("keychain locked");
          if (faults.failOrphanDelete && reference === "provider:orphan") throw new Error("keychain locked");
          credentials.delete(reference);
        },
        async listReferences() {
          if (faults.failListReferences) throw new Error("keychain unavailable");
          return [...credentials];
        },
      },
      removeRuntimeState,
      diagnostics: { write: async (event) => { diagnostics.push(event); } },
      publishCatalog: async (snapshot) => { published.push(snapshot); },
      modelCatalogOptions: { backgroundIntervalMs: 60_000 },
    });

    await expect(composition.start()).resolves.toBeUndefined();
    expect(published).toContainEqual(expect.objectContaining({
      providerId: "staying", connected: true, models: [expect.objectContaining({ id: "staying-model" })],
    }));
    const lease = await composition.providerDefinitions.acquireExecution("staying");
    await lease.release();
    expect(diagnostics).toContainEqual(expect.objectContaining({
      category: expected.category,
      ...(expected.providerId === undefined ? {} : { providerId: expected.providerId }),
    }));
    expect(definitions.find(({ id }) => id === "leaving").lifecycleState).toBe(expected.leaving);
    // The other pending removal still finishes, and its credential is deleted.
    expect(definitions.find(({ id }) => id === "also-leaving").lifecycleState).toBe("tombstoned");
    expect(credentials.has("provider:also-leaving")).toBe(false);
    expect(credentials.has("provider:staying")).toBe(true);
    expect(credentials.has("provider:orphan")).toBe(expected.orphan);
    await composition.close();
  });
});
