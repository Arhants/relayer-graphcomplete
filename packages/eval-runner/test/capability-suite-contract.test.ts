import { describe, expect, it } from "vitest";
import { h3AutonomousFixCase } from "../src/project-cases/h3-autonomous-cases.js";
import { computeCapabilitySuiteDigest, projectCapabilitySuiteCatalog, resolveCapabilitySuite, type CapabilitySuiteManifestV1 } from "../src/suites/contracts.js";
import { GRAPH_PRESENTATION_RUBRIC_V11 } from "../src/simulated-user/rubric.js";
import { SIMULATED_USER_JUDGE_CONTRACT_V1 } from "../src/simulated-user/contracts.js";
import { SIMULATED_USER_PROMPT_VERSION } from "../src/simulated-user/judge-runner.js";
import { RECURSIVE_PRESENTATION_CONTRACT_ID, RECURSIVE_PRESENTATION_CONTRACT_VERSION } from "../src/simulated-user/recursive-review.js";
import { canonicalJson, digestAutonomousCaseSnapshot } from "../src/cases/catalog.js";

import { createHash } from "node:crypto";
const digest = (value: unknown) => `sha256:${createHash("sha256").update(canonicalJson(value)).digest("hex")}` as `sha256:${string}`;

function manifest(): CapabilitySuiteManifestV1 {
  const snapshot = h3AutonomousFixCase.snapshot;
  const body = {
    schemaVersion: 1 as const, id: "synthetic-suite", name: "Synthetic suite", status: "candidate" as const,
    presentationContract: {
      rubricVersion: GRAPH_PRESENTATION_RUBRIC_V11.rubricVersion,
      rubricDigest: digest(GRAPH_PRESENTATION_RUBRIC_V11),
      recursiveContractId: RECURSIVE_PRESENTATION_CONTRACT_ID,
      recursiveContractVersion: RECURSIVE_PRESENTATION_CONTRACT_VERSION,
      recursiveContractDigest: digest({ contractId: RECURSIVE_PRESENTATION_CONTRACT_ID, version: RECURSIVE_PRESENTATION_CONTRACT_VERSION }),
      judgeContractId: SIMULATED_USER_JUDGE_CONTRACT_V1.contractId,
      judgeContractDigest: digest(SIMULATED_USER_JUDGE_CONTRACT_V1),
      promptVersion: SIMULATED_USER_PROMPT_VERSION,
    },
    members: [{ caseId: snapshot.id, expectedCaseSnapshotDigest: digestAutonomousCaseSnapshot(snapshot), outcomeContractVersion: snapshot.artifacts.outcomeRubric.rubricVersion, outcomeContractDigest: digest(snapshot.artifacts.outcomeRubric), presentationPolicyDigest: digest(snapshot.presentation) }],
  };
  return { ...body, suiteDigest: computeCapabilitySuiteDigest(body) };
}

describe("generic capability suite contract", () => {
  it("resolves a caller supplied case set and exposes only its public snapshot", () => {
    const suite = manifest();
    const resolved = resolveCapabilitySuite(suite, [h3AutonomousFixCase]);
    expect(resolved.members.map(({ caseId }) => caseId)).toEqual([h3AutonomousFixCase.snapshot.id]);
    expect(JSON.stringify(projectCapabilitySuiteCatalog(suite, [h3AutonomousFixCase]))).not.toContain("sealedPath");
    expect(Object.isFrozen(resolved)).toBe(true);
  });
  it("fails closed when the selected catalog omits or duplicates a member", () => {
    const suite = manifest();
    expect(() => resolveCapabilitySuite(suite, [])).toThrow("references missing case");
    expect(() => resolveCapabilitySuite(suite, [h3AutonomousFixCase, h3AutonomousFixCase])).toThrow("duplicate case ID");
  });
  it("detects snapshot drift and suite digest changes", () => {
    const suite = manifest();
    const stale = { ...h3AutonomousFixCase, snapshotDigest: `sha256:${"0".repeat(64)}` as `sha256:${string}` };
    expect(() => resolveCapabilitySuite(suite, [stale])).toThrow("case snapshot drifted");
    expect(() => resolveCapabilitySuite({ ...suite, name: "altered" }, [h3AutonomousFixCase])).toThrow("digest drifted");
  });
});
