import { randomUUID, createHash } from "node:crypto";
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { dirname, join } from "node:path";

const clone = (value) => structuredClone(value);
const digest = (value) => `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
const terminal = new Set(["accepted", "failed", "stopped"]);
const failure = (message, status = 400) => Object.assign(new Error(message), { status });
const completionRoute = /\/interactions(?:\/[1-9][0-9]*\/actions\/[1-9][0-9]*\/invoke)?$/;

// Eval owns the session and evidence, never graph execution or acceptance.
// One serial admission queue also covers multiple tabs and finish/export races.
export class HumanTaskService {
  constructor({ stateFile, evalService, productSession, annotationSnapshotLoader, annotator = { id: "local-human", displayName: "Local human" }, fetchImpl = fetch }) {
    Object.assign(this, { stateFile, evalService, productSession, annotationSnapshotLoader, annotator, fetchImpl });
    this.sessions = [];
    this.tail = Promise.resolve();
  }
  async open() {
    try { this.sessions = JSON.parse(await readFile(this.stateFile, "utf8")).sessions; }
    catch (error) { if (error.code !== "ENOENT") throw error; }
    for (const session of this.sessions) {
      if (["active", "preparing", "finishing"].includes(session.status)) {
        session.status = "interrupted";
        session.termination = { reason: "host_interrupted", at: new Date().toISOString(), success: null };
        this.event(session, "interrupted", { reason: "Host restarted; no task success inferred." });
      }
    }
    await this.persist();
    return this;
  }
  serial(operation) {
    const next = this.tail.then(operation);
    this.tail = next.catch(() => {});
    return next;
  }
  async persist() {
    await mkdir(dirname(this.stateFile), { recursive: true });
    const temporary = `${this.stateFile}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify({ schemaVersion: 1, sessions: this.sessions }), { mode: 0o600 });
    await rename(temporary, this.stateFile);
  }
  event(session, kind, data) {
    const event = { id: `${session.id}:${session.events.length + 1}`, sequence: session.events.length + 1, at: new Date().toISOString(), kind, ...data };
    session.events.push(event);
    return event;
  }
  find(id) {
    const session = this.sessions.find((item) => item.id === id);
    if (!session) throw failure("Unknown human task session.", 404);
    return session;
  }
  list() { return this.sessions.map(({ prepared, events, ...session }) => ({ ...clone(session), name: prepared?.name, eventCount: events.length })); }
  get(id) { return clone(this.find(id)); }
  async upstream(path, { method = "GET", body } = {}, write = false) {
    const cookie = write ? this.productSession.cookie : this.productSession.readOnlyCookie;
    const response = await this.fetchImpl(new URL(path, this.productSession.origin), {
      method, redirect: "error", headers: { Cookie: `${cookie.name}=${cookie.value}`, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return response;
  }
  async detail(threadId) {
    const response = await this.upstream(`/api/threads/${threadId}`);
    if (!response.ok) throw failure("Could not read the task thread.", 502);
    return response.json();
  }
  async settled(session) {
    for (const threadId of session.threadIds) {
      const detail = await this.detail(threadId);
      if ((detail.interactions || []).some((turn) => !terminal.has(turn.completionStatus))) {
        throw failure("Wait for the current response, or stop it in the workspace, before continuing.", 409);
      }
    }
  }
  create(selection) {
    return this.serial(async () => {
      if (!Number.isSafeInteger(selection?.maxCompletions) || selection.maxCompletions < 1 || selection.maxCompletions > 1000) throw failure("Choose a completion limit from 1 to 1000.");
      if (typeof selection.endpoint !== "string" || !selection.endpoint.trim() || selection.endpoint.length > 8000) throw failure("Describe the task artifact or endpoint.");
      const session = { schemaVersion: 1, id: `human-${randomUUID()}`, mode: "human", status: "preparing", createdAt: new Date().toISOString(), maxCompletions: selection.maxCompletions, completions: 0, endpoint: selection.endpoint.trim(), step: 0, threadIds: [], events: [], annotations: [], stepChecks: [], satisfaction: null, termination: null };
      this.sessions.unshift(session);
      await this.persist();
      try {
        session.prepared = await this.evalService.prepareHumanTask({ ...selection, sessionId: session.id });
        session.status = "active";
        await this.startThread(session);
      } catch (error) {
        session.status = "failed";
        session.termination = { reason: "preparation_failed", at: new Date().toISOString(), success: null };
        this.event(session, "error", { message: error.message });
        await this.persist();
        throw error;
      }
      return this.get(session.id);
    });
  }
  async startThread(session) {
    if (session.completions >= session.maxCompletions) throw failure("Completion limit reached.", 409);
    // Reserve durably before calling a product API; an ambiguous transport failure
    // never refunds authority or silently replays a possibly started completion.
    session.completions++;
    const submission = this.event(session, "submission", { step: session.step, initial: true, text: session.prepared.plan[session.step].prompts[0] });
    await this.persist();
    const thread = await this.evalService.createHumanTaskThread(session.prepared, session.step);
    submission.interactionId = thread.rootInteractionId;
    submission.threadId = thread.id;
    session.threadIds.push(thread.id);
    session.currentThreadId = thread.id;
    this.event(session, "thread_started", { threadId: thread.id, interactionId: thread.rootInteractionId });
    await this.persist();
  }
  nextStep(id) {
    return this.serial(async () => {
      const session = this.find(id);
      if (session.status !== "active") throw failure("Task session is not active.", 409);
      if (session.step + 1 >= session.prepared.plan.length) throw failure("No further case step.");
      await this.settled(session);
      if (session.completions >= session.maxCompletions) throw failure("Completion limit reached.", 409);
      const checks = await this.evalService.gradeHumanTaskStep(session.prepared, session.step);
      session.stepChecks.push({ step: session.step, checks });
      session.step++;
      try { await this.startThread(session); }
      catch (error) { session.status = "interrupted"; await this.persist(); throw error; }
      return this.get(id);
    });
  }
  write(id, path, method, body) {
    return this.serial(async () => {
      const session = this.find(id);
      if (session.status !== "active") throw failure("Task session is read-only.", 403);
      const pathname = new URL(path, "http://task.invalid").pathname;
      const prefix = `/api/threads/${session.currentThreadId}`;
      const route = pathname.startsWith(`${prefix}/`) ? pathname.slice(prefix.length) : "";
      const starts = method === "POST" && completionRoute.test(pathname);
      const allowed = (starts && (route === "/interactions" || /^\/interactions\/[1-9][0-9]*\/actions\/[1-9][0-9]*\/invoke$/.test(route)))
        || (method === "POST" && /^\/interactions\/[1-9][0-9]*\/(?:stop|approvals\/[^/%]+\/decision)$/.test(route))
        || (method === "PUT" && route === "/input-draft/attachments")
        || (method === "DELETE" && /^\/input-draft\/attachments\/[1-9][0-9]*\/[1-9][0-9]*\/[1-9][0-9]*$/.test(route))
        || (["PUT", "DELETE"].includes(method) && /^\/(?:context-drafts|context-confirmations)\/[^/%]+$/.test(route))
        || (method === "POST" && /^\/context-drafts\/[^/%]+\/confirm$/.test(route));
      if (!allowed) throw failure("Write is outside this task session.", 403);
      const controlDuringRun = method === "POST" && /^\/interactions\/[1-9][0-9]*\/(?:stop|approvals\/[^/%]+\/decision)$/.test(route);
      if (!controlDuringRun) await this.settled(session);
      if (starts) {
        if (session.completions >= session.maxCompletions) throw failure("Completion limit reached. Finish this task session.", 409);
        if (route === "/interactions") {
          const selection = session.prepared.execution.modelResolution;
          body = { ...body };
          const pinned = selection.productModelSelection && selection.selectedModel
            ? Object.fromEntries(["familyId", "providerId", "modelId"].map((key) => [key, selection.selectedModel[key]])) : null;
          if (body.modelSelection && JSON.stringify(body.modelSelection) !== JSON.stringify(pinned)) {
            if (!pinned || ["familyId", "providerId", "modelId"].some((key) => body.modelSelection[key] !== pinned[key])) throw failure("This task uses its starting model. Start another session to change models.");
          }
          delete body.modelSelection;
          if (pinned) body.modelSelection = pinned;
        }
        session.completions++;
      }
      const event = this.event(session, starts ? "submission" : "product_action", { threadId: session.currentThreadId, path, method, request: body, outcome: "pending" });
      await this.persist();
      try {
        const response = await this.upstream(path, { method, body }, true);
        const bytes = await response.text();
        event.status = response.status;
        event.outcome = response.ok ? "accepted" : "rejected";
        if (starts && !response.ok && response.status < 500) session.completions--;
        if (response.status >= 500) {
          event.outcome = "unknown";
          session.status = "interrupted";
          session.termination = { reason: "product_write_unknown", at: new Date().toISOString(), success: null };
        }
        if (response.ok && bytes) {
          try {
            const result = JSON.parse(bytes);
            event.interactionId = result.interaction?.id ?? (starts ? result.id : undefined);
            if (starts && (result.created === false || session.events.some((prior) => prior !== event && prior.kind === "submission" && prior.interactionId != null && prior.interactionId === event.interactionId))) {
              session.completions--;
              event.outcome = "replayed";
            }
          } catch { /* Response bytes remain upstream-owned. */ }
        }
        await this.persist();
        return { status: response.status, contentType: response.headers.get("content-type"), bytes };
      } catch (error) {
        event.outcome = "unknown";
        session.status = "interrupted";
        session.termination = { reason: "product_write_unknown", at: new Date().toISOString(), success: null };
        this.event(session, "error", { message: "Product write outcome unknown; session locked against replay." });
        await this.persist();
        throw error;
      }
    });
  }
  observe(id, observation) {
    return this.serial(async () => {
      const session = this.find(id);
      if (session.status !== "active") return null;
      if (!session.threadIds.some((thread) => String(thread) === String(observation?.threadId))) throw failure("Observation is outside this task.", 403);
      if (!Number.isFinite(observation.observedAt) || typeof observation.content !== "string" || observation.content.length > 200000) throw failure("Invalid presentation observation.");
      const detail = await this.detail(observation.threadId);
      if (observation.turnId != null && !detail.interactions.some((turn) => String(turn.id) === String(observation.turnId))) throw failure("Unknown observed interaction.");
      const snapshot = {
        threadId: observation.threadId, turnId: observation.turnId ?? null, layerId: observation.layerId ?? null,
        selectedNodeId: observation.selectedNodeId ?? null, navigationPath: observation.navigationPath ?? [],
        observedAt: observation.observedAt, content: observation.content,
        graphVisible: observation.graphVisible === true, completionStatus: observation.completionStatus ?? null, captureFailures: observation.captureFailures ?? 0, source: "renderer-after-paint",
      };
      const key = digest({ ...snapshot, observedAt: null });
      if (session.lastObservationDigest === key) return null;
      session.lastObservationDigest = key;
      const event = this.event(session, "presentation", { snapshot, contentDigest: key });
      session.viewerAttachedAt ??= snapshot.observedAt;
      session.viewerAttachedAtByThread ??= {};
      session.viewerAttachedAtByThread[String(snapshot.threadId)] ??= snapshot.observedAt;
      const threadViewerAttachedAt = session.viewerAttachedAtByThread[String(snapshot.threadId)];
      const submission = session.events.find((item) => item.kind === "submission" && String(item.interactionId) === String(snapshot.turnId));
      if (snapshot.graphVisible && submission) {
        session.responseTimings ??= [];
        if (!session.responseTimings.some((item) => String(item.interactionId) === String(snapshot.turnId))) session.responseTimings.push({
          interactionId: snapshot.turnId, eventId: event.id,
          latencyMs: Math.max(0, snapshot.observedAt - Date.parse(submission.at)),
          observerPresentBeforeSubmission: threadViewerAttachedAt <= Date.parse(submission.at),
          usefulness: "not_assessed",
        });
      }
      if (snapshot.graphVisible && !session.firstVisibleGraph) {
        const firstSubmission = session.events.find((item) => item.kind === "submission");
        session.firstVisibleGraph = { eventId: event.id, observedAt: snapshot.observedAt, latencyMs: Math.max(0, snapshot.observedAt - Date.parse(firstSubmission.at)), usefulness: "not_assessed", observerPresentBeforeSubmission: threadViewerAttachedAt <= Date.parse(firstSubmission.at) };
      }
      await this.persist();
      return event.id;
    });
  }
  grade(id, input) {
    return this.serial(async () => {
      const session = this.find(id);
      if (!["active", "completed", "failed", "interrupted"].includes(session.status)) throw failure("Wait for the session to settle.", 409);
      if (![1, 2, 3, 4].includes(input?.satisfaction) || typeof input.comment !== "string" || input.comment.length > 8000) throw failure("Choose a satisfaction rating from 1 to 4 and valid feedback.");
      const grade = { scale: "human-1-4", value: input.satisfaction, comment: input.comment.trim(), at: new Date().toISOString(), author: clone(this.annotator) };
      (session.grades ??= []).push(grade);
      session.satisfaction = grade;
      await this.persist();
      return this.get(id);
    });
  }
  finish(id, input) {
    return this.serial(async () => {
      const session = this.find(id);
      if (session.status !== "active") throw failure("Task session is not active.", 409);
      if (!["endpoint_reached", "satisfied", "abandoned", "budget_exhausted"].includes(input?.reason)) throw failure("Choose a termination reason.");
      if (input.satisfaction !== undefined && ![1, 2, 3, 4].includes(input.satisfaction)) throw failure("Choose a satisfaction rating from 1 to 4.");
      if (input.reason === "budget_exhausted" && session.completions < session.maxCompletions) throw failure("The completion budget is not exhausted.");
      if (input.reason === "endpoint_reached" && session.step + 1 < session.prepared.plan.length) throw failure("Complete the remaining case steps first.");
      await this.settled(session);
      const previousSatisfaction = session.satisfaction;
      const previousGradeCount = session.grades?.length ?? 0;
      session.status = "finishing";
      await this.persist();
      try {
        session.stepChecks.push({ step: session.step, checks: await this.evalService.gradeHumanTaskStep(session.prepared, session.step) });
      } catch (error) { session.stepChecks.push({ step: session.step, checks: { status: "error", reason: error.message } }); }
      try {
        const conversations = [];
        for (const threadId of session.threadIds) {
          const response = await this.upstream(`/api/threads/${threadId}/export`, {}, true);
          if (!response.ok) throw failure("Could not freeze the task conversation.", 502);
          conversations.push({ threadId, jsonl: await response.text() });
        }
        session.conversations = conversations;
        if (input.satisfaction !== undefined) {
          session.satisfaction = { scale: "human-1-4", value: input.satisfaction, comment: String(input.comment || "").slice(0, 8000), at: new Date().toISOString(), author: clone(this.annotator) };
          (session.grades ??= []).push(session.satisfaction);
        }
        session.termination = { reason: input.reason, at: new Date().toISOString(), success: null, endpointAttainment: input.reason === "endpoint_reached" ? "human_reported" : "not_claimed" };
        this.event(session, "finished", { termination: session.termination, satisfaction: session.satisfaction });
        session.status = "completed";
        session.evidenceDigest = digest({ events: session.events, conversations: session.conversations, stepChecks: session.stepChecks });
        await this.persist();
      } catch (error) {
        delete session.conversations;
        delete session.evidenceDigest;
        session.satisfaction = previousSatisfaction;
        if (session.grades) session.grades.length = previousGradeCount;
        session.termination = null;
        session.status = "active";
        if (session.events.at(-1)?.kind === "finished") session.events.pop();
        this.event(session, "finish_failed", { message: error.message });
        await this.persist(); throw error;
      }
      return this.get(id);
    });
  }
  annotate(id, { eventId, comment, rating = null }) {
    return this.serial(async () => {
      const session = this.find(id);
      if (!["active", "completed", "failed", "interrupted"].includes(session.status) || !session.events.some((item) => item.id === eventId)) throw failure("Choose a recorded moment in this session.");
      if (typeof comment !== "string" || !comment.trim() || comment.length > 8000 || (rating !== null && ![1, 2, 3, 4].includes(rating))) throw failure("Invalid annotation.");
      session.annotations.push({ id: randomUUID(), eventId, comment: comment.trim(), rating, at: new Date().toISOString(), author: clone(this.annotator) });
      await this.persist();
      return this.get(id);
    });
  }
  export(id) {
    return this.serial(async () => {
      const session = this.find(id);
      if (!["completed", "failed", "interrupted"].includes(session.status)) throw failure("Finish the session before exporting immutable evidence.");
      await this.settled(session);
      const graphAnnotations = this.annotationSnapshotLoader && session.threadIds.length ? await this.annotationSnapshotLoader(session.threadIds) : null;
      const bundle = { schemaVersion: 1, kind: "relayer_human_task_bundle", exportedAt: new Date().toISOString(), session: clone(session), graphAnnotations, conversationEvidence: session.status === "completed" && session.conversations?.length === session.threadIds.length ? "frozen-at-finish" : "unavailable-after-interruption" };
      const sha256 = digest(bundle);
      const path = join(dirname(this.stateFile), "human-task-exports", `${session.id}-${sha256.slice(7)}.json`);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, JSON.stringify({ ...bundle, sha256 }, null, 2), { flag: "wx", mode: 0o600 });
      return { path, sha256, bundle: { ...bundle, sha256 } };
    });
  }
}
