export const evalCredentialReference = "connected-product-provider";

const deterministicHarnessImplementations = new Set([
  "fixture.task-system",
  "fixture.node-detail",
  "fixture.graph-memory",
]);

export function resolveEvalSelectionCaseIds(selection, catalog) {
  if (selection?.suiteId) {
    const suite = catalog?.suites?.find(({ suiteId }) => suiteId === selection.suiteId);
    if (!suite || suite.available !== true || !Array.isArray(suite.members)) {
      throw new Error("The selected Eval suite is unavailable.");
    }
    return suite.members.map(({ caseId }) => caseId);
  }
  return Array.isArray(selection?.testCaseIds) ? [...selection.testCaseIds] : [];
}

export function evalSelectionRequiresLiveAuthorization(selection, catalog, resolvedCaseIds = resolveEvalSelectionCaseIds(selection, catalog)) {
  const externalCaseIds = new Set(catalog?.externalCaseIds ?? []);
  if (!resolvedCaseIds.some((caseId) => externalCaseIds.has(caseId))) return false;

  const configurations = new Map((catalog?.harnessConfigurations ?? []).map((configuration) => [configuration.name, configuration]));
  const liveHarnessSelected = (selection?.harnessConfigurationNames ?? []).some((name) => {
    const configuration = configurations.get(name);
    // Unknown configuration identities fail closed for external cases.
    return !configuration || !deterministicHarnessImplementations.has(configuration.implementation);
  });
  const liveJudgeSelected = selection?.judgeConfigurationName !== "deterministic-graph-contract";
  return liveHarnessSelected || liveJudgeSelected;
}

export function validateExternalLiveAuthorization({
  selection,
  resolvedCaseIds,
  authorization,
  externalCaseIds,
  harnessConfigurations,
}) {
  const externalIds = new Set(externalCaseIds ?? []);
  const includesExternalCase = resolvedCaseIds.some((caseId) => externalIds.has(caseId));
  if (!includesExternalCase) return null;

  const configurations = new Map((harnessConfigurations ?? []).map((configuration) => [configuration.name, configuration]));
  const hasLiveHarness = selection.harnessConfigurationNames.some((name) => {
    const configuration = configurations.get(name);
    return !configuration || !deterministicHarnessImplementations.has(configuration.implementation);
  });
  const hasLiveJudge = selection.judgeConfigurationName !== "deterministic-graph-contract";
  if (!hasLiveHarness && !hasLiveJudge) return null;

  if (authorization?.confirmed !== true
    || authorization.credentialReference !== evalCredentialReference
    || !Number.isFinite(authorization.declaredCostCapUsd)
    || authorization.declaredCostCapUsd <= 0
    || !sameOrderedStrings(authorization.testCaseIds, resolvedCaseIds)
    || !sameOrderedStrings(authorization.harnessConfigurationNames, selection.harnessConfigurationNames)
    || authorization.judgeConfigurationName !== selection.judgeConfigurationName) {
    throw new Error("External live Eval requires confirmation, a declared positive USD cost cap, and authorization bound to the resolved cases, harnesses, and judge.");
  }
  return {
    confirmed: true,
    credentialReference: evalCredentialReference,
    declaredCostCapUsd: authorization.declaredCostCapUsd,
    testCaseIds: [...resolvedCaseIds],
    harnessConfigurationNames: [...selection.harnessConfigurationNames],
    judgeConfigurationName: selection.judgeConfigurationName,
  };
}

export function authorizeExternalLiveSelection(selection, catalog, { requestCostCap, confirmLiveRun }) {
  const resolvedCaseIds = resolveEvalSelectionCaseIds(selection, catalog);
  if (!evalSelectionRequiresLiveAuthorization(selection, catalog, resolvedCaseIds)) return structuredClone(selection);

  const capInput = requestCostCap("Enter the maximum declared spend for this external live Eval run in USD.");
  if (capInput === null || capInput === undefined) return null;
  const declaredCostCapUsd = typeof capInput === "number" ? capInput : Number(String(capInput).trim());
  if (!Number.isFinite(declaredCostCapUsd) || declaredCostCapUsd <= 0) {
    throw new Error("Enter a positive USD cost cap to authorize external live Eval.");
  }

  const configurationNames = selection.harnessConfigurationNames.join(", ");
  const caseCount = resolvedCaseIds.length;
  if (!confirmLiveRun(
    `Authorize live external Eval for ${caseCount} case(s) across ${configurationNames || "the selected harnesses"} and judge ${selection.judgeConfigurationName}? Declared maximum spend: $${declaredCostCapUsd.toFixed(2)} USD. The cap is recorded with this authorization; Eval does not meter or enforce provider spend.`,
  )) return null;

  return {
    ...structuredClone(selection),
    liveAuthorization: {
      confirmed: true,
      credentialReference: evalCredentialReference,
      declaredCostCapUsd,
      testCaseIds: resolvedCaseIds,
      harnessConfigurationNames: [...selection.harnessConfigurationNames],
      judgeConfigurationName: selection.judgeConfigurationName,
    },
  };
}

function sameOrderedStrings(value, expected) {
  return Array.isArray(value)
    && value.length === expected.length
    && Array.from(value).every((item, index) => item === expected[index]);
}
