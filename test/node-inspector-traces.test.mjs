import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  NodeInspectorWorld,
  PROMISES,
  comparable,
} from "./support/node-inspector-trace-adapter.mjs";

// Scenario traces rendered from models/tla/NodeInspector.tla (see
// models/tla/README.md). Each step replays against the real Product
// workspace and its node context draft controller in happy-dom. The real
// inspector must equal the model's state after every step. A scenario's
// promises must hold throughout; a promise in violatedAtEnd is an open bug
// that both the model and the code break at the final step.
const traceDirectory = join(import.meta.dirname, "..", "models", "tla", "traces");
const traces = readdirSync(traceDirectory)
  .filter((file) => file.endsWith(".json"))
  .map((file) => JSON.parse(readFileSync(join(traceDirectory, file), "utf8")))
  .filter((trace) => trace.module === "NodeInspector");

const describeStep = (action) => (action ? action.join(" ") : "initial state");
let world;

afterEach(() => {
  world?.dispose();
  world = null;
});

describe("NodeInspector traces replay against the Product workspace inspector", () => {
  it("has traces to replay", () => {
    expect(traces.length).toBeGreaterThan(0);
  });

  for (const trace of traces) {
    it(`${trace.scenario}: ${trace.summary}`, async () => {
      world = await new NodeInspectorWorld().ready();
      const last = trace.steps.length - 1;
      let before = null;
      for (const [index, { action, state }] of trace.steps.entries()) {
        if (action) await world.apply(action, before, state);
        before = state;
        const real = world.observe();
        const where = `step ${index} (${describeStep(action)})`;
        const [observed, expected] = comparable(real, state);
        expect(observed, `${where}: real state diverges from the model`).toEqual(expected);
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

// Not in NodeInspector.tla, which has one thread.
describe("A request waiting for a resolving draft", () => {
  const quietModel = { slots: {} };

  it("is void once the user switches to another thread", async () => {
    // The trace's first steps annotate n1 and start discarding its draft.
    const trace = traces.find((candidate) => candidate.scenario === "inspector-view-change-during-discard");
    const discard = trace.steps.findIndex(({ action }) => action?.[0] === "Discard");
    world = await new NodeInspectorWorld().ready();
    for (let index = 1; index <= discard; index += 1) {
      await world.apply(trace.steps[index].action, trace.steps[index - 1].state, trace.steps[index].state);
    }
    const turnChange = world.workspace.prepareSelectionChange();
    world.thread = { ...world.thread, id: 4, title: "Other thread" };
    world.selection.currentThreadId = 4;
    world.workspace.render();
    await world.apply(["DiscardReturns", "ok"], quietModel, quietModel);
    expect(await turnChange).toBe(false);
  });
});
