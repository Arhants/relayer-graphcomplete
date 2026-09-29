import { setTimeout as delay } from "node:timers/promises";
import { actorConfiguration, actorPrompt, createCodexTaskActor, validateActorAction } from "./task-actor.mjs";

export class TaskActorService {
  constructor({ tasks, resolveRuntime, openBrowser, createActor = createCodexTaskActor, pollMs = 250 }) {
    Object.assign(this, { tasks, resolveRuntime, openBrowser, createActor, pollMs });
    this.running = new Map();
  }
  async create(selection) {
    const config = actorConfiguration(selection.actor);
    // Authenticate before the opening candidate completion can spend inference.
    const runtime = await this.resolveRuntime();
    const task = await this.tasks.create({ ...selection, mode: "simulated", actor: config });
    const controller = new AbortController();
    const done = this.run(task.id, runtime, controller.signal).catch(async () => {
      await this.tasks.interruptActor(task.id, controller.signal.aborted ? "actor_cancelled" : "actor_failed");
    });
    this.running.set(task.id, { controller, done });
    void done.finally(() => this.running.delete(task.id)).catch(() => {});
    return task;
  }
  async settled(id, signal) {
    while (true) {
      signal.throwIfAborted();
      const task = this.tasks.get(id);
      if (task.status !== "active") throw new Error("Task is no longer active.");
      try { await this.tasks.settled(task, { signal }); return task; }
      catch (error) { if (error.status !== 409) throw error; }
      await delay(this.pollMs, undefined, { signal });
    }
  }
  async run(id, runtime, cancellation) {
    const task = this.tasks.get(id);
    const signal = AbortSignal.any([cancellation, AbortSignal.timeout(task.actor.timeoutMs)]);
    const prompt = actorPrompt({ config: task.actor, request: task.prepared.plan[0].prompts[0], endpoint: task.endpoint });
    let actor;
    let browser;
    try {
      await this.tasks.actorEvent(id, "actor_started", { configuration: task.actor, prompt });
      actor = await this.createActor({ runtime, config: task.actor, prompt });
      signal.throwIfAborted();
      browser = await this.openBrowser(id, signal);
      let observedSubmission;
      for (let index = 0; index < task.actor.maxActions; index++) {
        const current = await this.settled(id, signal);
        const submission = current.events.findLast((event) => event.kind === "submission" && event.interactionId != null && (event.outcome == null || event.outcome === "accepted"));
        let expected;
        if (submission && submission.id !== observedSubmission) {
          const detail = await this.tasks.detail(submission.threadId, { signal });
          const turn = detail.interactions.find((item) => String(item.id) === String(submission.interactionId));
          if (!turn) throw new Error("Submitted interaction is unavailable.");
          const attemptId = turn.latestAttempt?.id;
          if (submission.path?.endsWith("/retry") && attemptId == null) throw new Error("Retried interaction has no settled attempt identity.");
          expected = { threadId: submission.threadId, turnId: submission.interactionId, submittedAt: Date.parse(submission.at), ...(attemptId == null ? {} : { attemptId }) };
        }
        const observation = { ...await browser.observe(expected), remainingCompletions: current.maxCompletions - current.completions, step: current.step + 1, stepCount: current.prepared.plan.length };
        observedSubmission = submission?.id;
        const observed = await this.tasks.actorEvent(id, "actor_observation", { observation });
        signal.throwIfAborted();
        const { action, usage } = await actor.decide(observation, signal);
        validateActorAction(action);
        signal.throwIfAborted();
        // An intervening stop/finish or product request invalidates this choice.
        await this.tasks.settled(this.tasks.get(id), { signal });
        const intent = await this.tasks.actorEvent(id, "actor_action", { observationEventId: observed.id, action, usage });
        signal.throwIfAborted();
        if (action.kind === "finish") {
          await this.tasks.actorEvent(id, "actor_satisfaction", { scale: "actor-1-4", value: action.satisfaction, comment: action.comment });
          await this.tasks.finish(id, { reason: current.completions >= current.maxCompletions ? "budget_exhausted" : action.reason }, { signal });
          return;
        }
        if (current.completions >= current.maxCompletions && action.kind === "next_step") {
          await this.tasks.finish(id, { reason: "budget_exhausted" }, { signal }); return;
        }
        if (action.kind === "next_step") { await this.tasks.nextStep(id, { signal }); signal.throwIfAborted(); await browser.nextStep(); }
        else await browser.act(action);
        await this.tasks.actorEvent(id, "actor_action_completed", { actionEventId: intent.id });
      }
      await this.settled(id, signal);
      await this.tasks.actorEvent(id, "actor_limit", { reason: "action_limit" });
      await this.tasks.finish(id, { reason: "abandoned" }, { signal });
    } catch (error) {
      if (this.tasks.get(id).status === "active") await this.tasks.actorEvent(id, "actor_error", { category: error.name, message: "Actor stopped without claiming task success. No action is replayed automatically." });
      await this.tasks.interruptActor(id, cancellation.aborted ? "actor_cancelled" : signal.aborted ? "actor_timeout" : "actor_failed");
    } finally {
      try { await browser?.close(); } finally { await actor?.close(); }
    }
  }
  async stop(id) {
    const run = this.running.get(id);
    if (!run) return;
    run.controller.abort();
    await run.done;
  }
  async close() { await Promise.all([...this.running.keys()].map((id) => this.stop(id))); }
}
