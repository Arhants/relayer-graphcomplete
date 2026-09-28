import { describe, expect, it } from "vitest";
import type { HarnessConfiguration } from "@relayer/harness-host";
import { expandCapabilitySuiteRun, expandTestRun } from "../src/run-plan.js";
import type { ResolvedCapabilitySuiteV1 } from "../src/suites/contracts.js";

const medium: HarnessConfiguration = {
  schemaVersion: 1,
  name: "codex-basic",
  implementation: "codex.basic",
  implementationVersion: 1,
  permissionBindings: { ask: {}, auto: {}, full: {} },
  settings: { modelReasoningEffort: "medium" },
};
const high: HarnessConfiguration = {
  ...medium,
  name: "codex-basic-high",
  settings: { modelReasoningEffort: "high" },
};

describe("test run expansion", () => {
  it("expands harness-agnostic cases across independently selected configurations", () => {
    const executions = expandTestRun({
      testRunId: "run-123",
      testCaseIds: ["case-a", "case-b"],
      harnessConfigurationNames: [medium.name, high.name],
      judgeConfiguration: { name: "judge-v1", threshold: 0.8 },
    }, new Map([[medium.name, medium], [high.name, high]]));

    expect(executions.map(({ testRunId, testCaseId, harnessConfigurationName }) => [testRunId, testCaseId, harnessConfigurationName])).toEqual([
      ["run-123", "case-a", "codex-basic"],
      ["run-123", "case-a", "codex-basic-high"],
      ["run-123", "case-b", "codex-basic"],
      ["run-123", "case-b", "codex-basic-high"],
    ]);
    expect(executions[0]!.harnessConfiguration).toEqual(medium);
    expect(executions[0]!.harnessConfiguration).not.toBe(medium);
    expect(executions[0]!.harnessConfigurationDigest).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(executions[0]!.harnessConfigurationDigest).not.toBe(executions[1]!.harnessConfigurationDigest);
  });

  it("rejects a selected name that was not resolved at the runner boundary", () => {
    expect(() => expandTestRun({
      testRunId: "run-123",
      testCaseIds: ["case-a"],
      harnessConfigurationNames: ["missing"],
      judgeConfiguration: { name: "none" },
    }, new Map())).toThrow("Unknown harness configuration: missing");
  });

  it("expands a resolved suite through the same ordered case by harness matrix", () => {
    const suite: ResolvedCapabilitySuiteV1 = {
      identity: { suiteId: "synthetic-suite", suiteDigest: `sha256:${"0".repeat(64)}`, status: "candidate", presentationContract: {} as ResolvedCapabilitySuiteV1["identity"]["presentationContract"], members: [
        { caseId: "case-a", expectedCaseSnapshotDigest: `sha256:${"1".repeat(64)}`, outcomeContractVersion: "outcome-v1", outcomeContractDigest: `sha256:${"2".repeat(64)}`, presentationPolicyDigest: `sha256:${"3".repeat(64)}` },
        { caseId: "case-b", expectedCaseSnapshotDigest: `sha256:${"4".repeat(64)}`, outcomeContractVersion: "outcome-v1", outcomeContractDigest: `sha256:${"5".repeat(64)}`, presentationPolicyDigest: `sha256:${"6".repeat(64)}` },
      ] },
      members: [
        { caseId: "case-a", expectedCaseSnapshotDigest: `sha256:${"1".repeat(64)}`, outcomeContractVersion: "outcome-v1", outcomeContractDigest: `sha256:${"2".repeat(64)}`, presentationPolicyDigest: `sha256:${"3".repeat(64)}`, caseSnapshot: {} as never },
        { caseId: "case-b", expectedCaseSnapshotDigest: `sha256:${"4".repeat(64)}`, outcomeContractVersion: "outcome-v1", outcomeContractDigest: `sha256:${"5".repeat(64)}`, presentationPolicyDigest: `sha256:${"6".repeat(64)}`, caseSnapshot: {} as never },
      ],
    };
    const executions = expandCapabilitySuiteRun({
      testRunId: "suite-run",
      suite,
      harnessConfigurationNames: [medium.name, high.name],
      judgeConfiguration: { name: "judge-v1" },
    }, new Map([[medium.name, medium], [high.name, high]]));

    expect(executions).toHaveLength(4);
    expect(executions.map(({ testCaseId }) => testCaseId)).toEqual(
      suite.members.flatMap(({ caseId }) => [caseId, caseId]),
    );
    expect(executions.every(({ suiteIdentity }) => suiteIdentity.suiteDigest === suite.identity.suiteDigest)).toBe(true);
    expect(executions[0]?.suiteIdentity).not.toBe(suite.identity);
    expect(Object.isFrozen(executions[0]?.suiteIdentity)).toBe(true);
  });
});
