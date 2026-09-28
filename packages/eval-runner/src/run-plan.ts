import { digestHarnessConfiguration, type HarnessConfiguration } from "@relayer/harness-host";
import type { CapabilitySuiteIdentityV1, ResolvedCapabilitySuiteV1 } from "./suites/contracts.js";

export interface TestRunSelection<JudgeConfiguration> {
  readonly testRunId: string;
  readonly testCaseIds: readonly string[];
  readonly harnessConfigurationNames: readonly string[];
  readonly judgeConfiguration: JudgeConfiguration;
}

export interface TestExecutionPlan<JudgeConfiguration> {
  readonly testRunId: string;
  readonly testCaseId: string;
  readonly harnessConfigurationName: string;
  readonly harnessConfiguration: HarnessConfiguration;
  readonly harnessConfigurationDigest: string;
  readonly judgeConfiguration: JudgeConfiguration;
}

export interface CapabilitySuiteExecutionPlan<JudgeConfiguration> extends TestExecutionPlan<JudgeConfiguration> {
  readonly suiteIdentity: CapabilitySuiteIdentityV1;
}

export function expandTestRun<JudgeConfiguration>(
  selection: TestRunSelection<JudgeConfiguration>,
  harnessConfigurations: ReadonlyMap<string, HarnessConfiguration>,
): readonly TestExecutionPlan<JudgeConfiguration>[] {
  requireIdentifier(selection.testRunId, "test run ID");
  requireUniqueNonEmpty(selection.testCaseIds, "test case IDs");
  requireUniqueNonEmpty(selection.harnessConfigurationNames, "harness configuration names");

  return selection.testCaseIds.flatMap((testCaseId) => {
    requireIdentifier(testCaseId, "test case ID");
    return selection.harnessConfigurationNames.map((harnessConfigurationName) => {
      requireIdentifier(harnessConfigurationName, "harness configuration name");
      const resolved = harnessConfigurations.get(harnessConfigurationName);
      if (resolved === undefined) throw new Error(`Unknown harness configuration: ${harnessConfigurationName}`);
      if (resolved.name !== harnessConfigurationName) {
        throw new Error(`Harness configuration catalog key ${harnessConfigurationName} does not match snapshot name ${resolved.name}`);
      }
      const harnessConfiguration = structuredClone(resolved);
      return {
        testRunId: selection.testRunId,
        testCaseId,
        harnessConfigurationName,
        harnessConfiguration,
        harnessConfigurationDigest: digestHarnessConfiguration(harnessConfiguration),
        judgeConfiguration: structuredClone(selection.judgeConfiguration),
      };
    });
  });
}

export function expandCapabilitySuiteRun<JudgeConfiguration>(
  input: {
    readonly testRunId: string;
    readonly suite: ResolvedCapabilitySuiteV1;
    readonly harnessConfigurationNames: readonly string[];
    readonly judgeConfiguration: JudgeConfiguration;
  },
  harnessConfigurations: ReadonlyMap<string, HarnessConfiguration>,
): readonly CapabilitySuiteExecutionPlan<JudgeConfiguration>[] {
  const plans = expandTestRun({
    testRunId: input.testRunId,
    testCaseIds: input.suite.members.map(({ caseId }) => caseId),
    harnessConfigurationNames: input.harnessConfigurationNames,
    judgeConfiguration: input.judgeConfiguration,
  }, harnessConfigurations);
  return plans.map((plan) => deepFreeze({
    ...plan,
    suiteIdentity: structuredClone(input.suite.identity),
  }));
}

function requireUniqueNonEmpty(values: readonly string[], label: string): void {
  if (values.length === 0) throw new Error(`Test run must select at least one ${label.slice(0, -1)}`);
  if (new Set(values).size !== values.length) throw new Error(`Test run contains duplicate ${label}`);
}

function requireIdentifier(value: string, label: string): void {
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(value)) throw new Error(`Invalid ${label}: ${value}`);
}

function deepFreeze<Value>(value: Value): Value {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
