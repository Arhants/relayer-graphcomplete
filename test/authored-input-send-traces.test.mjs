import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  AuthoredInputSendWorld,
  PROMISES,
  projectModelState,
} from "./support/authored-input-send-trace-adapter.mjs";

// Scenario traces rendered from models/tla/AuthoredInputSend.tla (see
// models/tla/README.md). Each step replays against the real Product
// workspace, its authored Node Detail input, and its input draft controller
// in happy-dom, with a fake app server applying the storage rules. The real
// requests must match the model after every step. A promise in
// violatedAtEnd is an open bug that breaks at the final step.
const traceDirectory = join(import.meta.dirname, "..", "models", "tla", "traces");
const traces = readdirSync(traceDirectory)
  .filter((file) => file.endsWith(".json"))
  .map((file) => JSON.parse(readFileSync(join(traceDirectory, file), "utf8")))
  .filter((trace) => trace.module === "AuthoredInputSend");

const describeStep = (action) => (action ? action.join(" ") : "initial state");
let world;

afterEach(() => {
  world?.dispose();
  world = null;
});

describe("AuthoredInputSend traces replay against the Product workspace", () => {
  it("has traces to replay", () => {
    expect(traces.length).toBeGreaterThan(0);
  });

  for (const trace of traces) {
    it(`${trace.scenario}: ${trace.summary}`, async () => {
      world = await new AuthoredInputSendWorld().ready();
      const last = trace.steps.length - 1;
      for (const [index, { action, state }] of trace.steps.entries()) {
        if (action) await world.apply(action);
        const where = `step ${index} (${describeStep(action)})`;
        expect(world.observe(), `${where}: real state diverges from the model`).toEqual(projectModelState(state));
        for (const promise of trace.promises) {
          expect(PROMISES[promise](world, state), `${where}: ${promise} is broken`).toBe(true);
        }
        for (const promise of trace.violatedAtEnd ?? []) {
          expect(PROMISES[promise](world, state), `${where}: ${promise} ${index === last ? "no longer breaks; the bug is fixed" : "breaks early"}`)
            .toBe(index !== last);
        }
      }
    });
  }
});

// TurnComposer.tla's ClickSendWaits, InvokeTurn, then Reconciled or
// ReconcileEnds: a Send waits on an authored input commit while a turn
// created elsewhere in the thread arrives. The composer adapter has no
// authored input to hold a Send on, so these run in this world.
describe("A newer turn arriving while Send waits for an authored commit", () => {
  const COMPOSED = "Here is my answer";

  it("does not carry the text being sent into the newer turn", async () => {
    world = await new AuthoredInputSendWorld().ready();
    for (const step of [["Type", 1], ["Commit"], ["ClickSend"]]) await world.apply(step);
    await world.newerTurnArrives();
    expect(world.promptText).toBe("");
    for (const step of [["ServeCommit"], ["CommitReturns"], ["ServeSend"], ["SendReturns"]]) {
      await world.apply(step);
    }
    expect(world.sentWith).toBe(1);
    expect(world.promptText).toBe("");
  });

  it("keeps text typed since then when the stopped Send hands its text back", async () => {
    world = await new AuthoredInputSendWorld().ready();
    for (const step of [["Type", 1], ["Commit"], ["ClickSend"]]) await world.apply(step);
    await world.newerTurnArrives();
    await world.typePrompt("second thought");
    for (const step of [["CommitFails"], ["CommitReturns"]]) await world.apply(step);
    expect(world.post).toBeNull();
    expect(world.promptText).toBe(`${COMPOSED}\n\nsecond thought`);
  });

  it("hands the text back when that Send stops", async () => {
    world = await new AuthoredInputSendWorld().ready();
    for (const step of [["Type", 1], ["Commit"], ["ClickSend"]]) await world.apply(step);
    await world.newerTurnArrives();
    for (const step of [["CommitFails"], ["CommitReturns"]]) await world.apply(step);
    expect(world.post).toBeNull();
    expect(world.promptText).toBe(COMPOSED);
  });
});

describe("Send after an answer did not save", () => {
  it("is not stopped once the Node Detail with that answer was closed", async () => {
    world = await new AuthoredInputSendWorld().ready();
    for (const step of [["Type", 1], ["Commit"], ["CommitFails"], ["CommitReturns"]]) await world.apply(step);
    await world.click("#closeInspector");
    await world.click("#sendInteraction");
    expect(world.post).not.toBeNull();
  });
});

describe("A follow-up whose POST fails with a server error", () => {
  it("keeps its text in the composer when an unrelated newer turn arrives", async () => {
    world = await new AuthoredInputSendWorld().ready();
    await world.click("#sendInteraction");
    world.post.response.reject(Object.assign(new Error("The server could not be reached."), { status: 503 }));
    await world.settled();
    expect(world.promptText).toBe("Here is my answer");
    await world.newerTurnArrives();
    expect(world.promptText).toBe("Here is my answer");
  });
});

// Not in TurnComposer.tla, which leaves out the draft-send warning.
describe("The draft-send warning", () => {
  const draft = {
    id: "d1", threadId: 3, target: { nodeId: 7 }, targetNode: { title: "Question" }, text: "note",
    revision: 1, createdAt: "2026-09-27T00:00:00Z", updatedAt: "2026-09-27T00:00:00Z",
  };

  it("holds the text while open, and hands it back when cancelled after a newer turn", async () => {
    world = await new AuthoredInputSendWorld({ contextDrafts: [draft] }).ready();
    const dialog = world.window.document.querySelector("#contextDraftSendWarning");
    dialog.showModal ??= function showModal() { this.open = true; };
    dialog.close ??= function close() { this.open = false; };
    await world.click("#sendInteraction");
    expect(dialog.open).toBe(true);
    await world.newerTurnArrives();
    expect(world.promptText).toBe("");
    await world.click("#cancelContextDraftSend");
    expect(world.post).toBeNull();
    expect(world.promptText).toBe("Here is my answer");
  });
});
