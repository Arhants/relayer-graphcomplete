// PROV-002 (superseded results are inert) and PROV-007 (connect is all-or-nothing), driven
// through the real provider composition. The fake product server keeps the app server's
// catalog contract: a publish names the connection generation its result started with, a
// lifecycle event advances it in the same write, and a missing or stale one is refused.
import { describe, expect, it, vi } from "vitest";

import { createProviderAdapterRegistry } from "../desktop/main/providers/provider-adapter-contract.mjs";
import { createProviderComposition } from "../desktop/main/providers/provider-composition.mjs";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

function coded(code) {
  return Object.assign(new Error(code), { code });
}

const model = {
  id: "agent-model", executionModel: "agent-model", label: "Agent model", description: "",
  visible: true, availability: "available", unavailableReason: null, availabilityNotice: null,
  isDefault: true, replacementModelId: null, upgradeInfo: null, supportedEfforts: [],
  defaultEffort: null, inputModalities: ["text"], supportsPersonality: false,
  serviceTiers: [], defaultServiceTier: null,
};

function catalog(definition, status = "available") {
  return {
    provider: { id: definition.id, label: definition.label, status, unavailableReason: status === "unavailable" ? "Unavailable." : null },
    models: status === "available" ? [model] : [],
    systemFamily: { id: definition.id, label: definition.label, modelIds: [] },
  };
}

// The app server's provider rows and catalog publishes.
function productServer(definitions = []) {
  const rows = new Map(definitions.map((definition) => [definition.id, {
    definition: structuredClone(definition), generation: 1, connected: false,
  }]));
  const published = [];
  const server = {
    rows,
    published,
    // Every publish that reached the server, refused or not.
    attempts: [],
    loadFails: false,
    loseNextResponse: null,
    refused: 0,
    connected: (id) => rows.get(id)?.connected ?? null,
    store: {
      async load() {
        if (server.loadFails) throw new Error("app server unreachable");
        return [...rows.values()].map(({ definition, generation }) => ({ ...structuredClone(definition), connectionGeneration: generation }));
      },
      async save(next) {
        for (const definition of next) {
          const row = rows.get(definition.id);
          const { connectionGeneration: _ignored, ...stored } = definition;
          if (!row) rows.set(definition.id, { definition: stored, generation: 1, connected: false });
          else {
            if (row.definition.lifecycleState !== stored.lifecycleState) row.generation += 1;
            row.definition = stored;
          }
        }
      },
      async createWithCatalog(definition, discovered) {
        if (rows.has(definition.id)) throw coded("provider_definition_exists");
        rows.set(definition.id, {
          definition: structuredClone(definition), generation: 1, connected: discovered.provider.status === "available",
        });
        published.push({ providerId: definition.id, connected: discovered.provider.status === "available", created: true });
        if (server.loseNextResponse === "create") {
          server.loseNextResponse = null;
          throw new Error("socket hang up");
        }
      },
    },
    async publishCatalog(snapshot, { connectionGeneration, connectionEvent } = {}) {
      server.attempts.push({ providerId: snapshot.providerId, connectionGeneration, connectionEvent });
      if (!Number.isSafeInteger(connectionGeneration)) throw coded("invalid_request");
      const row = rows.get(snapshot.providerId);
      if (!row) throw coded("provider_unknown");
      if (row.definition.lifecycleState !== "active") throw coded("provider_not_active");
      if (connectionGeneration !== row.generation) {
        server.refused += 1;
        throw coded("provider_connection_superseded");
      }
      if (connectionEvent) row.generation += 1;
      row.connected = snapshot.connected;
      published.push({ ...snapshot, connectionGeneration, connectionEvent });
      if (server.loseNextResponse === connectionEvent) {
        server.loseNextResponse = null;
        throw new Error("socket hang up");
      }
    },
  };
  return server;
}

function credentialFile(entries = []) {
  const values = new Map(entries);
  return {
    values,
    async get(reference) { return values.get(reference) ?? null; },
    async set(reference, value) { values.set(reference, structuredClone(value)); },
    async delete(reference) { values.delete(reference); },
    async listReferences() { return [...values.keys()]; },
  };
}

const managedDefinition = {
  id: "managed-work", adapterId: "fake-managed", label: "Work", endpoint: null,
  accessContract: "managed-runtime@1", credentialReference: null, lifecycleState: "active", removedAt: null,
};

// A managed-login provider whose upstream account the test controls. Each runtime is one
// app-server process: its catalog reads the account, and `holdNextDiscover` stalls the next
// discovery after it has read.
function managedWorld({ activationFails = false } = {}) {
  const world = {
    account: "connected",
    activationFails,
    runtimes: [],
    holdNextDiscover: null,
  };
  const create = ({ definition }) => {
    if (world.activationFails) throw new Error("managed runtime unavailable");
    const runtime = {
      definition,
      closed: false,
      discoveries: 0,
      credentials: {
        login: vi.fn(async () => ({ authUrl: "https://login.example.test/work" })),
        account: vi.fn(async () => ({ status: world.account })),
        logout: vi.fn(async () => { world.account = "disconnected"; return { status: "disconnected" }; }),
      },
      catalog: {
        providerId: definition.id,
        discover: async () => {
          runtime.discoveries += 1;
          const status = world.account === "connected" ? "available" : "disconnected";
          const hold = world.holdNextDiscover;
          world.holdNextDiscover = null;
          if (hold) {
            hold.reached.resolve();
            await hold.release.promise;
          }
          return catalog(definition, status);
        },
      },
      close: vi.fn(async () => { runtime.closed = true; }),
    };
    world.runtimes.push(runtime);
    return runtime;
  };
  world.registry = createProviderAdapterRegistry([{
    adapterId: "fake-managed", implementationVersion: "1", label: "Managed", accessContract: "managed-runtime@1",
    defaultEndpoint: null, connection: { mode: "managed-login", fields: [] }, create,
  }]);
  world.hold = () => {
    const hold = { reached: deferred(), release: deferred() };
    world.holdNextDiscover = hold;
    return hold;
  };
  return world;
}

function compose({ registry, server, credentials = credentialFile(), prepareRuntime, evaluateReadiness, diagnostics = null }) {
  return createProviderComposition({
    registry,
    definitionStore: server.store,
    credentialStore: credentials,
    publishCatalog: (snapshot, options) => server.publishCatalog(snapshot, options),
    prepareRuntime,
    evaluateReadiness,
    diagnostics,
    modelCatalogOptions: { backgroundIntervalMs: 60_000 },
  });
}

describe("PROV-002: a superseded provider result is inert", () => {
  // F3: a refresh requested during recovery used to capture the recovery adapter when it was
  // requested. It then ran after the recovery and overwrote "connected" with "could not be
  // activated". The adapter is now resolved when the refresh runs.
  it("keeps a recovered provider connected when a refresh requested during recovery runs after it", async () => {
    const definition = {
      id: "recoverable", adapterId: "recoverable-api", label: "Recoverable", endpoint: "https://recover.example/v1",
      accessContract: "secret@1", credentialReference: "provider:recoverable", lifecycleState: "active", removedAt: null,
    };
    let runtimeReady = false;
    const installing = deferred();
    const installStarted = deferred();
    const server = productServer([definition]);
    const composition = compose({
      server,
      credentials: credentialFile([["provider:recoverable", { key: "opaque" }]]),
      registry: createProviderAdapterRegistry([{
        adapterId: "recoverable-api", implementationVersion: "1", label: "Recoverable API",
        accessContract: "secret@1", defaultEndpoint: "https://recover.example/v1",
        connection: { mode: "secret-fields", fields: [{ id: "key", label: "Key", kind: "secret" }] },
        create: ({ definition: created }) => {
          if (!runtimeReady) throw new Error("managed runtime unavailable");
          return { providerId: created.id, discover: async () => catalog(created), close: async () => {} };
        },
      }]),
      // The managed runtime is missing after an update: activation fails and recovery installs it.
      prepareRuntime: async () => { installStarted.resolve(); await installing.promise; runtimeReady = true; },
    });
    try {
      await composition.start();
      expect(server.connected("recoverable")).toBe(false);

      // "Refresh models" starts the recovery; Settings reopens while the runtime installs.
      const explicit = composition.modelCatalog.explicitRefresh("recoverable");
      await installStarted.promise;
      const reopened = composition.modelCatalog.settingsOpened();
      installing.resolve();
      await explicit;
      await reopened;

      expect(server.published.filter(({ providerId }) => providerId === "recoverable").at(-1))
        .toMatchObject({ connected: true });
      expect(server.connected("recoverable")).toBe(true);
    } finally {
      await composition.close();
    }
  });

  // F4: a cancelled reconnect used to unregister the catalog adapter of a provider that stays
  // active. Explicit refresh then threw "Unknown model provider" and background refresh
  // skipped it.
  it("keeps a catalog adapter for an active provider whose reconnect is cancelled", async () => {
    const world = managedWorld();
    const server = productServer([managedDefinition]);
    const composition = compose({ registry: world.registry, server });
    try {
      await composition.start();
      await composition.providerDefinitions.logout(managedDefinition.id);
      const pending = await composition.providerDefinitions.reconnect(managedDefinition.id);
      expect(pending).toMatchObject({ status: "pending" });
      await expect(composition.providerDefinitions.cancelConnection(pending.connectionId)).resolves.toBe(true);
      // The reconnect's login ran in the live runtime, so that runtime closed with it.
      expect(world.runtimes[0].closed).toBe(true);

      world.account = "connected";
      await expect(composition.modelCatalog.explicitRefresh(managedDefinition.id)).resolves.toMatchObject({
        provider: { status: "available" },
      });
      expect(server.connected(managedDefinition.id)).toBe(true);
    } finally {
      await composition.close();
    }
  });

  it("falls back to the recovery adapter when a cancelled reconnect cannot restart the runtime", async () => {
    const world = managedWorld();
    const server = productServer([managedDefinition]);
    const composition = compose({ registry: world.registry, server });
    try {
      await composition.start();
      await composition.providerDefinitions.logout(managedDefinition.id);
      const pending = await composition.providerDefinitions.reconnect(managedDefinition.id);
      world.activationFails = true;
      await composition.providerDefinitions.cancelConnection(pending.connectionId);
      expect(await composition.providerDefinitions.list()).toEqual([expect.objectContaining({
        id: managedDefinition.id,
        unavailableReason: expect.objectContaining({ code: "provider_activation_failed" }),
      })]);

      // The recovery adapter's explicit refresh activates the provider again.
      world.activationFails = false;
      world.account = "connected";
      await composition.modelCatalog.explicitRefresh(managedDefinition.id);
      expect(server.connected(managedDefinition.id)).toBe(true);
    } finally {
      await composition.close();
    }
  });

  // The user signs out while a reconnect is pending. The reconnect started under the older
  // generation, so its completion is refused and changes nothing. The next reconnect lands.
  it("refuses a reconnect a later sign-out superseded, then lets the next one land", async () => {
    const world = managedWorld();
    const server = productServer([managedDefinition]);
    const composition = compose({ registry: world.registry, server });
    try {
      await composition.start();
      await composition.providerDefinitions.logout(managedDefinition.id);
      const first = await composition.providerDefinitions.reconnect(managedDefinition.id);
      await composition.providerDefinitions.logout(managedDefinition.id);
      world.account = "connected";
      await expect(composition.providerDefinitions.completeConnection(first.connectionId))
        .rejects.toThrow("provider_connection_superseded");
      expect(server.connected(managedDefinition.id)).toBe(false);

      const second = await composition.providerDefinitions.reconnect(managedDefinition.id);
      await expect(composition.providerDefinitions.completeConnection(second.connectionId))
        .resolves.toMatchObject({ status: "connected" });
      expect(server.connected(managedDefinition.id)).toBe(true);
      expect(server.rows.get(managedDefinition.id).generation).toBe(4);
    } finally {
      await composition.close();
    }
  });

  // CR-V1: a refresh discovered "disconnected" after sign-out, then stalled. A completed
  // reconnect published "connected" directly. The stalled result then published over it.
  it("drops a refresh that discovered before a reconnect completed", async () => {
    const world = managedWorld();
    const server = productServer([managedDefinition]);
    const composition = compose({ registry: world.registry, server });
    try {
      await composition.start();
      await composition.providerDefinitions.logout(managedDefinition.id);
      expect(server.connected(managedDefinition.id)).toBe(false);

      const stalled = world.hold();
      const reopened = composition.modelCatalog.settingsOpened();
      await stalled.reached.promise;

      const pending = await composition.providerDefinitions.reconnect(managedDefinition.id);
      world.account = "connected";
      await expect(composition.providerDefinitions.completeConnection(pending.connectionId))
        .resolves.toMatchObject({ status: "connected" });
      expect(server.connected(managedDefinition.id)).toBe(true);

      stalled.release.resolve();
      const [stale] = await reopened;
      expect(server.connected(managedDefinition.id)).toBe(true);
      expect(server.published.at(-1)).toMatchObject({ connected: true, connectionEvent: "reconnected" });
      expect(stale).toBeNull();
    } finally {
      await composition.close();
    }
  });

  // A lifecycle write can commit although its response is lost. The app server then refuses
  // the next refresh as stale, and the refresh learns the current generation so later ones land.
  it("relearns a generation the app server advanced behind a lost response", async () => {
    const world = managedWorld();
    const server = productServer([managedDefinition]);
    const diagnostics = { write: vi.fn(async () => {}) };
    const composition = compose({ registry: world.registry, server, diagnostics });
    try {
      await composition.start();
      server.loseNextResponse = "signed-out";
      await composition.providerDefinitions.logout(managedDefinition.id);
      expect(diagnostics.write).toHaveBeenCalledWith(expect.objectContaining({
        category: "provider_logout_catalog_refresh_failed",
      }));
      // The app server advanced; this process did not hear about it.
      expect(server.rows.get(managedDefinition.id).generation).toBe(2);
      expect(server.connected(managedDefinition.id)).toBe(false);

      // A refresh after it, logout's own or the first explicit one, is refused and relearns
      // the generation; the next one lands.
      world.account = "connected";
      await composition.modelCatalog.explicitRefresh(managedDefinition.id);
      await composition.modelCatalog.explicitRefresh(managedDefinition.id);
      expect(server.refused).toBeGreaterThan(0);
      expect(composition.providerDefinitions.connectionGeneration(managedDefinition.id)).toBe(2);
      expect(server.connected(managedDefinition.id)).toBe(true);
    } finally {
      await composition.close();
    }
  });

  // CR-V7: logout awaited its own refresh inside the provider queue. That refresh was queued
  // behind an explicit refresh through the recovery adapter, which waited for the provider
  // queue. Neither returned.
  it("signs out while an explicit recovery is queued behind another refresh", async () => {
    const world = managedWorld({ activationFails: true });
    const server = productServer([managedDefinition]);
    const composition = compose({ registry: world.registry, server });
    try {
      // The startup refresh through the recovery adapter holds its publish.
      const publish = server.publishCatalog;
      const startupPublish = deferred();
      let held = false;
      server.publishCatalog = async (...args) => {
        if (!held) { held = true; await startupPublish.promise; }
        return publish(...args);
      };
      const started = composition.start();
      await vi.waitFor(() => expect(held).toBe(true));
      const explicit = composition.modelCatalog.explicitRefresh(managedDefinition.id);

      world.activationFails = false;
      const logout = composition.providerDefinitions.logout(managedDefinition.id);
      await vi.waitFor(() => expect(world.runtimes).toHaveLength(1));
      startupPublish.resolve();
      await started;

      const outcome = await Promise.race([
        logout.then(() => "returned"),
        new Promise((resolve) => { setTimeout(() => resolve("deadlocked"), 2_000).unref?.(); }),
      ]);
      expect(outcome).toBe("returned");
      await explicit;
      expect(server.connected(managedDefinition.id)).toBe(false);
    } finally {
      await composition.close();
    }
  });

  // L1: recovery through the recovery adapter used to discover through the runtime a pending
  // reconnect was signing in.
  it("does not recover through the runtime of a pending reconnect", async () => {
    const world = managedWorld({ activationFails: true });
    const server = productServer([managedDefinition]);
    const composition = compose({ registry: world.registry, server });
    try {
      await composition.start();
      world.activationFails = false;
      world.account = "disconnected";
      const pending = await composition.providerDefinitions.reconnect(managedDefinition.id);
      const [reconnecting] = world.runtimes;

      await composition.modelCatalog.explicitRefresh(managedDefinition.id);
      expect(reconnecting.discoveries).toBe(0);
      expect(server.connected(managedDefinition.id)).toBe(false);

      world.account = "connected";
      await expect(composition.providerDefinitions.completeConnection(pending.connectionId))
        .resolves.toMatchObject({ status: "connected" });
      await composition.modelCatalog.explicitRefresh(managedDefinition.id);
      expect(reconnecting.discoveries).toBe(2);
      expect(server.connected(managedDefinition.id)).toBe(true);
    } finally {
      await composition.close();
    }
  });
});

describe("PROV-007: connect is all-or-nothing", () => {
  const apiDescriptor = (discover) => ({
    adapterId: "fake-api", implementationVersion: "1", label: "Fake API",
    accessContract: "secret@1", defaultEndpoint: "https://fake.example/v1",
    connection: { mode: "secret-fields", fields: [{ id: "api-key", label: "API key", kind: "secret" }] },
    create: ({ definition }) => ({
      providerId: definition.id,
      discover: () => discover(definition),
      close: vi.fn(async () => {}),
    }),
  });

  it("publishes nothing and registers no adapter before the definition exists, and a refused create leaves nothing", async () => {
    const server = productServer();
    const credentials = credentialFile();
    const commit = deferred();
    server.store.createWithCatalog = async () => {
      await commit.promise;
      throw coded("provider_definition_invalid");
    };
    const composition = compose({
      server,
      credentials,
      registry: createProviderAdapterRegistry([apiDescriptor(async (definition) => catalog(definition))]),
    });
    try {
      await composition.start();
      const connecting = composition.providerDefinitions.connect({
        connectionId: "work-api", adapterId: "fake-api", label: "Work API", fields: { "api-key": "opaque" },
      });
      await vi.waitFor(() => expect(credentials.values.has("provider:work-api")).toBe(true));
      // Settings opens while the create is in flight.
      await composition.modelCatalog.settingsOpened();
      expect(server.attempts).toEqual([]);
      await expect(composition.modelCatalog.explicitRefresh("work-api")).rejects.toThrow("Unknown model provider");

      commit.resolve();
      await expect(connecting).rejects.toThrow("provider_definition_invalid");
      expect(server.rows.size).toBe(0);
      expect(credentials.values.size).toBe(0);
      await composition.modelCatalog.settingsOpened();
      expect(server.attempts).toEqual([]);
      await expect(composition.modelCatalog.explicitRefresh("work-api")).rejects.toThrow("Unknown model provider");
    } finally {
      await composition.close();
    }
  });

  it("leaves nothing behind for a connect cancelled during discovery", async () => {
    const server = productServer();
    const credentials = credentialFile();
    const discovering = deferred();
    const release = deferred();
    const composition = compose({
      server,
      credentials,
      registry: createProviderAdapterRegistry([apiDescriptor(async (definition) => {
        discovering.resolve();
        await release.promise;
        return catalog(definition);
      })]),
    });
    try {
      await composition.start();
      const connecting = composition.providerDefinitions.connect({
        connectionId: "work-api", adapterId: "fake-api", label: "Work API", fields: { "api-key": "opaque" },
      });
      await discovering.promise;
      await expect(composition.providerDefinitions.cancelConnection("work-api")).resolves.toBe(true);
      release.resolve();
      await expect(connecting).rejects.toThrow("cancelled");
      expect(server.rows.size).toBe(0);
      expect(credentials.values.size).toBe(0);
      expect(server.attempts).toEqual([]);
      await expect(composition.modelCatalog.explicitRefresh("work-api")).rejects.toThrow("Unknown model provider");
    } finally {
      await composition.close();
    }
  });

  // F2: the app server committed the create but its response was lost. The rollback used to
  // delete the credential of a provider the app server keeps active.
  it("adopts a create that committed before its response was lost", async () => {
    const server = productServer();
    const credentials = credentialFile();
    server.loseNextResponse = "create";
    const composition = compose({
      server,
      credentials,
      registry: createProviderAdapterRegistry([apiDescriptor(async (definition) => catalog(definition))]),
    });
    try {
      await composition.start();
      await expect(composition.providerDefinitions.connect({
        connectionId: "work-api", adapterId: "fake-api", label: "Work API", fields: { "api-key": "opaque" },
      })).resolves.toMatchObject({ status: "connected" });
      expect(credentials.values.get("provider:work-api")).toEqual({ "api-key": "opaque" });
      await composition.modelCatalog.explicitRefresh("work-api");
      expect(server.connected("work-api")).toBe(true);
    } finally {
      await composition.close();
    }
  });

  it("leaves an unknown create outcome to startup, which keeps the credential only for a committed definition", async () => {
    for (const committed of [true, false]) {
      const server = productServer();
      const credentials = credentialFile();
      const registry = createProviderAdapterRegistry([apiDescriptor(async (definition) => catalog(definition))]);
      const first = compose({ server, credentials, registry });
      await first.start();
      const create = server.store.createWithCatalog;
      server.store.createWithCatalog = async (...args) => {
        if (committed) await create(...args);
        server.loadFails = true;
        throw new Error("app server stopped");
      };
      await expect(first.providerDefinitions.connect({
        connectionId: "work-api", adapterId: "fake-api", label: "Work API", fields: { "api-key": "opaque" },
      })).rejects.toThrow("app server stopped");
      expect(credentials.values.has("provider:work-api")).toBe(true);
      await first.close();

      // The next launch reconciles against the app server's definitions.
      server.loadFails = false;
      const next = compose({ server, credentials, registry });
      await next.start();
      expect(credentials.values.has("provider:work-api")).toBe(committed);
      if (committed) {
        await next.modelCatalog.explicitRefresh("work-api");
        expect(server.connected("work-api")).toBe(true);
      }
      await next.close();
    }
  });
});
