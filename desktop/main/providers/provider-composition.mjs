import { ModelCatalogService } from "../models/model-catalog-service.mjs";
import {
  toProductCatalogSnapshot,
  unavailableModelCatalogSnapshot,
} from "../models/model-catalog-adapter.mjs";
import { ProviderDefinitionService } from "./provider-definition-service.mjs";

export function createProviderComposition({
  registry,
  definitionStore,
  credentialStore,
  publishCatalog,
  providerStatuses = async () => new Map(),
  runtimeDependencies = async () => ({}),
  prepareRuntime = async () => null,
  evaluateReadiness = async () => null,
  removeRuntimeState = async () => false,
  diagnostics = null,
  modelCatalogOptions = {},
}) {
  // The models each provider's catalog last published in this process. A post-upgrade
  // readiness evaluation evaluates the routes they give (#556).
  const publishedModels = new Map();
  const modelCatalog = new ModelCatalogService({
    adapters: [],
    diagnostics,
    // Each refresh carries the connection generation it started with (PROV-002).
    connectionGenerations: {
      current: (providerId) => providerDefinitions.connectionGeneration(providerId),
      resync: (providerId) => providerDefinitions.resyncConnectionGeneration(providerId),
    },
    publishSnapshot: async (snapshot, options) => {
      if (options?.reason === "explicit") {
        await providerDefinitions.evaluateCatalogReadiness(
          snapshot.providerId,
          snapshot.models ?? [],
          "explicit-repair",
        );
      }
      const published = await publishCatalog(snapshot, options);
      publishedModels.set(snapshot.providerId, snapshot.models ?? []);
      return published;
    },
    ...modelCatalogOptions,
  });
  let providerDefinitions;
  providerDefinitions = new ProviderDefinitionService({
    registry,
    definitionStore,
    credentialStore,
    diagnostics,
    providerStatuses,
    runtimeDependencies,
    prepareRuntime,
    evaluateReadiness,
    removeRuntimeState,
    publishCatalog: (snapshot, options) => publishCatalog(toProductCatalogSnapshot(snapshot), options),
    onRuntimeReady: (definition, runtime) => {
      modelCatalog.unregister(definition.id);
      modelCatalog.register(runtime.catalog ?? runtime);
    },
    onRuntimeRemoved: (definition) => modelCatalog.unregister(definition.id),
    onRuntimeChanged: (definition) => modelCatalog.providerChanged(definition.id),
    onRuntimeUnavailable: (definition) => {
      modelCatalog.unregister(definition.id);
      modelCatalog.register({
        providerId: definition.id,
        discover: async ({ signal, reason } = {}) => {
          if (reason !== "explicit") {
            return unavailableModelCatalogSnapshot({
              providerId: definition.id,
              providerLabel: definition.label,
            }, "The provider could not be activated.");
          }
          try {
            return await providerDefinitions.recoverUnavailable(definition.id, { signal });
          } catch (error) {
            if (signal?.aborted) throw error;
            return unavailableModelCatalogSnapshot({
              providerId: definition.id,
              providerLabel: definition.label,
            }, "The provider could not be activated.");
          }
        },
      });
    },
  });
  return Object.freeze({
    modelCatalog,
    providerDefinitions,
    async start() {
      await providerDefinitions.reconcileStartup();
      await providerDefinitions.activate();
      await modelCatalog.startup();
    },
    // Every active provider with its last published models, for an evaluation that is not
    // tied to one provider (the recipe-update trigger).
    async readinessRoutes() {
      return (await providerDefinitions.activeDefinitions())
        .filter(({ id }) => publishedModels.get(id)?.length)
        .map((providerDefinition) => Object.freeze({
          providerDefinition,
          models: publishedModels.get(providerDefinition.id),
        }));
    },
    async close() {
      const results = await Promise.allSettled([providerDefinitions.close(), modelCatalog.close()]);
      const failures = results.filter(({ status }) => status === "rejected");
      if (failures.length) throw new AggregateError(failures.map(({ reason }) => reason), "Provider composition did not close cleanly.");
    },
  });
}
