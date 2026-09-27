import { createProviderComposition } from "./provider-composition.mjs";
import { productionProviderAdapterRegistry } from "./provider-adapter-registry.mjs";
import { createHarnessReadinessCoordinator } from "../services/harness-readiness.mjs";
import { checkPrimeManagedRuntime } from "../services/prime-managed-runtime.mjs";
import { HARNESS_MANAGED_RUNTIME_REQUIREMENTS } from "../../shared/managed-runtime-requirements.mjs";

export function createProductProviderComposition({ runtimeSession, graphRuntime, productServer,
  configurations = runtimeSession.configurations, prepareRecipe, createComposition = createProviderComposition,
  ...options }) {
  const executable = (runtime, id) => runtime?.runtimeId === id
    && typeof runtime.executable === "string" && runtime.executable.trim() !== ""
    && runtime.environment !== null && typeof runtime.environment === "object";
  const readiness = createHarnessReadinessCoordinator({
    configurations, digestConfiguration: runtimeSession.digestConfiguration,
    runtimeRequirements: HARNESS_MANAGED_RUNTIME_REQUIREMENTS, prepareRecipe,
    checkers: {
      "codex.basic": async ({ runtime }) => ({ available: executable(runtime, "codex") }),
      "claude.basic": async ({ runtime }) => ({ available: executable(runtime, "claude")
        && typeof runtime.moduleUrl === "string" && runtime.moduleUrl.trim() !== "" }),
      "prime.agent": ({ runtime }) => checkPrimeManagedRuntime({ runtime }),
    },
    publishAvailability: async (updates) => {
      await productServer.publishHarnessReadiness(updates);
      await graphRuntime.recordHarnessReadiness(updates);
    },
    diagnostics: options.diagnostics,
  });
  return createComposition({
    ...options, registry: productionProviderAdapterRegistry,
    definitionStore: productServer.providerDefinitionStore(),
    providerStatuses: () => productServer.providerStatuses(),
    evaluateReadiness: (input) => readiness.evaluate(input),
    publishCatalog: (snapshot, options) => productServer.publishProviderCatalog(snapshot, options),
  });
}
