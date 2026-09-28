import { describe, expect, it, vi } from "vitest";

import {
  authorizeExternalLiveSelection,
  evalSelectionRequiresLiveAuthorization,
  validateExternalLiveAuthorization,
} from "../desktop/eval-renderer/eval-live-authorization.js";

const catalog = {
  externalCaseIds: ["capability.external-a", "capability.external-b"],
  cases: [],
  suites: [{
    suiteId: "capability-suite-v1",
    available: true,
    members: [{ caseId: "capability.external-b" }, { caseId: "capability.external-a" }],
  }],
  harnessConfigurations: [
    { name: "fixture", implementation: "fixture.task-system" },
    { name: "codex", implementation: "codex.basic" },
  ],
  judges: [{ id: "deterministic-graph-contract" }, { id: "simulated-user" }],
};

describe("generic external Eval live authorization", () => {
  it("requires authorization for external live harnesses and judges, not deterministic fixture matrices", () => {
    expect(evalSelectionRequiresLiveAuthorization({
      testCaseIds: ["capability.external-a"], harnessConfigurationNames: ["fixture"],
      judgeConfigurationName: "deterministic-graph-contract",
    }, catalog)).toBe(false);
    expect(evalSelectionRequiresLiveAuthorization({
      testCaseIds: ["capability.external-a"], harnessConfigurationNames: ["codex"],
      judgeConfigurationName: "deterministic-graph-contract",
    }, catalog)).toBe(true);
    expect(evalSelectionRequiresLiveAuthorization({
      testCaseIds: ["capability.external-a"], harnessConfigurationNames: ["fixture"],
      judgeConfigurationName: "simulated-user",
    }, catalog)).toBe(true);
    expect(evalSelectionRequiresLiveAuthorization({
      testCaseIds: ["builtin.case"], harnessConfigurationNames: ["codex"],
      judgeConfigurationName: "simulated-user",
    }, catalog)).toBe(false);
  });

  it("records an explicit cap and binds confirmation to exact ordered suite resolution", () => {
    const selection = {
      suiteId: "capability-suite-v1",
      testCaseIds: [],
      harnessConfigurationNames: ["codex"],
      judgeConfigurationName: "deterministic-graph-contract",
    };
    const requestCostCap = vi.fn(() => "4.75");
    const confirmLiveRun = vi.fn(() => true);
    const authorized = authorizeExternalLiveSelection(selection, catalog, { requestCostCap, confirmLiveRun });

    expect(requestCostCap).toHaveBeenCalledOnce();
    expect(confirmLiveRun.mock.calls[0][0]).toContain("$4.75 USD");
    expect(confirmLiveRun.mock.calls[0][0]).toContain("does not meter or enforce provider spend");
    expect(authorized.liveAuthorization).toEqual({
      confirmed: true,
      credentialReference: "connected-product-provider",
      declaredCostCapUsd: 4.75,
      testCaseIds: ["capability.external-b", "capability.external-a"],
      harnessConfigurationNames: ["codex"],
      judgeConfigurationName: "deterministic-graph-contract",
    });
    expect(validateExternalLiveAuthorization({
      selection,
      resolvedCaseIds: ["capability.external-b", "capability.external-a"],
      authorization: authorized.liveAuthorization,
      externalCaseIds: catalog.externalCaseIds,
      harnessConfigurations: catalog.harnessConfigurations,
    })).toEqual(authorized.liveAuthorization);
  });

  it.each([
    ["missing confirmation", { confirmed: false }],
    ["wrong credential reference", { confirmed: true, credentialReference: "caller-invented" }],
    ["nonpositive cap", { confirmed: true, credentialReference: "connected-product-provider", declaredCostCapUsd: 0 }],
    ["case order drift", { confirmed: true, credentialReference: "connected-product-provider", declaredCostCapUsd: 1, testCaseIds: ["capability.external-a", "capability.external-b"] }],
    ["harness drift", { confirmed: true, credentialReference: "connected-product-provider", declaredCostCapUsd: 1, testCaseIds: ["capability.external-b", "capability.external-a"], harnessConfigurationNames: ["fixture"] }],
    ["judge drift", { confirmed: true, credentialReference: "connected-product-provider", declaredCostCapUsd: 1, testCaseIds: ["capability.external-b", "capability.external-a"], harnessConfigurationNames: ["codex"], judgeConfigurationName: "simulated-user" }],
    ["sparse case binding", { confirmed: true, credentialReference: "connected-product-provider", declaredCostCapUsd: 1, testCaseIds: Object.assign(new Array(2), { 1: "capability.external-a" }), harnessConfigurationNames: ["codex"], judgeConfigurationName: "deterministic-graph-contract" }],
  ])("rejects %s at the service authorization boundary", (_name, partial) => {
    const selection = {
      testCaseIds: ["capability.external-b", "capability.external-a"],
      harnessConfigurationNames: ["codex"],
      judgeConfigurationName: "deterministic-graph-contract",
    };
    expect(() => validateExternalLiveAuthorization({
      selection,
      resolvedCaseIds: selection.testCaseIds,
      authorization: partial,
      externalCaseIds: catalog.externalCaseIds,
      harnessConfigurations: catalog.harnessConfigurations,
    })).toThrow("External live Eval requires confirmation");
  });

  it("allows an external deterministic fixture run and refuses missing suite resolution", () => {
    const selection = {
      testCaseIds: ["capability.external-a"], harnessConfigurationNames: ["fixture"],
      judgeConfigurationName: "deterministic-graph-contract",
    };
    expect(validateExternalLiveAuthorization({
      selection,
      resolvedCaseIds: selection.testCaseIds,
      authorization: null,
      externalCaseIds: catalog.externalCaseIds,
      harnessConfigurations: catalog.harnessConfigurations,
    })).toBeNull();
    expect(() => authorizeExternalLiveSelection({ suiteId: "absent", testCaseIds: [], harnessConfigurationNames: ["codex"] }, catalog, {
      requestCostCap: vi.fn(), confirmLiveRun: vi.fn(),
    })).toThrow("selected Eval suite is unavailable");
  });
});
