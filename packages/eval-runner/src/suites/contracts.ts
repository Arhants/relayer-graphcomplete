import { createHash } from "node:crypto";

import type { BoundAutonomousCase } from "../cases/catalog.js";
import { canonicalJson, digestAutonomousCaseSnapshot } from "../cases/catalog.js";
import type { AutonomousCaseSnapshot, CaseContentDigest, PublicAutonomousCaseSnapshot } from "../cases/contracts.js";
import { GRAPH_PRESENTATION_RUBRIC_V11 } from "../simulated-user/rubric.js";
import { SIMULATED_USER_JUDGE_CONTRACT_V1 } from "../simulated-user/contracts.js";
import { SIMULATED_USER_PROMPT_VERSION } from "../simulated-user/judge-runner.js";
import { RECURSIVE_PRESENTATION_CONTRACT_ID, RECURSIVE_PRESENTATION_CONTRACT_VERSION } from "../simulated-user/recursive-review.js";

export interface CapabilitySuiteMemberV1 {
  readonly caseId: string;
  readonly expectedCaseSnapshotDigest: CaseContentDigest;
  readonly outcomeContractVersion: string;
  readonly outcomeContractDigest: CaseContentDigest;
  readonly presentationPolicyDigest: CaseContentDigest;
}

export interface CapabilitySuiteManifestV1 {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly name: string;
  readonly status: "candidate";
  readonly presentationContract: {
    readonly rubricVersion: string;
    readonly rubricDigest: CaseContentDigest;
    readonly recursiveContractId: string;
    readonly recursiveContractVersion: number;
    readonly recursiveContractDigest: CaseContentDigest;
    readonly judgeContractId: string;
    readonly judgeContractDigest: CaseContentDigest;
    readonly promptVersion: string;
  };
  readonly members: readonly CapabilitySuiteMemberV1[];
  readonly suiteDigest: CaseContentDigest;
}

export interface ResolvedCapabilitySuiteMemberV1 extends CapabilitySuiteMemberV1 {
  readonly caseSnapshot: PublicAutonomousCaseSnapshot;
}

export interface CapabilitySuiteIdentityV1 {
  readonly suiteId: string;
  readonly suiteDigest: CaseContentDigest;
  readonly status: "candidate";
  readonly presentationContract: CapabilitySuiteManifestV1["presentationContract"];
  readonly members: readonly CapabilitySuiteMemberV1[];
}

export interface ResolvedCapabilitySuiteV1 {
  readonly identity: CapabilitySuiteIdentityV1;
  readonly members: readonly ResolvedCapabilitySuiteMemberV1[];
}

export interface PublicCapabilitySuiteV1 extends CapabilitySuiteIdentityV1 {
  readonly schemaVersion: 1;
  readonly name: string;
  readonly available: boolean;
  readonly unavailableReason: string | null;
}


type AnyBoundCase = BoundAutonomousCase<unknown>;

function digest(value: unknown): CaseContentDigest {
  return `sha256:${createHash("sha256").update(canonicalJson(value)).digest("hex")}`;
}

function outcomeContract(snapshot: AutonomousCaseSnapshot): unknown {
  return snapshot.artifacts.outcomeRubric;
}

function presentationContract(snapshot: AutonomousCaseSnapshot): unknown {
  return snapshot.presentation;
}

function manifestBody(
  manifest: Omit<CapabilitySuiteManifestV1, "suiteDigest">,
): unknown {
  return {
    schemaVersion: manifest.schemaVersion,
    id: manifest.id,
    name: manifest.name,
    status: manifest.status,
    presentationContract: manifest.presentationContract,
    members: manifest.members,
  };
}

export function computeCapabilitySuiteDigest(
  manifest: Omit<CapabilitySuiteManifestV1, "suiteDigest">,
): CaseContentDigest {
  return digest(manifestBody(manifest));
}

export function resolveCapabilitySuite(
  manifest: CapabilitySuiteManifestV1,
  cases: readonly AnyBoundCase[],
): ResolvedCapabilitySuiteV1 {
  validateManifestShape(manifest);
  if (
    manifest.presentationContract.rubricVersion !==
      GRAPH_PRESENTATION_RUBRIC_V11.rubricVersion ||
    manifest.presentationContract.rubricDigest !==
      digest(GRAPH_PRESENTATION_RUBRIC_V11)
  ) {
    throw new Error(
      `Capability suite ${manifest.id} presentation rubric drifted.`,
    );
  }
  if (
    manifest.presentationContract.recursiveContractId !==
      RECURSIVE_PRESENTATION_CONTRACT_ID ||
    manifest.presentationContract.recursiveContractVersion !==
      RECURSIVE_PRESENTATION_CONTRACT_VERSION ||
    manifest.presentationContract.recursiveContractDigest !==
      digest({
        contractId: RECURSIVE_PRESENTATION_CONTRACT_ID,
        version: RECURSIVE_PRESENTATION_CONTRACT_VERSION,
      })
  ) {
    throw new Error(
      `Capability suite ${manifest.id} recursive presentation contract drifted.`,
    );
  }
  if (
    manifest.presentationContract.judgeContractId !==
      SIMULATED_USER_JUDGE_CONTRACT_V1.contractId ||
    manifest.presentationContract.judgeContractDigest !==
      digest(SIMULATED_USER_JUDGE_CONTRACT_V1) ||
    manifest.presentationContract.promptVersion !==
      SIMULATED_USER_PROMPT_VERSION
  ) {
    throw new Error(
      `Capability suite ${manifest.id} simulated-user judge contract drifted.`,
    );
  }
  const caseCatalog = new Map<string, AnyBoundCase>();
  for (const entry of cases) {
    if (caseCatalog.has(entry.snapshot.id)) {
      throw new Error(
        `Capability suite case catalog contains duplicate case ID: ${entry.snapshot.id}`,
      );
    }
    caseCatalog.set(entry.snapshot.id, entry);
  }

  const members = manifest.members.map((member) => {
    const entry = caseCatalog.get(member.caseId);
    if (entry === undefined)
      throw new Error(
        `Capability suite ${manifest.id} references missing case: ${member.caseId}`,
      );
    const actualSnapshotDigest = digestAutonomousCaseSnapshot(entry.snapshot);
    if (
      entry.snapshotDigest !== actualSnapshotDigest ||
      actualSnapshotDigest !== member.expectedCaseSnapshotDigest
    ) {
      throw new Error(
        `Capability suite ${manifest.id} case snapshot drifted: ${member.caseId} (expected ${member.expectedCaseSnapshotDigest}, declared ${entry.snapshotDigest}, received ${actualSnapshotDigest})`,
      );
    }
    if (
      digest(outcomeContract(entry.snapshot)) !== member.outcomeContractDigest
    ) {
      throw new Error(
        `Capability suite ${manifest.id} outcome contract drifted: ${member.caseId}`,
      );
    }
    if (
      entry.snapshot.artifacts.outcomeRubric.rubricVersion !==
      member.outcomeContractVersion
    ) {
      throw new Error(
        `Capability suite ${manifest.id} outcome contract version drifted: ${member.caseId}`,
      );
    }
    if (
      digest(presentationContract(entry.snapshot)) !==
      member.presentationPolicyDigest
    ) {
      throw new Error(
        `Capability suite ${manifest.id} presentation contract drifted: ${member.caseId}`,
      );
    }
    return {
      ...structuredClone(member),
      caseSnapshot: structuredClone(entry.catalogSnapshot),
    };
  });

  return deepFreeze({
    identity: {
      suiteId: manifest.id,
      suiteDigest: manifest.suiteDigest,
      status: manifest.status,
      presentationContract: structuredClone(manifest.presentationContract),
      members: structuredClone(manifest.members),
    },
    members,
  });
}

export function projectCapabilitySuiteCatalog(
  manifest: CapabilitySuiteManifestV1,
  cases: readonly AnyBoundCase[],
): PublicCapabilitySuiteV1 {
  let unavailableReason: string | null = null;
  try {
    resolveCapabilitySuite(manifest, cases);
  } catch (error) {
    unavailableReason = error instanceof Error ? error.message : String(error);
  }
  return deepFreeze({
    schemaVersion: 1,
    name: manifest.name,
    suiteId: manifest.id,
    suiteDigest: manifest.suiteDigest,
    status: manifest.status,
    presentationContract: structuredClone(manifest.presentationContract),
    members: structuredClone(manifest.members),
    available: unavailableReason === null,
    unavailableReason,
  });
}

function validateManifestShape(manifest: CapabilitySuiteManifestV1): void {
  if (manifest.schemaVersion !== 1)
    throw new Error(
      `Unsupported capability suite schema version: ${String(manifest.schemaVersion)}`,
    );
  requireIdentifier(manifest.id, "suite ID");
  if (typeof manifest.name !== "string" || manifest.name.trim() === "")
    throw new Error("Capability suite name must not be empty.");
  if (manifest.status !== "candidate")
    throw new Error(
      `Invalid capability suite status: ${String(manifest.status)}`,
    );
  requireIdentifier(
    manifest.presentationContract.rubricVersion,
    "presentation rubric version",
  );
  requireDigest(
    manifest.presentationContract.rubricDigest,
    "presentation rubric digest",
  );
  requireIdentifier(
    manifest.presentationContract.recursiveContractId,
    "recursive presentation contract ID",
  );
  if (
    !Number.isSafeInteger(
      manifest.presentationContract.recursiveContractVersion,
    ) ||
    manifest.presentationContract.recursiveContractVersion < 1
  )
    throw new Error("Invalid recursive presentation contract version.");
  requireDigest(
    manifest.presentationContract.recursiveContractDigest,
    "recursive presentation contract digest",
  );
  requireIdentifier(
    manifest.presentationContract.judgeContractId,
    "simulated-user judge contract ID",
  );
  requireDigest(
    manifest.presentationContract.judgeContractDigest,
    "simulated-user judge contract digest",
  );
  requireIdentifier(
    manifest.presentationContract.promptVersion,
    "simulated-user prompt version",
  );
  if (manifest.members.length === 0)
    throw new Error("Capability suite must contain at least one member.");
  const caseIds = manifest.members.map(({ caseId }) => caseId);
  if (new Set(caseIds).size !== caseIds.length)
    throw new Error(
      `Capability suite ${manifest.id} contains duplicate case IDs.`,
    );
  for (const member of manifest.members) {
    requireIdentifier(member.caseId, "suite case ID");
    requireDigest(member.expectedCaseSnapshotDigest, "case snapshot digest");
    requireIdentifier(
      member.outcomeContractVersion,
      "outcome contract version",
    );
    requireDigest(member.outcomeContractDigest, "outcome contract digest");
    requireDigest(
      member.presentationPolicyDigest,
      "presentation policy digest",
    );
  }
  const actualDigest = computeCapabilitySuiteDigest(manifest);
  if (actualDigest !== manifest.suiteDigest)
    throw new Error(
      `Capability suite ${manifest.id} digest drifted: expected ${manifest.suiteDigest}, received ${actualDigest}.`,
    );
}

function requireIdentifier(value: string, label: string): void {
  if (typeof value !== "string" || !/^[a-z0-9][a-z0-9._-]*$/i.test(value))
    throw new Error(`Invalid ${label}: ${String(value)}`);
}

function requireDigest(value: string, label: string): void {
  if (!/^sha256:[a-f0-9]{64}$/.test(value))
    throw new Error(`Invalid ${label}: ${String(value)}`);
}

function deepFreeze<Value>(value: Value): Value {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
