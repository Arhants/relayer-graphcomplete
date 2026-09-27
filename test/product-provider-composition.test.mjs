import { expect, it } from "vitest";
import { createProductProviderComposition } from "../desktop/main/providers/product-provider-composition.mjs";

it("uses host credentials unchanged and publishes checked readiness to product before runtime", async () => {
  const calls = [];
  const credentialStore = { get: async () => "host-owned" };
  const configuration = { schemaVersion: 1, name: "codex-basic", implementation: "codex.basic", implementationVersion: 1,
    permissionBindings: { auto: {} }, modelRules: { allow: [{ adapterId: "openai-api", modelIdRegex: ".*" }], deny: [] }, executionAccessContracts: ["secret@1"], settings: {} };
  const composition = createProductProviderComposition({
    runtimeSession: { configurations: new Map([[configuration.name, configuration]]), digestConfiguration: () => "digest" },
    credentialStore, createComposition: (options) => options,
    prepareRecipe: async () => { calls.push("prepare"); return { runtimeId: "codex", executable: "/managed/codex", environment: {} }; },
    productServer: { providerDefinitionStore: () => ({}), providerStatuses: () => [],
      publishHarnessReadiness: async (updates) => { calls.push("product"); expect(updates[0].available).toBe(true); } },
    graphRuntime: { recordHarnessReadiness: async () => { calls.push("runtime"); } },
  });
  expect(composition.credentialStore).toBe(credentialStore);
  const result = await composition.evaluateReadiness({ trigger: "connect", providerDefinition: { id: "work", adapterId: "openai-api", accessContract: "secret@1" }, models: [{ id: "model", visible: true, availability: "available" }] });
  expect(result.readyHarnessIds).toEqual(["codex-basic"]);
  expect(calls).toEqual(["prepare", "product", "runtime"]);
});
