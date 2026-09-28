// Replays CanvasGesture.tla scenario traces against the real Product
// workspace's graph canvas in happy-dom.
//
// A spec location i is the screen point P0 + i * STEP, where P0 is node N's
// first rendered position; the stage sits at the origin, so client and stage
// coordinates agree. Press, Move, and Release dispatch pointer events the way
// a browser routes them: to the element holding pointer capture while it is
// still in the document, otherwise to the element under the pointer. Captures
// are recorded by wrapping setPointerCapture, so routing follows whatever the
// real code captured. RenderSame re-renders the same accepted layer; Leave
// and Return switch to another layer and back.
//
// observe() reads where N is drawn (as a location, or "off" when N is not on
// the canvas), the camera offset in locations, and the press in progress.
// Locations and offsets are read modulo L, as the spec's ring is; a fit
// centers the one node N, which puts it at location 0 as the spec's Fit does.
// RenderLayout moves N's authored placement. It is replayed only while a
// moved drag holds N, which keeps N where it is; otherwise the new placement
// does not map onto evenly spaced locations.

import { Window } from "happy-dom";
import { vi } from "vitest";

import { createProductWorkspace } from "../../desktop/renderer/src/product-workspace/workspace.js";

const STEP = 100;
const NODE = 7;

async function settle() {
  for (let turn = 0; turn < 10; turn += 1) await new Promise((resolve) => setImmediate(resolve));
}

function layer(id, nodeId, x = 0.4) {
  const nodes = nodeId == null ? [] : [{ id: nodeId, kind: "concept", icon: "box", title: `Node ${nodeId}`, detail: "detail" }];
  return {
    layer: { id, layout: { version: 1, placements: nodes.map((node) => ({ nodeId: node.id, x, y: 0.5 })) } },
    nodes,
    edges: [],
    actions: [],
  };
}

export class CanvasGestureWorld {
  constructor({ initialPointer, L = 3 }) {
    this.L = L;
    this.window = new Window({ url: "http://127.0.0.1:3000" });
    vi.stubGlobal("document", this.window.document);
    vi.stubGlobal("window", this.window);
    vi.stubGlobal("localStorage", this.window.localStorage);
    vi.stubGlobal("lucide", new Proxy({
      createElement: () => this.window.document.createElement("svg"),
    }, { get: (target, key) => target[key] ?? {} }));
    this.window.document.body.innerHTML = '<section id="threadView"></section><div id="toast" class="hidden"></div>';
    this.captures = new Map();
    const world = this;
    const capture = this.window.Element.prototype.setPointerCapture;
    this.window.Element.prototype.setPointerCapture = function setPointerCapture(pointerId) {
      world.captures.set(pointerId, this);
      return capture?.call(this, pointerId);
    };
    this.home = layer(99, NODE);
    this.away = layer(98, 9);
    this.state = {
      status: "accepted",
      currentInteractionId: 5,
      interactions: [{
        id: 5, threadId: 3, sequence: 1, text: "Question", graphNodeId: 50,
        completionStatus: "accepted", completionOutput: { rootLayer: this.home },
      }],
      edges: [],
      actions: [],
      projects: [],
      permissionProfiles: [],
      modelSettings: {
        defaults: { harnessId: "fixture" },
        harnesses: [{ id: "fixture", label: "Fixture", available: true }],
        providers: [],
        families: [],
      },
      modelCatalog: [],
      actionInvocations: [],
      pendingActionInvocations: [],
    };
    this.#show(this.home);
    this.selection = { currentThreadId: 3, currentInteractionId: 5, selectedNodeId: null, layerPath: [] };
    this.workspace = createProductWorkspace({
      root: this.window.document,
      getState: () => this.state,
      getThread: () => ({ id: 3, title: "Thread", harnessId: "fixture" }),
      selection: this.selection,
      showThread: () => {},
      showEmpty: () => {},
    });
    this.workspace.render();
    const origin = this.#nodePoint();
    this.origin = origin;
    this.cameraOrigin = this.#cameraX();
    this.pointer = this.#point(initialPointer);
    this.pressed = "none";
  }

  // A refresh brings a new state object with new objects for the same
  // accepted layer, so code holding an older state keeps seeing it.
  #show(presented) {
    const copy = { ...presented, nodes: presented.nodes.map((node) => ({ ...node })) };
    this.state = { ...this.state, visibleLayer: copy, nodes: copy.nodes };
  }

  #point(location) {
    return { x: this.origin.x + location * STEP, y: this.origin.y };
  }

  get #node() {
    return this.window.document.querySelector(`[data-node="${NODE}"]`);
  }

  #nodePoint() {
    const element = this.#node;
    return element ? { x: parseFloat(element.style.left), y: parseFloat(element.style.top) } : null;
  }

  #cameraX() {
    return parseFloat(this.window.document.querySelector("#graphStage").style.backgroundPosition);
  }

  #underPointer() {
    const point = this.#nodePoint();
    const over = point && Math.abs(point.x - this.pointer.x) < 0.5 && Math.abs(point.y - this.pointer.y) < 0.5;
    return over ? this.#node : this.window.document.querySelector("#graphStage");
  }

  #target() {
    const captured = this.captures.get(1);
    return captured?.isConnected ? captured : this.#underPointer();
  }

  #dispatch(type, target, buttons = type === "pointerup" ? 0 : 1) {
    target.dispatchEvent(new this.window.PointerEvent(type, {
      bubbles: true, cancelable: true, pointerId: 1, button: 0, pointerType: "mouse",
      buttons,
      clientX: this.pointer.x, clientY: this.pointer.y,
    }));
  }

  async apply([name, arg]) {
    switch (name) {
      case "Press": {
        const target = this.#underPointer();
        this.pressed = target === this.#node ? "node" : "stage";
        this.#dispatch("pointerdown", target);
        break;
      }
      case "Move": {
        this.pointer = this.#point(arg);
        this.#dispatch("pointermove", this.#target());
        break;
      }
      case "Release": {
        const target = this.#target();
        this.#dispatch("pointerup", target);
        if (this.pressed === "node" && target.dataset?.node) target.click();
        this.captures.delete(1);
        this.pressed = "none";
        break;
      }
      case "RenderLayout": {
        if (this.pressed !== "node") throw new Error("RenderLayout is replayed only during a drag");
        this.layoutX = this.layoutX === 0.6 ? 0.4 : 0.6;
        this.home = layer(99, NODE, this.layoutX);
        this.#show(this.home);
        this.workspace.render();
        break;
      }
      case "RenderSame": {
        this.#show(this.home);
        this.workspace.render();
        break;
      }
      case "Leave": {
        this.#show(this.away);
        this.workspace.render();
        break;
      }
      case "Return": {
        this.#show(this.home);
        this.workspace.render();
        break;
      }
      default:
        throw new Error(`Unreplayed CanvasGesture action ${name}`);
    }
    await settle();
  }

  // Not in the model: the same view's graph empties, as while a newer
  // revision has no graph yet.
  async showEmpty() {
    this.#show(layer(99, null));
    this.workspace.render();
    await settle();
  }

  // Not in the model: the pointer moves over the node or the stage.
  async moveTo(location) {
    this.pointer = this.#point(location);
    this.#dispatch("pointermove", this.#target());
    await settle();
  }

  // Not in the model: a move with no button pressed, as after a missed
  // release.
  async hoverTo(location) {
    this.pointer = this.#point(location);
    this.#dispatch("pointermove", this.#target(), 0);
    await settle();
  }

  // Not in the model: another view, with node N at placement x and another
  // node at the left edge, so the fit does not hide where N is placed.
  async showView(id, x) {
    const view = layer(id, NODE, x);
    view.nodes.push({ id: 9, kind: "concept", icon: "box", title: "Node 9", detail: "detail" });
    view.layer.layout.placements.push({ nodeId: 9, x: 0.1, y: 0.5 });
    this.#show(view);
    this.workspace.render();
    await settle();
  }

  get nodeLeft() {
    return this.window.document.querySelector(`[data-node="${NODE}"]`)?.style.left;
  }

  // Not in the model: release, with the click that follows on the node.
  async release() {
    await this.apply(["Release"]);
  }

  get selectedNodeId() {
    return this.selection.selectedNodeId;
  }

  // The refinement mapping onto the spec's observable variables.
  observe() {
    const point = this.#nodePoint();
    const location = point && Math.abs(point.y - this.origin.y) < 0.5
      ? (point.x - this.origin.x) / STEP : null;
    const offset = (this.#cameraX() - this.cameraOrigin) / STEP;
    const ring = (value) => {
      const whole = Math.round(value);
      return Math.abs(value - whole) < 1e-6 ? ((whole % this.L) + this.L) % this.L : "elsewhere";
    };
    return {
      node: point === null ? "off" : ring(location),
      cam: this.#node ? ring(offset) : "away",
      pressed: this.pressed,
    };
  }

  dispose() {
    this.workspace.dispose();
    vi.unstubAllGlobals();
  }
}

export function projectModelState(state, L) {
  const screen = (state.w + state.cam) % L;
  return {
    node: state.view === "home" ? screen : "off",
    cam: state.view === "home" ? state.cam : "away",
    pressed: state.pressed,
  };
}

// Promises over the real observation and the trace's ghosts.
export const PROMISES = {
  DragFollowsPointer: (real, model) => !(model.pressed === "node" && model.drag.on && model.drag.moved
    && model.view === "home") || real.node === model.ptr,
  // The fit after the drop is observed as the camera the model says.
  DropFitsNewLayout: (_real, model) => !(model.pressed === "none" && model.view === "home" && model.unfitted),
  DropStays: (real, model, L) => model.dropped === L + 1 || model.view !== "home"
    || model.pressed !== "none" || real.node === (model.dropped + model.cam) % L,
};
