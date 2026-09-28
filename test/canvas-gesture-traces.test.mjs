import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  CanvasGestureWorld,
  PROMISES,
  projectModelState,
} from "./support/canvas-gesture-trace-adapter.mjs";

// Scenario traces rendered from models/tla/CanvasGesture.tla (see
// models/tla/README.md). Each step replays pointer gestures and renders
// against the real Product workspace canvas in happy-dom. The real canvas
// must equal the model's state after every step, and the scenario's
// promises must hold on it.
const traceDirectory = join(import.meta.dirname, "..", "models", "tla", "traces");
const manifest = JSON.parse(readFileSync(join(import.meta.dirname, "..", "models", "tla", "checks.json"), "utf8"));
const L = Number(manifest.presets.canvas.L);
const traces = readdirSync(traceDirectory)
  .filter((file) => file.endsWith(".json"))
  .map((file) => JSON.parse(readFileSync(join(traceDirectory, file), "utf8")))
  .filter((trace) => trace.module === "CanvasGesture");

const describeStep = (action) => (action ? action.join(" ") : "initial state");
let world;

afterEach(() => {
  world?.dispose();
  world = null;
});

describe("CanvasGesture traces replay against the Product workspace canvas", () => {
  it("has traces to replay", () => {
    expect(traces.length).toBeGreaterThan(0);
  });

  for (const trace of traces) {
    it(`${trace.scenario}: ${trace.summary}`, async () => {
      world = new CanvasGestureWorld({ initialPointer: trace.steps[0].state.ptr });
      for (const [index, { action, state }] of trace.steps.entries()) {
        if (action) await world.apply(action);
        const real = world.observe();
        const where = `step ${index} (${describeStep(action)})`;
        expect(real, `${where}: real canvas diverges from the model`).toEqual(projectModelState(state, L));
        for (const promise of trace.promises) {
          expect(PROMISES[promise](real, state, L), `${where}: ${promise} is broken`).toBe(true);
        }
      }
    });
  }
});

// Not in the model, whose other view never empties the graph: a graph that
// empties mid-drag must not leave the dragged node's element behind, holding
// the pointer, to be clicked on release.
describe("A graph that empties while a node is dragged", () => {
  it("does not select the vanished node on release", async () => {
    world = new CanvasGestureWorld({ initialPointer: 0 });
    await world.apply(["Press"]);
    await world.moveTo(1);
    await world.showEmpty();
    await world.release();
    expect(world.selectedNodeId).toBeNull();
    expect(world.window.document.querySelector("#inspector").classList.contains("hidden")).toBe(true);
  });
});

// Not in the model. A drag that ended no longer keeps its node: a later
// layout change moves the node to its new placement.
describe("A drag ends", () => {
  it("when the pointer moves with no button pressed", async () => {
    world = new CanvasGestureWorld({ initialPointer: 0 });
    await world.apply(["Press"]);
    await world.moveTo(1);
    await world.hoverTo(1);
    await world.apply(["RenderLayout"]);
    expect(world.observe().node).not.toBe(1);
  });

  it("when a render cannot capture the pointer again", async () => {
    world = new CanvasGestureWorld({ initialPointer: 0 });
    await world.apply(["Press"]);
    await world.moveTo(1);
    const capture = world.window.Element.prototype.setPointerCapture;
    world.window.Element.prototype.setPointerCapture = () => {
      throw new world.window.DOMException("No active pointer", "NotFoundError");
    };
    await world.apply(["RenderSame"]);
    world.window.Element.prototype.setPointerCapture = capture;
    await world.apply(["RenderLayout"]);
    expect(world.observe().node).not.toBe(1);
  });

  it("when another view that also shows the node is entered", async () => {
    world = new CanvasGestureWorld({ initialPointer: 0 });
    await world.showView(98, 0.7);
    const undisturbed = world.nodeLeft;
    world.dispose();
    world = new CanvasGestureWorld({ initialPointer: 0 });
    await world.apply(["Press"]);
    await world.moveTo(1);
    await world.showView(98, 0.7);
    expect(world.nodeLeft).toBe(undisturbed);
  });
});
