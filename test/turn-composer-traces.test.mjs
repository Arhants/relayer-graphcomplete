import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  PROMISES,
  TurnComposerWorld,
  projectModelState,
} from "./support/turn-composer-trace-adapter.mjs";

// Scenario traces rendered from models/tla/TurnComposer.tla (see
// models/tla/README.md). Each step replays against the real Product
// workspace in happy-dom. The real composer must equal the model's state
// after every step. A scenario's promises must hold throughout; a promise in
// violatedAtEnd is an open bug that both the model and the code break at the
// final step, and the replay proves the code reaches it.
const traceDirectory = join(import.meta.dirname, "..", "models", "tla", "traces");
const manifest = JSON.parse(readFileSync(join(import.meta.dirname, "..", "models", "tla", "checks.json"), "utf8"));
const traces = readdirSync(traceDirectory)
  .filter((file) => file.endsWith(".json"))
  .map((file) => JSON.parse(readFileSync(join(traceDirectory, file), "utf8")))
  .filter((trace) => trace.module === "TurnComposer");

const describeStep = (action) => (action ? action.join(" ") : "initial state");
let world;

afterEach(() => {
  world?.dispose();
  world = null;
});

describe("TurnComposer traces replay against the Product workspace composer", () => {
  it("has traces to replay", () => {
    expect(traces.length).toBeGreaterThan(0);
  });

  for (const trace of traces) {
    it(`${trace.scenario}: ${trace.summary}`, async () => {
      const bounds = manifest.presets["composer-replay"];
      world = await new TurnComposerWorld({ maxText: Number(bounds.MaxText), maxTurns: Number(bounds.MaxTurns) }).ready();
      const last = trace.steps.length - 1;
      for (const [index, { action, state }] of trace.steps.entries()) {
        if (action) await world.apply(action);
        const real = world.observe();
        const where = `step ${index} (${describeStep(action)})`;
        expect(real, `${where}: real state diverges from the model`).toEqual(projectModelState(state));
        for (const promise of trace.promises) {
          expect(PROMISES[promise](real, state), `${where}: ${promise} is broken`).toBe(true);
        }
        for (const promise of trace.violatedAtEnd ?? []) {
          expect(PROMISES[promise](real, state), `${where}: ${promise} ${index === last ? "no longer breaks; the bug is fixed" : "breaks early"}`)
            .toBe(index !== last);
        }
      }
    });
  }
});

// Not in TurnComposer.tla, which does not restart the app.
describe("After a restart, text an earlier session left in an older turn", () => {
  it("is carried into the newest turn when it was not sent", async () => {
    world = await new TurnComposerWorld({
      maxText: 2, maxTurns: 2,
      turnsA: [{ status: "accepted" }, { status: "accepted", text: "Invoked" }],
      persisted: { 1: "left behind" },
    }).ready();
    expect(world.prompt.value).toBe("left behind");
    expect(world.persistedDraft(2)).toBe("left behind");
    expect(world.persistedDraft(1)).toBeNull();
  });

  it("is not carried into the turn a send made before the restart", async () => {
    // The send's POST may have committed; its turn appears only after the restart.
    world = await new TurnComposerWorld({ maxText: 2, maxTurns: 2, persisted: { 1: "sent before" } }).ready();
    expect(world.prompt.value).toBe("sent before");
    await world.turnArrivesWithText("sent before");
    expect(world.prompt.value).toBe("");
    expect(world.persistedDraft(1)).toBeNull();
  });

  it("is retired when a newer turn's draft superseded it", async () => {
    world = await new TurnComposerWorld({
      maxText: 2, maxTurns: 3,
      turnsA: [{ status: "accepted" }, { status: "accepted", text: "Invoked" }],
      persisted: { 1: "older text", 2: "newer text" },
    }).ready();
    expect(world.prompt.value).toBe("newer text");
    expect(world.persistedDraft(1)).toBeNull();
    world.prompt.value = "";
    world.prompt.dispatchEvent(new world.window.Event("input"));
    await world.turnArrivesWithText("Invoked again");
    expect(world.prompt.value).toBe("");
  });

  it("is not carried when a later turn shows it was sent", async () => {
    world = await new TurnComposerWorld({
      maxText: 2, maxTurns: 2,
      turnsA: [{ status: "accepted" }, { status: "accepted", text: "left behind" }],
      persisted: { 1: "left behind" },
    }).ready();
    expect(world.prompt.value).toBe("");
    expect(world.persistedDraft(1)).toBeNull();
  });
});

// TurnComposer.tla's one scalar send per thread assumes a second Send away;
// this replays one against the real workspace.
describe("A second Send while the thread's follow-up is in flight", () => {
  it("does not post, even after the thread was left and shown again", async () => {
    world = await new TurnComposerWorld({ maxText: 3, maxTurns: 2 }).ready();
    for (const step of [["Type"], ["ClickSend"], ["SwitchThread", "B"], ["SwitchThread", "A"], ["Type"]]) {
      await world.apply(step);
    }
    expect(world.send.disabled).toBe(true);
    // Force the click past the disabled button, as a keyboard shortcut or a
    // stale event could.
    world.send.disabled = false;
    world.send.click();
    await world.apply(["BackgroundRender"]);
    expect(world.submits).toBe(1);
  });
});

// Not in TurnComposer.tla, which leaves restored retry drafts out.
describe("Retry text a newer draft kept out", () => {
  const failedTurn = {
    status: "not_started", text: "the failed prompt", latestAttempt: { id: 1, outcome: "model_failed" },
  };

  it("returns as soon as the draft is cleared", async () => {
    world = await new TurnComposerWorld({
      maxText: 2, maxTurns: 2, turnsA: [failedTurn], persisted: { 1: "my newer draft" },
    }).ready();
    expect(world.prompt.value).toBe("my newer draft");
    world.prompt.value = "";
    world.prompt.dispatchEvent(new world.window.Event("input"));
    expect(world.prompt.value).toBe("the failed prompt");
    expect(world.persistedDraft(1)).toBe("the failed prompt");
  });

  it("can be cleared after a restart that kept it on screen", async () => {
    world = await new TurnComposerWorld({ maxText: 2, maxTurns: 2, turnsA: [failedTurn] }).ready();
    expect(world.prompt.value).toBe("the failed prompt");
    // An edit undone persists the restored text as the draft.
    for (const value of ["the failed prompt!", "the failed prompt"]) {
      world.prompt.value = value;
      world.prompt.dispatchEvent(new world.window.Event("input"));
    }
    const storage = world.storageSnapshot();
    world.dispose();
    world = await new TurnComposerWorld({ maxText: 2, maxTurns: 2, turnsA: [failedTurn], storage }).ready();
    expect(world.prompt.value).toBe("the failed prompt");
    world.prompt.value = "";
    world.prompt.dispatchEvent(new world.window.Event("input"));
    await world.apply(["BackgroundRender"]);
    expect(world.prompt.value).toBe("");
  });

  it("returns when a user's own draft with the same text is cleared", async () => {
    world = await new TurnComposerWorld({
      maxText: 2, maxTurns: 2, turnsA: [failedTurn], persisted: { 1: "the failed prompt" },
    }).ready();
    world.prompt.value = "";
    world.prompt.dispatchEvent(new world.window.Event("input"));
    await world.apply(["BackgroundRender"]);
    expect(world.prompt.value).toBe("the failed prompt");
  });

  it("returns after the draft is cleared and the app restarts", async () => {
    world = await new TurnComposerWorld({
      maxText: 2, maxTurns: 2, turnsA: [failedTurn], persisted: { 1: "my newer draft" },
    }).ready();
    expect(world.prompt.value).toBe("my newer draft");
    world.prompt.value = "";
    world.prompt.dispatchEvent(new world.window.Event("input"));
    const persisted = world.persistedDraft(1);
    world.dispose();
    world = await new TurnComposerWorld({
      maxText: 2, maxTurns: 2, turnsA: [failedTurn], persisted: { 1: persisted },
    }).ready();
    expect(world.prompt.value).toBe("the failed prompt");
  });
});

// Not in TurnComposer.tla, whose typed values never repeat.
describe("An edit after Send that retypes the same text", () => {
  it("is kept once the send's turn arrives and settles", async () => {
    world = await new TurnComposerWorld({ maxText: 2, maxTurns: 2 }).ready();
    await world.apply(["Type"]);
    const sentText = world.prompt.value;
    await world.apply(["ClickSend"]);
    world.prompt.value = "";
    world.prompt.dispatchEvent(new world.window.Event("input"));
    world.prompt.value = sentText;
    world.prompt.dispatchEvent(new world.window.Event("input"));
    for (const step of [["PostInserted", "A"], ["PostSucceeds", "A"], ["RefreshReturns", "A"], ["Settle", "A"]]) {
      await world.apply(step);
    }
    expect(world.prompt.value).toBe(sentText);
  });

  for (const turnLoads of ["before", "after"]) {
    it(`is kept across a restart before its turn loads, when the turn loads ${turnLoads} the restart`, async () => {
      world = await new TurnComposerWorld({ maxText: 2, maxTurns: 2 }).ready();
      await world.apply(["Type"]);
      const sentText = world.prompt.value;
      await world.apply(["ClickSend"]);
      world.prompt.value = "";
      world.prompt.dispatchEvent(new world.window.Event("input"));
      world.prompt.value = sentText;
      world.prompt.dispatchEvent(new world.window.Event("input"));
      for (const step of [["PostInserted", "A"], ["PostSucceeds", "A"], ["RefreshSkipped", "A"], ["Settle", "A"]]) {
        await world.apply(step);
      }
      const storage = world.storageSnapshot();
      world.dispose();
      const sentTurn = { status: "running", text: sentText };
      world = await new TurnComposerWorld({
        maxText: 2, maxTurns: 2, storage,
        turnsA: turnLoads === "before" ? [{ status: "accepted" }, sentTurn] : [{ status: "accepted" }],
      }).ready();
      if (turnLoads === "after") {
        world.pendingTurn.A = true;
        world.recordedText.A = sentText;
        await world.apply(["TurnArrives", "A"]);
      }
      expect(world.prompt.value).toBe(sentText);
      await world.apply(["BackgroundRender"]);
      expect(world.prompt.value).toBe(sentText);
    });
  }

  it("is kept when the send settles before its turn loads", async () => {
    world = await new TurnComposerWorld({ maxText: 2, maxTurns: 2 }).ready();
    await world.apply(["Type"]);
    const sentText = world.prompt.value;
    await world.apply(["ClickSend"]);
    world.prompt.value = "";
    world.prompt.dispatchEvent(new world.window.Event("input"));
    world.prompt.value = sentText;
    world.prompt.dispatchEvent(new world.window.Event("input"));
    for (const step of [["PostInserted", "A"], ["PostSucceeds", "A"], ["RefreshSkipped", "A"], ["Settle", "A"], ["TurnArrives", "A"]]) {
      await world.apply(step);
    }
    expect(world.prompt.value).toBe(sentText);
    await world.apply(["BackgroundRender"]);
    expect(world.prompt.value).toBe(sentText);
  });
});
