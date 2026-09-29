import { describe, expect, it, vi } from "vitest";

import {
  createHarnessReadinessCoordinator,
  startPostUpgradeReadiness,
} from "../desktop/main/services/harness-readiness.mjs";

function configuration(name, implementation, adapterId) {
  return {
    schemaVersion: 1,
    name,
    implementation,
    implementationVersion: 1,
    permissionBindings: { auto: {} },
    modelRules: { allow: [{ adapterId, modelIdRegex: ".*" }], deny: [] },
    executionAccessContracts: ["secret@1"],
    settings: {},
  };
}

describe("production harness readiness", () => {
  it("prepares shared recipes once and publishes independent compatible route results", async () => {
    const configurations = new Map([
      ["codex-basic", configuration("codex-basic", "codex.basic", "openai-api")],
      ["prime-agent-basic", configuration("prime-agent-basic", "prime.agent", "openai-api")],
      ["prime-agent-deep", configuration("prime-agent-deep", "prime.agent", "openai-api")],
      ["claude-basic", configuration("claude-basic", "claude.basic", "anthropic-api")],
    ]);
    const prepareRecipe = vi.fn(async (recipeId) => ({ recipeId, executable: `/managed/${recipeId}` }));
    const publishAvailability = vi.fn(async () => {});
    const coordinator = createHarnessReadinessCoordinator({
      configurations,
      digestConfiguration: ({ name }) => `sha256:${name}`,
      runtimeRequirements: {
        "codex.basic": { runtimeId: "codex", recipeId: "codex@0.147.0" },
        "claude.basic": { runtimeId: "claude", recipeId: "claude@0.3.250" },
      },
      prepareRecipe,
      checkers: {
        "codex.basic": async ({ runtime }) => ({ available: runtime.recipeId === "codex@0.147.0" }),
        "claude.basic": async () => ({ available: true }),
        "prime.agent": async () => ({
          available: false,
          reason: { code: "prime_managed_kernel_unavailable", message: "Prime is unavailable." },
        }),
      },
      publishAvailability,
    });

    const result = await coordinator.evaluate({
      trigger: "connect",
      providerDefinition: { id: "work", adapterId: "openai-api", accessContract: "secret@1" },
      models: [{ id: "gpt-work", visible: true, availability: "available" }],
    });

    expect(prepareRecipe).toHaveBeenCalledTimes(1);
    expect(prepareRecipe).toHaveBeenCalledWith("codex@0.147.0");
    expect(result.readyHarnessIds).toEqual(["codex-basic"]);
    expect(publishAvailability).toHaveBeenCalledWith([
      { harnessId: "codex-basic", configurationDigest: "sha256:codex-basic", generation: 1, available: true, unavailableReason: null },
      { harnessId: "prime-agent-basic", configurationDigest: "sha256:prime-agent-basic", generation: 1, available: false, unavailableReason: { code: "prime_managed_kernel_unavailable", message: "Prime is unavailable." } },
      { harnessId: "prime-agent-deep", configurationDigest: "sha256:prime-agent-deep", generation: 1, available: false, unavailableReason: { code: "prime_managed_kernel_unavailable", message: "Prime is unavailable." } },
    ]);
  });

  it("requires a readiness checker for every loaded production implementation", () => {
    expect(() => createHarnessReadinessCoordinator({
      configurations: new Map([["codex-basic", configuration("codex-basic", "codex.basic", "openai-api")]]),
      digestConfiguration: () => "sha256:codex-basic",
      runtimeRequirements: { "codex.basic": { runtimeId: "codex", recipeId: "codex@0.147.0" } },
      prepareRecipe: async () => ({}),
      checkers: {},
      publishAvailability: async () => {},
    })).toThrow("codex.basic has no production readiness checker");
  });

  it("does not run readiness for background, settings, picker, or send triggers", async () => {
    const prepareRecipe = vi.fn();
    const publishAvailability = vi.fn();
    const coordinator = createHarnessReadinessCoordinator({
      configurations: new Map([["codex-basic", configuration("codex-basic", "codex.basic", "openai-api")]]),
      digestConfiguration: () => "sha256:codex-basic",
      runtimeRequirements: { "codex.basic": { runtimeId: "codex", recipeId: "codex@0.147.0" } },
      prepareRecipe,
      checkers: { "codex.basic": async () => ({ available: true }) },
      publishAvailability,
    });

    for (const trigger of ["background", "settings-open", "picker", "send"]) {
      await expect(coordinator.evaluate({
        trigger,
        providerDefinition: { id: "work", adapterId: "openai-api", accessContract: "secret@1" },
        models: [{ id: "gpt-work", visible: true, availability: "available" }],
      })).resolves.toEqual({ readyHarnessIds: [], routeResults: [] });
    }
    expect(prepareRecipe).not.toHaveBeenCalled();
    expect(publishAvailability).not.toHaveBeenCalled();
  });

  it("requires both the access contract and exact model rule before preparing a route", async () => {
    const prepareRecipe = vi.fn(async () => ({ runtimeId: "codex" }));
    const publishAvailability = vi.fn(async () => {});
    const coordinator = createHarnessReadinessCoordinator({
      configurations: new Map([["codex-basic", configuration("codex-basic", "codex.basic", "openai-api")]]),
      digestConfiguration: () => "sha256:codex-basic",
      runtimeRequirements: { "codex.basic": { runtimeId: "codex", recipeId: "codex@0.147.0" } },
      prepareRecipe,
      checkers: { "codex.basic": async () => ({ available: true }) },
      publishAvailability,
    });

    await coordinator.evaluate({
      trigger: "connect",
      providerDefinition: { id: "work", adapterId: "openai-api", accessContract: "managed-runtime@1" },
      models: [{ id: "gpt-work", visible: true, availability: "available" }],
    });
    await coordinator.evaluate({
      trigger: "connect",
      providerDefinition: { id: "work", adapterId: "anthropic-api", accessContract: "secret@1" },
      models: [{ id: "gpt-work", visible: true, availability: "available" }],
    });

    expect(prepareRecipe).not.toHaveBeenCalled();
    expect(publishAvailability).not.toHaveBeenCalled();
  });

  it("drops a late readiness result after a newer evaluation starts for the same harness", async () => {
    let finishFirst;
    const first = new Promise((resolve) => { finishFirst = resolve; });
    const prepareRecipe = vi.fn()
      .mockImplementationOnce(() => first)
      .mockResolvedValueOnce({ runtimeId: "codex" });
    const publishAvailability = vi.fn(async () => {});
    const coordinator = createHarnessReadinessCoordinator({
      configurations: new Map([["codex-basic", configuration("codex-basic", "codex.basic", "openai-api")]]),
      digestConfiguration: () => "sha256:codex-basic",
      runtimeRequirements: { "codex.basic": { runtimeId: "codex", recipeId: "codex@0.147.0" } },
      prepareRecipe,
      checkers: { "codex.basic": async () => ({ available: true }) },
      publishAvailability,
    });
    const request = {
      trigger: "reconnect",
      providerDefinition: { id: "work", adapterId: "openai-api", accessContract: "secret@1" },
      models: [{ id: "gpt-work", visible: true, availability: "available" }],
    };
    const oldEvaluation = coordinator.evaluate(request);
    const newEvaluation = coordinator.evaluate(request);
    await newEvaluation;
    finishFirst({ runtimeId: "codex" });
    await expect(oldEvaluation).resolves.toEqual({ readyHarnessIds: [], routeResults: [] });
    expect(publishAvailability).toHaveBeenCalledTimes(1);
    expect(publishAvailability.mock.calls[0][0][0].generation).toBe(2);
  });

  it("serializes publication so an older HTTP write cannot land after a newer generation", async () => {
    let finishFirstPublish;
    const firstPublish = new Promise((resolve) => { finishFirstPublish = resolve; });
    const published = [];
    const coordinator = createHarnessReadinessCoordinator({
      configurations: new Map([["codex-basic", configuration("codex-basic", "codex.basic", "openai-api")]]),
      digestConfiguration: () => "sha256:codex-basic",
      runtimeRequirements: { "codex.basic": { runtimeId: "codex", recipeId: "codex@0.147.0" } },
      prepareRecipe: async () => ({ runtimeId: "codex" }),
      checkers: { "codex.basic": async () => ({ available: true }) },
      publishAvailability: async (updates) => {
        published.push(updates[0].generation);
        if (updates[0].generation === 1) await firstPublish;
      },
    });
    const request = {
      trigger: "reconnect",
      providerDefinition: { id: "work", adapterId: "openai-api", accessContract: "secret@1" },
      models: [{ id: "gpt-work", visible: true, availability: "available" }],
    };

    const oldEvaluation = coordinator.evaluate(request);
    await vi.waitFor(() => expect(published).toEqual([1]));
    const newEvaluation = coordinator.evaluate(request);
    await Promise.resolve();
    expect(published).toEqual([1]);
    finishFirstPublish();

    await expect(oldEvaluation).resolves.toEqual({ readyHarnessIds: [], routeResults: [] });
    await expect(newEvaluation).resolves.toMatchObject({ readyHarnessIds: ["codex-basic"] });
    expect(published).toEqual([1, 2]);
  });

  it("publishes still-current routes from an overlapping batch when only one harness is superseded", async () => {
    let finishPrime;
    const primePending = new Promise((resolve) => { finishPrime = resolve; });
    const codex = configuration("codex-basic", "codex.basic", "openai-api");
    const prime = {
      ...configuration("prime-agent-basic", "prime.agent", "openai-api"),
      modelRules: { allow: [{ adapterId: "openai-api", modelIdRegex: "^prime-" }], deny: [] },
    };
    const published = [];
    const coordinator = createHarnessReadinessCoordinator({
      configurations: new Map([[codex.name, codex], [prime.name, prime]]),
      digestConfiguration: ({ name }) => `sha256:${name}`,
      runtimeRequirements: {},
      prepareRecipe: async () => null,
      checkers: {
        "codex.basic": async () => ({ available: true }),
        "prime.agent": async () => primePending,
      },
      publishAvailability: async (updates) => { published.push(updates); },
    });
    const providerDefinition = { id: "work", adapterId: "openai-api", accessContract: "secret@1" };
    const overlapping = coordinator.evaluate({
      trigger: "reconnect",
      providerDefinition,
      models: [{ id: "codex-model" }, { id: "prime-model" }],
    });
    await Promise.resolve();
    const codexOnly = coordinator.evaluate({
      trigger: "reconnect",
      providerDefinition,
      models: [{ id: "codex-model" }],
    });
    await codexOnly;
    finishPrime({ available: true });

    await expect(overlapping).resolves.toMatchObject({ readyHarnessIds: ["prime-agent-basic"] });
    expect(published).toEqual([
      [{ harnessId: "codex-basic", configurationDigest: "sha256:codex-basic", generation: 2, available: true, unavailableReason: null }],
      [{ harnessId: "prime-agent-basic", configurationDigest: "sha256:prime-agent-basic", generation: 1, available: true, unavailableReason: null }],
    ]);
  });

  // PR #576 review: quitting stops the background post-upgrade evaluation. It then starts no
  // preparation and no repair, and a preparation already running publishes nothing, so a
  // cancelled evaluation never clears the app server's due mark.
  it("stops the post-upgrade evaluation for shutdown before it prepares or publishes", async () => {
    const configurations = new Map([["codex-basic", configuration("codex-basic", "codex.basic", "openai-api")]]);
    let releasePrepare;
    const prepareRecipe = vi.fn(() => new Promise((resolve) => { releasePrepare = resolve; }));
    const publishAvailability = vi.fn(async () => {});
    const readiness = createHarnessReadinessCoordinator({
      configurations,
      digestConfiguration: ({ name }) => `sha256:${name}`,
      runtimeRequirements: { "codex.basic": { runtimeId: "codex", recipeId: "codex@0.147.0" } },
      prepareRecipe,
      checkers: { "codex.basic": async () => ({ available: true }) },
      publishAvailability,
      recipeInstalled: async () => true,
    });
    const providers = [{
      providerDefinition: { id: "work", adapterId: "openai-api", accessContract: "secret@1" },
      models: [{ id: "gpt-work", visible: true, availability: "available" }],
    }];

    // Stopped while it still reads the due marks: nothing starts.
    let releaseMarks;
    const repairProviders = vi.fn(async () => {});
    const early = startPostUpgradeReadiness({
      readiness,
      updatesDue: () => new Promise((resolve) => { releaseMarks = resolve; }),
      routes: async () => providers,
      repairProviders,
    });
    await vi.waitFor(() => expect(releaseMarks).toBeTypeOf("function"));
    early.stop();
    releaseMarks(["codex-basic"]);
    await expect(early.evaluation).resolves.toBeNull();
    expect(repairProviders).not.toHaveBeenCalled();
    expect(prepareRecipe).not.toHaveBeenCalled();

    // Stopped while preparing: the preparation's result is not published.
    const late = startPostUpgradeReadiness({
      readiness, updatesDue: async () => ["codex-basic"], routes: async () => providers,
    });
    await vi.waitFor(() => expect(prepareRecipe).toHaveBeenCalledOnce());
    late.stop();
    releasePrepare({ recipeId: "codex@0.147.0" });
    await late.evaluation;
    expect(publishAvailability).not.toHaveBeenCalled();
  });
});
