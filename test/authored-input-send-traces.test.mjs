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
