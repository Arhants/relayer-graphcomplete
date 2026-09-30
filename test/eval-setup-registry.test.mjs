import { CalibrationService } from "../desktop/eval-main/calibration-service.mjs";
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { SetupRegistry } from "../desktop/eval-main/setup-registry.mjs";
import { HumanTaskService } from "../desktop/eval-main/human-task-service.mjs";
import { TaskActorService } from "../desktop/eval-main/task-actor-service.mjs";
import { createEvalDashboard, createHumanTaskSurface } from "../desktop/eval-main/web-host.mjs";

const cleanup = [];
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close(); });
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), "setup-revisions-"));
  cleanup.push(() => rm(directory, { recursive: true, force: true }));
  let tasks; let calibration;
  const stateFile = join(directory, "setups.json");
  const registry = await new SetupRegistry({ stateFile, feedbackLoader: (ref) => { if (calibration?.isHeldOutFeedback(ref)) throw new Error("Held-out labels cannot motivate setup tuning."); return tasks.feedbackReference(ref); } }).open();
  const options = { stateFile: join(directory, "tasks.json"), setupRegistry: registry,
    productSession: { origin: "http://product.invalid", cookie: { name: "control", value: "secret" }, readOnlyCookie: { name: "read", value: "only" } },
    evalService: { prepareHumanTask: async () => ({ name: "Trip", humanBrief: "PRIVATE BRIEF", humanRubric: "SECRET RUBRIC",
      casePlanDigest: "sha256:profile", execution: { testCaseId: "trip", harnessConfigurationName: "fixture", harnessConfigurationDigest: "sha256:harness" }, plan: [{ prompts: ["Plan {{endpoint}} literally"], name: "Trip" }] }),
      createHumanTaskThread: async () => ({ id: 1, rootInteractionId: 10 }), gradeHumanTaskStep: async () => ({ passed: true }) },
    fetchImpl: async (url) => url.pathname.endsWith("/export") ? new Response("frozen conversation\n") : Response.json({ interactions: [{ id: 10, completionStatus: "accepted" }] }),
  };
  tasks = await new HumanTaskService(options).open();
  const calls = [];
  const runtime = vi.fn(async (config) => { calls.push({ config, beforeDispatch: tasks.list().length }); return {}; });
  const actors = new TaskActorService({ tasks, setupRegistry: registry, resolveRuntime: runtime, openBrowser: async () => ({ observe: async () => ({ controls: [{ name: "visible", options: undefined }], text: "visible" }), close: async () => {} }),
    createActor: async ({ prompt, config }) => ({ close: async () => {}, decide: async (observation) => {
      calls.push({ prompt, config, observation });
      return { action: { kind: "finish", ref: "", value: "", reason: "satisfied", satisfaction: 3, comment: "Enough", endpointStatus: "incomplete", remainingWork: "Bookings" }, usage: null };
    } }),
  });
  cleanup.push(() => actors.close());
  calibration = await new CalibrationService({ stateFile: join(directory, "calibration.json"), setups: registry, tasks, evalService: options.evalService, author: tasks.annotator }).open();
  const selection = { mode: "simulated", maxCompletions: 1, endpoint: "Agreement" };
  const start = async (actorSetupRevisionId) => { const task = await actors.create({ ...selection, actorSetupRevisionId }); await actors.running.get(task.id).done; return tasks.get(task.id); };
  return { directory, stateFile, registry, tasks, actors, calls, runtime, start, options, calibration };
}

it("publishes from exact human feedback and executes a selected immutable revision across export/reopen/promotion", async () => {
  const f = await fixture();
  const original = await f.start();
  await f.tasks.annotate(original.id, { eventId: original.events.find((event) => event.kind === "actor_action").id, comment: "Use shorter replies", rating: 2 });
  await f.tasks.grade(original.id, { satisfaction: 1, comment: "Human satisfaction is separate" });
  const oldSetup = f.registry.selected("actor");
  const updated = await f.registry.publish({ ...oldSetup, predecessorId: oldSetup.id, name: "Brief user", promptVersion: "manual-brief-1",
    promptTemplate: oldSetup.promptTemplate + "\nKeep this revised instruction.", settings: { ...oldSetup.settings, model: "gpt-test", exploration: "high" },
    feedback: [{ sessionId: original.id, annotationId: f.tasks.get(original.id).annotations[0].id }, { sessionId: original.id, gradeIndex: 0 }] });
  await f.tasks.grade(original.id, { satisfaction: 4, comment: "Later feedback" });
  const revised = await f.start(updated.id);
  expect(f.calls[0]).toMatchObject({ beforeDispatch: 0, config: { model: "gpt-5.6-luna" } });
  expect(f.calls.at(-1)).toMatchObject({ config: { model: "gpt-test", exploration: "high", promptVersion: "manual-brief-1" } });
  expect(f.calls.at(-1).prompt).toContain("Keep this revised instruction.");
  expect(f.calls.at(-1).prompt).toContain("Plan {{endpoint}} literally");
  expect(JSON.stringify(f.calls)).not.toMatch(/Use shorter replies|Human satisfaction is separate|Later feedback|SECRET RUBRIC/);
  expect(revised.actorSetup).toEqual(updated);
  expect(f.tasks.get(original.id).actorSetup).toEqual(oldSetup);
  expect(updated.feedback[1].feedback.value).toBe(1);
  expect(f.registry.selected("actor").id).toBe(oldSetup.id);
  await f.registry.promote({ revisionId: updated.id, comment: "Reviewed the shorter behavior manually" }, f.tasks.annotator);
  expect(f.registry.selected("actor").id).toBe(updated.id);
  expect(f.registry.selected("judge").id).toBe(f.registry.catalog().revisions.find((item) => item.kind === "judge").id);
  updated.settings.model = "mutated";
  const reopened = await new SetupRegistry({ stateFile: f.stateFile }).open();
  const taskStore = await new HumanTaskService(f.options).open();
  const exported = await taskStore.export(revised.id);
  expect(exported.bundle.session.actorSetup).toEqual(reopened.get(revised.actorSetup.id));
  expect(exported.bundle.session.actorSetup.feedback[1].feedback.value).toBe(1);
  expect(f.tasks.get(original.id).actorSetup).toEqual(oldSetup);
});

it("rejects invalid selections before any runtime or candidate spending and rejects cross-kind predecessors/authority changes", async () => {
  const f = await fixture();
  const actor = f.registry.selected("actor"); const judge = f.registry.selected("judge");
  await expect(f.start("missing")).rejects.toThrow("Unknown setup");
  await expect(f.start(judge.id)).rejects.toThrow("Unknown setup");
  expect(f.runtime).not.toHaveBeenCalled(); expect(f.tasks.list()).toEqual([]);
  await expect(f.registry.publish({ ...actor, predecessorId: judge.id })).rejects.toThrow("Unknown setup");
  await expect(f.registry.publish({ ...actor, predecessorId: actor.id, feedback: [], behaviorContract: { id: "shell-enabled" } })).rejects.toThrow("authority");
  await expect(f.registry.publish({ ...actor, predecessorId: actor.id, feedback: [], promptTemplate: "omitted private context" })).rejects.toThrow("runtime evidence");
  await expect(f.registry.publish({ ...judge, predecessorId: judge.id, feedback: [], scoringRules: { scale: "human-1-4" } })).rejects.toThrow("scoring contract");
});

it("rolls back a failed publication and rejects modified persisted revision bytes on reopen", async () => {
  const f = await fixture(); const before = f.registry.catalog();
  const task = await f.start(); await f.tasks.grade(task.id, { satisfaction: 2, comment: "Motivation" });
  const persist = vi.spyOn(f.registry, "persist").mockRejectedValueOnce(new Error("disk full"));
  await expect(f.registry.publish({ ...f.registry.selected("actor"), predecessorId: f.registry.selected("actor").id, feedback: [{ sessionId: task.id, gradeIndex: 0 }], name: "Lost" })).rejects.toThrow("disk full");
  expect(f.registry.catalog()).toEqual(before); persist.mockRestore();
  const saved = JSON.parse(await readFile(f.stateFile, "utf8")); saved.revisions[0].settings.model = "rewritten";
  await writeFile(f.stateFile, JSON.stringify(saved));
  await expect(new SetupRegistry({ stateFile: f.stateFile }).open()).rejects.toThrow("integrity");
});

it("restricts revision publication/promotion to the dashboard while actor observations hide pinned feedback", async () => {
  const f = await fixture(); const task = await f.start();
  const dashboard = await createEvalDashboard({ setupRegistry: f.registry, humanTasks: f.tasks, calibration: f.calibration });
  const actor = await createHumanTaskSurface({ tasks: f.tasks, sessionId: task.id, productSession: f.options.productSession, actor: true });
  cleanup.push(() => dashboard.close(), () => actor.close());
  const request = (surface, operation, args) => fetch(new URL(`/eval-api/${operation}`, surface.url), { method: "POST",
    headers: { Authorization: `Bearer ${new URL(surface.url).hash.slice(1)}`, "Content-Type": "application/json" }, body: JSON.stringify(args) });
  expect((await request(dashboard, "setupRevisions", [])).status).toBe(200);
  expect((await request(dashboard, "promoteSetup", [{ revisionId: f.registry.selected("actor").id, comment: "Human choice" }])).status).toBe(200);
  for (const operation of ["setupRevisions", "publishSetup", "promoteSetup", "calibrationCatalog", "calibrationSource", "freezeCalibrationSet", "compareSetupRevisions", "recordCalibrationObservation", "exportCalibration"]) expect((await request(actor, operation, [])).status).toBe(403);
  const projection = await fetch(new URL("/eval-api/task", actor.url), { headers: { Authorization: `Bearer ${new URL(actor.url).hash.slice(1)}` } });
  expect(JSON.stringify(await projection.json())).not.toMatch(/setup|feedback|rubric|grade|prompt|calibration/);
});


it("freezes tuning and held-out evidence/labels, rejects contamination and retains exact membership after later feedback and reopen", async () => {
  const f = await fixture(); const tuning = await f.start(); const heldOut = await f.start();
  const member = (task, membership) => ({ source: { kind: "task", id: task.id }, membership, labels: [{ dimension: "actor-realism", scale: "human-actor-realism-1-4", value: 2,
    subject: { kind: "event", id: task.events.find((event) => event.kind === "actor_action").id }, comment: "Human observes over-explaining" }] });
  const setupPersist = vi.spyOn(f.registry, "persist").mockRejectedValueOnce(new Error("unchanged setup store unavailable"));
  const set = await f.calibration.freeze({ name: "Frozen trip calibration", members: [member(tuning, "tuning"), member(heldOut, "held-out")] });
  expect(setupPersist).not.toHaveBeenCalled(); setupPersist.mockRestore();
  await f.tasks.grade(heldOut.id, { satisfaction: 4, comment: "Later satisfaction is independent" });
  await f.tasks.annotate(heldOut.id, { eventId: heldOut.events[0].id, comment: "LATER HELD-OUT LABEL", rating: 1 });
  expect(f.calibration.set(set.id)).toEqual(set);
  const exported = await f.calibration.export();
  const baseline = f.registry.selected("actor");
  await expect(f.registry.publish({ ...baseline, predecessorId: baseline.id, feedback: [{ sessionId: heldOut.id, gradeIndex: 0 }] })).rejects.toThrow("Held-out");
  await expect(f.calibration.freeze({ name: "Duplicate", members: [member(tuning, "tuning"), member(tuning, "held-out")] })).rejects.toThrow("twice");
  await expect(f.calibration.freeze({ name: "Leaked partition", members: [member(heldOut, "tuning")] })).rejects.toThrow("other calibration partition");
  await f.tasks.grade(tuning.id, { satisfaction: 2, comment: "Tuning motivation" });
  const candidate = await f.registry.publish({ ...baseline, predecessorId: baseline.id, promptVersion: "calibrated-candidate", feedback: [{ sessionId: tuning.id, gradeIndex: 0 }] });
  expect(candidate.feedback[0].feedback.comment).toBe("Tuning motivation");
  const reopened = await new CalibrationService({ stateFile: join(f.directory, "calibration.json"), setups: f.registry, tasks: f.tasks, evalService: f.options.evalService, author: f.tasks.annotator }).open();
  expect(reopened.set(set.id)).toEqual(set);
  expect(exported.sets[0]).toEqual(set);
  expect(JSON.stringify(exported.sets)).not.toContain("LATER HELD-OUT LABEL");
  expect(exported.setups.revisions[0]).toEqual(baseline);
});

it("compares actor realism with separate human scores bound to pinned task revisions and cases; missing evidence stays incomplete", async () => {
  const f = await fixture(); const original = await f.start();
  await f.tasks.grade(original.id, { satisfaction: 1, comment: "Improve brevity" });
  const baseline = f.registry.selected("actor");
  const candidate = await f.registry.publish({ ...baseline, predecessorId: baseline.id, name: "Candidate", feedback: [{ sessionId: original.id, gradeIndex: 0 }] });
  const set = await f.calibration.freeze({ name: "Realism", members: [{ source: { kind: "task", id: original.id }, membership: "tuning", labels: [{ dimension: "actor-realism", scale: "human-actor-realism-1-4", value: 2,
    subject: { kind: "event", id: original.events.find((event) => event.kind === "actor_action").id }, comment: "Baseline conversation realism" }] }] });
  const report = await f.calibration.compare({ baselineRevisionId: baseline.id, candidateRevisionId: candidate.id, calibrationSetId: set.id });
  expect(report).toMatchObject({ status: "incomplete", comparison: { dimension: "actor-realism", calibrationSetDigest: set.digest } });
  expect(report.rows[0]).not.toHaveProperty("humanTarget");
  const revised = await f.start(candidate.id);
  const originalEndpoint = f.tasks.find(revised.id).endpoint;
  f.tasks.find(revised.id).endpoint = "Easier endpoint";
  const mismatch = { comparisonId: report.comparison.id, memberId: set.members[0].id, labelId: set.members[0].labels[0].id, revisionId: candidate.id, taskId: revised.id, value: 4, comment: "A weaker endpoint" };
  await expect(f.calibration.observe(mismatch)).rejects.toThrow("pinned case");
  f.tasks.find(revised.id).endpoint = originalEndpoint;
  f.tasks.find(revised.id).maxCompletions++;
  await expect(f.calibration.observe(mismatch)).rejects.toThrow("pinned case");
  f.tasks.find(revised.id).maxCompletions--;
  const observation = { comparisonId: report.comparison.id, memberId: set.members[0].id, labelId: set.members[0].labels[0].id, comment: "Human independently reviewed the recorded actor" };
  await expect(f.calibration.observe({ ...observation, revisionId: candidate.id, taskId: original.id, value: 4 })).rejects.toThrow("pinned to this actor revision");
  await f.calibration.observe({ ...observation, revisionId: baseline.id, taskId: original.id, value: 2 });
  const completed = await f.calibration.observe({ ...observation, revisionId: candidate.id, taskId: revised.id, value: 3 });
  expect(completed).toMatchObject({ status: "completed", rows: [{ baseline: { score: 2 }, candidate: { score: 3 } }] });
  expect(JSON.stringify(f.calls)).not.toMatch(/Improve brevity|Baseline conversation realism|Human independently reviewed/);
  const exported = await f.calibration.export();
  expect(exported.observations).toHaveLength(2);
  expect(exported.comparisons[0].baseline.id).toBe(baseline.id);
  expect(f.registry.selected("actor").id).toBe(baseline.id);
  await f.registry.promote({ revisionId: candidate.id, comment: "Human compared realism evidence" }, f.tasks.annotator);
  expect(f.calibration.report(report.comparison.id)).toEqual(completed);
});

it("preserves incomplete calibration coverage and rejects label-scale or evidence fabrication", async () => {
  const f = await fixture(); const task = await f.start();
  const member = { source: { kind: "task", id: task.id }, membership: "tuning", labels: [] };
  const baseline = f.registry.selected("actor");
  await f.tasks.grade(task.id, { satisfaction: 2, comment: "Feedback" });
  const candidate = await f.registry.publish({ ...baseline, predecessorId: baseline.id, feedback: [{ sessionId: task.id, gradeIndex: 0 }] });
  const incomplete = await f.calibration.freeze({ name: "Unlabeled", members: [member] });
  const report = await f.calibration.compare({ baselineRevisionId: baseline.id, candidateRevisionId: candidate.id, calibrationSetId: incomplete.id });
  expect(report.rows[0]).toMatchObject({ status: "incomplete", reason: "No compatible human label." });
  const label = { dimension: "actor-realism", scale: "human-actor-realism-1-4", value: 2, subject: { kind: "event", id: task.events[0].id }, comment: "Human label" };
  await expect(f.calibration.freeze({ name: "Forged", members: [{ ...member, labels: [{ ...label, subject: { kind: "event", id: "unseen" } }] }] })).rejects.toThrow("captured evidence");
  await expect(f.calibration.freeze({ name: "Wrong scale", members: [{ ...member, labels: [{ ...label, scale: "human-1-4" }] }] })).rejects.toThrow("native dimension and scale");
  const before = f.calibration.catalog(); vi.spyOn(f.calibration, "persist").mockRejectedValueOnce(new Error("disk full"));
  await expect(f.calibration.freeze({ name: "Unsaved", members: [member] })).rejects.toThrow("disk full");
  expect(f.calibration.catalog()).toEqual(before);
});


it("reuses byte-identical same-instant exports and never overwrites an existing conflicting evidence file", async () => {
  const f = await fixture(); const task = await f.start();
  vi.useFakeTimers({ toFake: ["Date"] });
  try {
    const first = await f.tasks.export(task.id); const second = await f.tasks.export(task.id);
    expect(second.path).toBe(first.path); expect(second.bundle).toEqual(first.bundle);
    await writeFile(first.path, "corrupt export");
    await expect(f.tasks.export(task.id)).rejects.toMatchObject({ code: "EEXIST" });
    expect(await readFile(first.path, "utf8")).toBe("corrupt export");
  } finally { vi.useRealTimers(); }
});
