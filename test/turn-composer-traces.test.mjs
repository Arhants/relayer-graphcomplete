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
  });

  it("is not carried when a later turn shows it was sent", async () => {
    world = await new TurnComposerWorld({
      maxText: 2, maxTurns: 2,
      turnsA: [{ status: "accepted" }, { status: "accepted", text: "left behind" }],
      persisted: { 1: "left behind" },
    }).ready();
    expect(world.prompt.value).toBe("");
  });
});
