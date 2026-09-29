import { taskActorPresentationReady } from "../desktop/eval-main/task-actor-browser.mjs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { HumanTaskService } from "../desktop/eval-main/human-task-service.mjs";
import { TaskActorService } from "../desktop/eval-main/task-actor-service.mjs";
import { actorConfiguration, actorPrompt, createCodexTaskActor } from "../desktop/eval-main/task-actor.mjs";
import { createHumanTaskSurface } from "../desktop/eval-main/web-host.mjs";

const cleanups = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });
const action = (kind, extra = {}) => ({ kind, ref: "visible", value: "", reason: "", satisfaction: null, comment: "", ...extra });
async function fixture({ decide, maxActions = 8, busy = false, failWrite = false, navigateOnly = false, retry = false, timeoutMs = 900000 } = {}) {
  const directory = await mkdtemp(join(tmpdir(), "task-actor-test-"));
  cleanups.push(() => rm(directory, { recursive: true, force: true }));
  const turns = [{ id: 1, completionStatus: busy ? "running" : retry ? "not_started" : "accepted", ...(retry ? { latestAttempt: { id: 91, outcome: "model_failed" } } : {}) }];
  const dispatches = [];
  const options = { stateFile: join(directory, "tasks.json"), productSession: { origin: "http://product.invalid", cookie: { name: "control", value: "secret" }, readOnlyCookie: { name: "read", value: "only" } },
    evalService: {
      prepareHumanTask: async () => ({ name: "Task", humanBrief: "PRIVATE BRIEF", humanRubric: "SECRET RUBRIC", execution: { harnessConfigurationName: "fixture", projectId: 1, modelResolution: {} }, plan: [{ name: "Task", prompts: ["Help me plan a trip"] }] }),
      createHumanTaskThread: async () => ({ id: 1, rootInteractionId: 1 }),
      gradeHumanTaskStep: async () => ({ passed: false }),
    },
    fetchImpl: async (url, init) => {
      if (init.method === "POST") {
        dispatches.push(url.pathname);
        if (failWrite) throw new Error("Ambiguous response");
        if (retry) turns[0] = { id: 1, completionStatus: "accepted", latestAttempt: { id: 92, outcome: "accepted" } };
        else turns.push({ id: turns.length + 1, completionStatus: "accepted" });
        return Response.json(turns.at(-1));
      }
      if (url.pathname.endsWith("/export")) return new Response("frozen conversation");
      return Response.json({ interactions: turns });
    },
  };
  const tasks = await new HumanTaskService(options).open();
  const seen = [];
  let id;
  let browserSignal;
  const browser = {
    observe: vi.fn(async () => ({ text: turns.length > 1 ? "A trip plan based on your reply" : "Where do you want to go?", controls: [{ ref: "visible", name: "Send" }] })),
    act: vi.fn(async () => { if (navigateOnly) return; await tasks.write(id, retry ? "/api/threads/1/interactions/1/retry" : "/api/threads/1/interactions", "POST", { text: "Somewhere warm", ...(retry ? { attemptId: 91 } : {}) }, { signal: browserSignal }); }),
    close: vi.fn(),
  };
  const actors = new TaskActorService({ tasks, pollMs: 1, resolveRuntime: async () => ({}), openBrowser: async (_id, signal) => { browserSignal = signal; return browser; },
    createActor: async ({ prompt }) => ({ decide: async (observation, signal) => {
      seen.push({ prompt, observation });
      return { action: decide ? await decide(observation, signal) : turns.length === 1 ? action("click") : action("finish", { reason: "satisfied", satisfaction: 3, comment: "Good enough" }), usage: { input_tokens: 10, output_tokens: 5 } };
    }, close: vi.fn() }),
  });
  cleanups.push(() => actors.close());
  const task = await actors.create({ maxCompletions: 2, endpoint: "A trip plan", actor: { maxActions, timeoutMs } }); id = task.id;
  const done = actors.running.get(id).done;
  return { tasks, actors, id, done, seen, browser, dispatches, turns, options };
}

it("adapts to successive rendered states through session admission, then preserves independent actor and human evidence", async () => {
  const f = await fixture(); await f.done;
  const task = f.tasks.get(f.id);
  expect(f.dispatches).toEqual(["/api/threads/1/interactions"]);
  expect(task).toMatchObject({ mode: "simulated", status: "completed", completions: 2, satisfaction: null, actor: { model: "gpt-6-luna", modelReasoningEffort: "low" }, termination: { reason: "budget_exhausted", success: null } });
  expect(f.seen.map((v) => v.observation.text)).toEqual(["Where do you want to go?", "A trip plan based on your reply"]);
  expect(JSON.stringify(f.seen)).not.toMatch(/PRIVATE BRIEF|SECRET RUBRIC|passed|frozen conversation/);
  expect(task.events.find((v) => v.kind === "actor_satisfaction")).toMatchObject({ scale: "actor-1-4", value: 3 });
  const submission = task.events.findIndex((v) => v.kind === "submission" && !v.initial);
  expect(task.events[submission - 1].kind).toBe("actor_action");
  const reopened = await new HumanTaskService(f.options).open();
  await reopened.grade(f.id, { satisfaction: 1, comment: "Human disagrees" });
  const { bundle } = await reopened.export(f.id);
  expect(bundle.session.satisfaction.value).toBe(1);
  expect(bundle.session.events.find((v) => v.kind === "actor_satisfaction").value).toBe(3);
  expect(bundle.session.stepChecks[0].checks.passed).toBe(false);
  expect(f.browser.close).toHaveBeenCalledOnce();
});

it("waits for product settlement and cancellation does not execute a queued actor action", async () => {
  const f = await fixture({ busy: true });
  await new Promise((resolve) => setTimeout(resolve, 15));
  expect(f.browser.observe).not.toHaveBeenCalled();
  await f.actors.stop(f.id);
  expect(f.dispatches).toEqual([]);
  expect(f.tasks.get(f.id)).toMatchObject({ status: "interrupted", termination: { reason: "actor_cancelled", success: null } });
});

it("never replays uncertain product submissions and retains the reserved completion", async () => {
  const f = await fixture({ failWrite: true }); await f.done;
  expect(f.dispatches).toHaveLength(1);
  expect(f.tasks.get(f.id)).toMatchObject({ completions: 2, status: "interrupted", termination: { reason: "product_write_unknown" } });
  const reopened = await new HumanTaskService(f.options).open();
  expect(reopened.get(f.id).completions).toBe(2);
});

it("bounds navigation and interrupts invalid decisions without executing them", async () => {
  const f = await fixture({ decide: () => action("shell"), maxActions: 1 }); await f.done;
  expect(f.browser.act).not.toHaveBeenCalled();
  expect(f.tasks.get(f.id).status).toBe("interrupted");
});

it("actor capability omits all evaluator context and cannot grade, annotate or open other scopes", async () => {
  const f = await fixture({ busy: true });
  const surface = await createHumanTaskSurface({ tasks: f.tasks, sessionId: f.id, productSession: f.options.productSession, actor: true });
  cleanups.push(() => surface.close());
  const headers = { Authorization: `Bearer ${new URL(surface.url).hash.slice(1)}` };
  const get = await fetch(new URL("/eval-api/task", surface.url), { headers });
  expect(JSON.stringify(await get.json())).not.toMatch(/PRIVATE BRIEF|SECRET RUBRIC|endpoint|actor|events|annotation|grade/);
  expect((await fetch(new URL("/api/threads/1/annotations", surface.url), { headers })).status).toBe(403);
  for (const path of ["/eval-api/grade", "/eval-api/finish", "/eval-api/annotate", "/api/threads/2/interactions", "/api/threads/1/annotations", "/api/internal/annotation-sessions", "/eval-api/openSettings"]) {
    const result = await fetch(new URL(path, surface.url), { method: "POST", headers, body: "{}" });
    expect(result.status, path).toBe(403);
  }
});

it("pins the actor runtime with no filesystem, shell, network or MCP tools and keeps credentials out of the prompt", async () => {
  const config = actorConfiguration();
  const prompt = actorPrompt({ config, request: "Help", endpoint: "A plan" });
  let options; let threadOptions;
  const actor = await createCodexTaskActor({ runtime: { executable: "/managed/codex", environment: { CODEX_HOME: "/owned", OPENAI_API_KEY: "secret", PATH: "/bin" } }, config, prompt,
    createCodex: (value) => { options = value; return { startThread: (value) => { threadOptions = value; return { run: async () => ({ finalResponse: JSON.stringify(action("finish", { reason: "abandoned", satisfaction: 1 })), items: [], usage: null }) }; } }; },
  });
  cleanups.push(() => actor.close());
  await actor.decide({ text: "Visible" });
  expect(options.env).not.toHaveProperty("OPENAI_API_KEY");
  expect(options.config.features).toMatchObject({ shell_tool: false, unified_exec: false, browser_use: false, computer_use: false, multi_agent: false });
  expect(options.config.mcp_servers).toEqual({});
  expect(threadOptions).toMatchObject({ model: "gpt-6-luna", modelReasoningEffort: "low", networkAccessEnabled: false, webSearchMode: "disabled", additionalDirectories: [] });
});

it("ends bounded exploration without claiming endpoint success", async () => {
  const f = await fixture({ decide: () => action("click"), maxActions: 2, navigateOnly: true }); await f.done;
  expect(f.browser.act).toHaveBeenCalledTimes(2);
  expect(f.tasks.get(f.id)).toMatchObject({ status: "completed", completions: 1, termination: { reason: "abandoned", success: null } });
  expect(f.tasks.get(f.id).events.some((event) => event.kind === "actor_limit")).toBe(true);
});

it("cancels a decision durably queued before dispatch", async () => {
  const f = await fixture();
  const original = f.tasks.actorEvent.bind(f.tasks);
  let reached; const atIntent = new Promise((resolve) => { reached = resolve; });
  let release; const gate = new Promise((resolve) => { release = resolve; });
  f.tasks.actorEvent = async (...args) => { const result = await original(...args); if (args[1] === "actor_action") { reached(); await gate; } return result; };
  await atIntent;
  const stopped = f.actors.stop(f.id);
  release(); await stopped;
  expect(f.browser.act).not.toHaveBeenCalled();
  expect(f.dispatches).toEqual([]);
  expect(f.tasks.get(f.id).termination.reason).toBe("actor_cancelled");
});

it("deadline aborts native decisions and preserves partial evidence without replay", async () => {
  const f = await fixture({ timeoutMs: 1000, decide: (_observation, signal) => new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true })) });
  await f.done;
  expect(f.browser.act).not.toHaveBeenCalled();
  expect(f.tasks.get(f.id)).toMatchObject({ status: "interrupted", completions: 1, termination: { reason: "actor_timeout" } });
  expect(f.tasks.get(f.id).events.some((event) => event.kind === "actor_observation")).toBe(true);
});

it("Stop during satisfaction persistence cannot turn interruption into completion", async () => {
  const f = await fixture({ decide: () => action("finish", { reason: "satisfied", satisfaction: 3 }) });
  const original = f.tasks.actorEvent.bind(f.tasks);
  let reached; const pending = new Promise((resolve) => { reached = resolve; });
  let release; const gate = new Promise((resolve) => { release = resolve; });
  f.tasks.actorEvent = async (...args) => { const result = await original(...args); if (args[1] === "actor_satisfaction") { reached(); await gate; } return result; };
  await pending;
  const stopped = f.actors.stop(f.id); release(); await stopped;
  expect(f.tasks.get(f.id)).toMatchObject({ status: "interrupted", termination: { reason: "actor_cancelled" } });
});

it.each(["read", "write"])("Stop aborts a pending product %s and releases session admission", async (kind) => {
  const f = await fixture();
  const fetchImpl = f.tasks.fetchImpl;
  let reached; const pending = new Promise((resolve) => { reached = resolve; });
  f.tasks.fetchImpl = (url, options) => {
    if ((kind === "write") === (options.method === "POST")) {
      expect(options.signal).toBeDefined();
      reached();
      return new Promise((_resolve, reject) => {
        options.signal.throwIfAborted();
        options.signal.addEventListener("abort", () => reject(options.signal.reason), { once: true });
      });
    }
    return fetchImpl(url, options);
  };
  await pending; await f.actors.stop(f.id);
  expect(f.tasks.get(f.id)).toMatchObject({ status: "interrupted", completions: kind === "write" ? 2 : 1, termination: { reason: kind === "write" ? "product_write_unknown" : "actor_cancelled" } });
  await expect(f.tasks.actorEvent(f.id, "forbidden", {})).rejects.toThrow("not active");
});


it("requires the settled retry attempt in the rendered presentation even with a newer paint timestamp", () => {
  const expected = { threadId: 1, turnId: 7, submittedAt: 1000, attemptId: 92 };
  const old = { threadId: 1, turnId: 7, observedAt: 1100, completionStatus: "not_started", attemptId: 91, attemptOutcome: "model_failed" };
  expect(taskActorPresentationReady({ expected, presentation: old })).toBe(false);
  expect(taskActorPresentationReady({ expected, presentation: { ...old, attemptId: 92, attemptOutcome: null } })).toBe(false);
  expect(taskActorPresentationReady({ expected, presentation: { ...old, attemptId: 92 } })).toBe(true);
  expect(taskActorPresentationReady({ expected, presentation: { ...old, attemptId: 92, attemptOutcome: "accepted", completionStatus: "accepted" } })).toBe(true);
});


it("supplies the actual settled retry attempt to the browser readiness gate", async () => {
  let decision = 0;
  const f = await fixture({ retry: true, decide: () => decision++ === 0 ? action("click") : action("finish", { reason: "satisfied", satisfaction: 3 }) });
  await f.done;
  expect(f.tasks.get(f.id).status).toBe("completed");
  expect(f.browser.observe.mock.calls.map(([expected]) => expected.attemptId)).toEqual([91, 92]);
  const [expected] = f.browser.observe.mock.calls[1];
  const stale = { threadId: 1, turnId: 1, attemptId: 91, attemptOutcome: "model_failed", completionStatus: "not_started", observedAt: expected.submittedAt + 100 };
  expect(taskActorPresentationReady({ expected, presentation: stale })).toBe(false);
  expect(taskActorPresentationReady({ expected, presentation: { ...stale, attemptId: 92, attemptOutcome: "accepted", completionStatus: "accepted" } })).toBe(true);
});

it("service close aborts a pending native decision and closes its browser without dispatch", async () => {
  const f = await fixture({ decide: (_observation, signal) => new Promise((_resolve, reject) => {
    signal.throwIfAborted();
    signal.addEventListener("abort", () => reject(signal.reason), { once: true });
  }) });
  await vi.waitFor(() => expect(f.seen).toHaveLength(1));
  await f.actors.close();
  expect(f.dispatches).toEqual([]);
  expect(f.browser.close).toHaveBeenCalledOnce();
  expect(f.actors.running.size).toBe(0);
  expect(f.tasks.get(f.id)).toMatchObject({ status: "interrupted", termination: { reason: "actor_cancelled" } });
});
