import type { BoundAutonomousCase } from "./cases/catalog.js";
import { canonicalJson, digestAutonomousCaseSnapshot, sanitizeAutonomousCaseSnapshot } from "./cases/catalog.js";
import type { AutonomousCaseSnapshot, CaseContentDigest, PublicAutonomousCaseSnapshot } from "./cases/contracts.js";
import type { EvalCheck } from "./cases/graph-checks.js";
import { projectCapabilitySuiteCatalog, resolveCapabilitySuite, type CapabilitySuiteManifestV1 } from "./suites/contracts.js";

export interface EvalMaterializeContextV1 {
  readonly caseId: string;
  readonly workspaceDirectory: string;
  readonly cacheDirectory: string;
  readonly platform: NodeJS.Platform;
}
export interface EvalGradeContextV1 {
  readonly caseId: string;
  readonly workspaceDirectory: string;
  readonly fixture: unknown;
  readonly threadDefinition: unknown;
}
export interface EvalMandatoryGateResultV1 {
  readonly complete: boolean;
  readonly passed: boolean;
  readonly matched: readonly EvalCheck[];
}
export interface EvalCaseDefinitionV1 {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly caseSnapshot: PublicAutonomousCaseSnapshot;
  readonly caseSnapshotDigest: CaseContentDigest;
  readonly threads: readonly EvalProjectThreadDefinitionV1[];
  readonly [key: string]: unknown;
}
export interface EvalProjectThreadDefinitionV1 {
  readonly id: string;
  readonly name: string;
  readonly permissionProfileId: "ask" | "auto" | "full";
  readonly mutationPolicy: "read-only" | "writable";
  readonly prompts: readonly string[];
  readonly workspaceGrade: "question" | "diagnosis" | "implementation" | "autonomous-implementation";
}
export interface EvalCaseRegistrationV1 {
  readonly definition: EvalCaseDefinitionV1;
  readonly available: boolean;
  readonly unavailableReason: string | null;
  readonly boundCase: BoundAutonomousCase<unknown>;
  readonly materialize: (context: EvalMaterializeContextV1) => Promise<unknown> | unknown;
  readonly grade: (context: EvalGradeContextV1) => Promise<readonly EvalCheck[]> | readonly EvalCheck[];
  readonly evaluateMandatoryGate: (gate: { readonly id: string; readonly label: string; readonly [key: string]: unknown }, checks: readonly EvalCheck[]) => EvalMandatoryGateResultV1;
}
export interface EvalCatalogV1 {
  readonly schemaVersion: 1;
  readonly cases: readonly EvalCaseRegistrationV1[];
  readonly suites: readonly CapabilitySuiteManifestV1[];
}

/** Projects an external grader result into immutable, validated SDK checks. */
export function validateEvalChecksV1(value: unknown): readonly EvalCheck[] {
  if (!Array.isArray(value)) throw new Error("External evaluation grader must return an array of checks.");
  return Object.freeze(Array.from(value, (entry, index) => {
    if (!isPlainDataRecord(entry)) throw new Error(`External evaluation check ${index} must be a plain data object.`);
    const descriptors = Object.getOwnPropertyDescriptors(entry);
    if (Object.values(descriptors).some((descriptor) => descriptor.get !== undefined || descriptor.set !== undefined)) {
      throw new Error(`External evaluation check ${index} cannot contain accessors.`);
    }
    if (typeof entry.name !== "string" || entry.name.trim() === ""
      || typeof entry.passed !== "boolean" || typeof entry.detail !== "string") {
      throw new Error(`External evaluation check ${index} must contain a non-empty name, boolean passed, and string detail.`);
    }
    return Object.freeze({ name: entry.name, passed: entry.passed, detail: entry.detail });
  }));
}

/** Validates the trusted catalog module at the generic SDK boundary. */
export function validateEvalCatalogV1(value: unknown): EvalCatalogV1 {
  if (!isRecord(value) || value.schemaVersion !== 1 || !Array.isArray(value.cases) || !Array.isArray(value.suites)) {
    throw new Error("External evaluation catalog must use schemaVersion 1 and include cases and suites arrays.");
  }
  const cases = value.cases as EvalCaseRegistrationV1[];
  const caseIds = new Set<string>();
  for (const registration of cases) {
    if (!isRecord(registration) || !isRecord(registration.definition) || !isRecord(registration.boundCase)) throw new Error("Invalid evaluation case registration.");
    const { definition, boundCase } = registration;
    for (const key of ["id", "name", "description"] as const) if (typeof definition[key] !== "string" || definition[key].trim() === "") throw new Error(`Evaluation case definition ${key} must be non-empty.`);
    if (caseIds.has(definition.id)) throw new Error(`Duplicate evaluation case ID: ${definition.id}`);
    caseIds.add(definition.id);
    assertSerializable(definition);
    validateThreads(definition);
    if (typeof registration.available !== "boolean" || (registration.available ? registration.unavailableReason !== null : typeof registration.unavailableReason !== "string" || registration.unavailableReason.trim() === "")) throw new Error(`Invalid availability state for case ${definition.id}.`);
    if (typeof registration.materialize !== "function" || typeof registration.grade !== "function" || typeof registration.evaluateMandatoryGate !== "function") throw new Error(`Evaluation case ${definition.id} must implement its SDK callbacks.`);
    const snapshot = boundCase.snapshot as AutonomousCaseSnapshot;
    if (!snapshot || snapshot.id !== definition.id) throw new Error(`Bound case identity does not match definition ${definition.id}.`);
    const actualDigest = digestAutonomousCaseSnapshot(snapshot);
    const projection = sanitizeAutonomousCaseSnapshot(snapshot);
    if (boundCase.snapshotDigest !== actualDigest || definition.caseSnapshotDigest !== actualDigest || canonicalJson(definition.caseSnapshot) !== canonicalJson(projection) || canonicalJson(boundCase.catalogSnapshot) !== canonicalJson(projection)) throw new Error(`Case snapshot projection or digest drifted: ${definition.id}.`);
    if (canonicalJson(boundCase.definition) !== canonicalJson(Object.fromEntries(Object.entries(definition).filter(([key]) => key !== "caseSnapshot" && key !== "caseSnapshotDigest")))) throw new Error(`Bound case definition drifted: ${definition.id}.`);
  }
  const suiteIds = new Set<string>();
  const boundCases = cases.map(({ boundCase }) => boundCase);
  for (const suite of value.suites as CapabilitySuiteManifestV1[]) {
    if (!isRecord(suite) || typeof suite.id !== "string") throw new Error("Invalid capability suite manifest.");
    if (suiteIds.has(suite.id)) throw new Error(`Duplicate capability suite ID: ${suite.id}`);
    suiteIds.add(suite.id);
    resolveCapabilitySuite(suite, boundCases);
  }
  return Object.freeze({ schemaVersion: 1, cases: Object.freeze([...cases]), suites: Object.freeze([...(value.suites as CapabilitySuiteManifestV1[])]) });
}

export { projectCapabilitySuiteCatalog, resolveCapabilitySuite };

function validateThreads(definition: Record<string, any>): void {
  if (!Array.isArray(definition.threads) || definition.threads.length === 0) throw new Error(`Evaluation case ${definition.id} must declare at least one project thread.`);
  const ids = new Set<string>();
  for (const thread of definition.threads) {
    if (!isRecord(thread) || !["id", "name"].every((key) => typeof thread[key] === "string" && thread[key].trim() !== "")) throw new Error(`Evaluation case ${definition.id} has an invalid project thread identity.`);
    if (ids.has(thread.id)) throw new Error(`Evaluation case ${definition.id} has duplicate project thread ID: ${thread.id}`);
    ids.add(thread.id);
    if (!(thread.permissionProfileId === "ask" || thread.permissionProfileId === "auto" || thread.permissionProfileId === "full") || !(thread.mutationPolicy === "read-only" || thread.mutationPolicy === "writable") || !["question", "diagnosis", "implementation", "autonomous-implementation"].includes(thread.workspaceGrade) || !Array.isArray(thread.prompts) || thread.prompts.length === 0 || thread.prompts.some((prompt: unknown) => typeof prompt !== "string" || prompt.trim() === "")) throw new Error(`Evaluation case ${definition.id} has invalid project thread fields: ${thread.id}.`);
  }
}
function isRecord(value: unknown): value is Record<string, any> { return value !== null && typeof value === "object" && !Array.isArray(value); }
function isPlainDataRecord(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
function assertSerializable(value: unknown, seen = new Set<object>()): void {
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number" && Number.isFinite(value)) return;
  if (typeof value !== "object" || seen.has(value)) throw new Error("Evaluation case definition must be acyclic JSON data.");
  seen.add(value);
  if (Array.isArray(value)) for (const child of value) assertSerializable(child, seen);
  else {
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) throw new Error("Evaluation case definition must contain only plain objects.");
    for (const [key, child] of Object.entries(value)) { if (typeof child === "undefined") throw new Error(`Undefined definition field: ${key}`); assertSerializable(child, seen); }
  }
  seen.delete(value);
}
