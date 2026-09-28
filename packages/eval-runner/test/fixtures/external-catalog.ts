import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { bindAutonomousCaseSnapshot, canonicalJson, digestAutonomousCaseSnapshot } from "../../src/cases/catalog.js";
import { createAutonomousCaseSnapshot } from "../../src/cases/contracts.js";
import type { EvalCatalogV1, EvalCaseRegistrationV1 } from "../../src/eval-catalog.js";
import { h3AutonomousFixCase, h3AutonomousInvestigationCase } from "../../src/project-cases/h3-autonomous-cases.js";
import { computeCapabilitySuiteDigest, type CapabilitySuiteManifestV1 } from "../../src/suites/contracts.js";
import { GRAPH_PRESENTATION_RUBRIC_V11 } from "../../src/simulated-user/rubric.js";
import { SIMULATED_USER_JUDGE_CONTRACT_V1 } from "../../src/simulated-user/contracts.js";
import { SIMULATED_USER_PROMPT_VERSION } from "../../src/simulated-user/judge-runner.js";
import { RECURSIVE_PRESENTATION_CONTRACT_ID, RECURSIVE_PRESENTATION_CONTRACT_VERSION } from "../../src/simulated-user/recursive-review.js";

const digest = (value: unknown) => `sha256:${createHash("sha256").update(canonicalJson(value)).digest("hex")}` as `sha256:${string}`;
const originals = [h3AutonomousFixCase, h3AutonomousInvestigationCase] as const;
const boundCases = originals.map((original, index) => {
  const id = `fixture.external-${index === 0 ? "a" : "b"}`;
  const name = `External fixture ${index === 0 ? "A" : "B"}`;
  const description = "A deterministic synthetic external evaluation case.";
  const definition = {
    ...original.definition,
    id,
    name,
    description,
    threads: [{ id: "implementation", name: "Implementation", permissionProfileId: "auto" as const, mutationPolicy: "writable" as const, workspaceGrade: "implementation" as const, prompts: ["Implement the synthetic fixture change and verify it."] }],
  };
  return bindAutonomousCaseSnapshot(definition, createAutonomousCaseSnapshot({
    id, name, description,
    category: original.snapshot.category,
    taskType: original.snapshot.taskType,
    authoringStatus: original.snapshot.authoringStatus,
    artifacts: original.snapshot.artifacts,
    presentation: original.snapshot.presentation,
  }));
});

export function createSyntheticExternalCatalog(): EvalCatalogV1 {
  const cases: EvalCaseRegistrationV1[] = boundCases.map((boundCase) => ({
    definition: { ...boundCase.definition, caseSnapshot: boundCase.catalogSnapshot, caseSnapshotDigest: boundCase.snapshotDigest },
    available: true,
    unavailableReason: null,
    boundCase,
    materialize: async ({ workspaceDirectory }) => {
      await mkdir(workspaceDirectory, { recursive: true });
      return { workspaceDirectory, repositoryUrl: boundCase.snapshot.artifacts.workspace.source, sourceRevision: boundCase.snapshot.artifacts.workspace.revision };
    },
    grade: async () => [{ name: "workspace:contract", passed: true, detail: "Synthetic deterministic result." }],
    evaluateMandatoryGate: (_gate, checks) => ({ complete: checks.length > 0, passed: checks.length > 0 && checks.every(({ passed }) => passed), matched: checks }),
  }));
  const body = {
    schemaVersion: 1 as const,
    id: "synthetic-external-suite",
    name: "Synthetic external suite",
    status: "candidate" as const,
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
    members: boundCases.map(({ snapshot }) => ({
      caseId: snapshot.id,
      expectedCaseSnapshotDigest: digestAutonomousCaseSnapshot(snapshot),
      outcomeContractVersion: snapshot.artifacts.outcomeRubric.rubricVersion,
      outcomeContractDigest: digest(snapshot.artifacts.outcomeRubric),
      presentationPolicyDigest: digest(snapshot.presentation),
    })),
  };
  const suite: CapabilitySuiteManifestV1 = { ...body, suiteDigest: computeCapabilitySuiteDigest(body) };
  return { schemaVersion: 1, cases, suites: [suite] };
}
