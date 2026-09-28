import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { EvalService } from "../desktop/eval-main/eval-service.mjs";

const directories = [];
afterEach(async () => {
  vi.unstubAllGlobals();
  for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true });
});

it.each([
  { agentAuthored: true, terminal: "accepted" },
  { agentAuthored: false, terminal: "stopped" },
])("observes a late $terminal child and resets the quiet window with recursion=$agentAuthored", async ({ agentAuthored, terminal }) => {
  const directory = await mkdtemp(join(tmpdir(), "eval-child-discovery-"));
  directories.push(directory);
  const configurationPath = join(directory, "fixture.yaml");
  const configuration = await readFile(new URL("../harnesses/fixture-task-system.yaml", import.meta.url), "utf8");
  await writeFile(configurationPath, `${configuration}\ncomplete:\n  agentAuthored: ${agentAuthored}\n`);
  let now = 0;
  const observations = [];
  const clock = {
    now: () => now,
    sleep: async (ms) => { now += ms; },
  };
  const root = { id: 10, sequence: 1, graphNodeId: 100, completionStatus: "stopped", completionOutput: null };
  vi.stubGlobal("fetch", vi.fn(async (url, options = {}) => {
    const path = new URL(url).pathname;
    let value;
    if (path === "/api/model-settings") value = { families: [], providers: [], harnesses: [] };
    else if (path === "/api/threads" && options.method === "POST") value = { id: 1, rootInteractionId: root.id };
    else if (path === "/api/state") value = { currentProjection: { events: [] } };
    else if (path === "/api/threads/1") {
      // These are controlled product read snapshots, not simulated native execution.
      // A stopped human turn does not imply that every descendant has settled.
      const child = now < 4_750 ? null : {
        id: 11, sequence: 2, graphNodeId: 101,
        completionStatus: now < 12_000 ? "running" : terminal,
        completionOutput: null,
      };
      observations.push({ now, status: child?.completionStatus ?? "absent" });
      value = {
        id: 1,
        interactions: child ? [root, child] : [root],
        actionInvocations: child ? [{ sourceInteractionId: 10, actionId: 20, resultInteractionId: 11 }] : [],
      };
    } else throw new Error(`Unexpected product request: ${options.method} ${path}`);
    return new Response(JSON.stringify(value), { headers: { "content-type": "application/json" } });
  }));
  const stateFile = join(directory, "runs.json");
  const service = await new EvalService({
    stateFile,
    productSession: { origin: "http://product.invalid", cookie: { name: "fixture", value: "fixture" } },
    configurationPaths: [configurationPath],
    semanticChildDiscoveryClock: clock,
  }).open();
  const created = await service.createRun({
    testCaseIds: ["empty-project.task-system.single-turn"],
    harnessConfigurationNames: ["fixture-task-system"],
    judgeConfigurationName: "deterministic-graph-contract",
  });
  await service.running.get(created.id);
  await service.persistTail;
  const run = service.getRun(created.id);
  expect(run.executions[0].error).toBeNull();
  expect(run.status).toBe("failed"); // The stopped root is recorded, never promoted to success.
  expect(observations).toEqual(expect.arrayContaining([
    { now: 0, status: "absent" },
    { now: 4_750, status: "running" },
    { now: 5_000, status: "running" },
    { now: 9_750, status: "running" },
    { now: 12_000, status: terminal },
    { now: 16_750, status: terminal },
    { now: 17_000, status: terminal },
  ]));
  expect(now).toBe(17_000);
  const persisted = JSON.parse(await readFile(stateFile, "utf8"));
  expect(persisted.runs[0].executions[0].semanticChildren).toEqual([
    expect.objectContaining({ interactionId: 11, status: terminal }),
  ]);
});
