// Replays AuthoredInputSend.tla scenario traces against the real Product
// workspace in happy-dom: an authored Node Detail with an input action, the
// real node input draft controller, and the real follow-up Send path.
//
// The app server is a fake that applies the SQLite rules the spec cites:
// a commit succeeds only at the current draft revision
// (storage/sqlite/input_drafts.rs:21-104), and a Send reserves the committed
// attachments at its expected revision, advancing it only when there are
// attachments (storage/sqlite/interaction_contexts.rs:166-324). Each request
// is held on a deferred: Serve* applies it to the fake server, and *Returns
// delivers the response, so the renderer's requests race as the spec says.
//
// What the replay checks on the real renderer is what the renderer decides:
// whether Send is enabled while a commit is in flight, and which draft
// revision and value each request carries. observe() reads those from the
// requests, the fake server state, and the authored input's DOM value.

import { createHash } from "node:crypto";
import { Window } from "happy-dom";
import { vi } from "vitest";

import { createProductWorkspace } from "../../desktop/renderer/src/product-workspace/workspace.js";

const THREAD = 3;
const OCCURRENCE = Object.freeze({ presentingInteractionNodeId: 50, presentingLayerId: 99, actionId: 13 });
const ACTION = Object.freeze({ control: "text", prompt: "Your answer" });
const answer = (value) => (value === 0 ? "" : `answer ${value}`);
const valueOf = (text) => (text === "" ? 0 : Number(/^answer (\d+)$/.exec(text)?.[1] ?? Number.NaN));

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function settle() {
  for (let turn = 0; turn < 40; turn += 1) await new Promise((resolve) => setImmediate(resolve));
}

async function until(condition, what) {
  for (let turn = 0; turn < 2000; turn += 1) {
    if (condition()) return;
    await new Promise((resolve) => setImmediate(resolve));
  }
  throw new Error(`Timed out waiting for ${what}`);
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function compiledPackage(content) {
  return { ...content, integritySha256: createHash("sha256").update(canonicalJson(content)).digest("hex") };
}

const AUTHORED_DETAIL = compiledPackage({
  version: 1,
  components: [{ id: "form", order: 0, html: '<label>Answer <textarea aria-label="Your answer" data-gc-mount="input"></textarea></label>', css: "" }],
  mounts: [{
    id: "input", componentId: "form", kind: "capability", host: "textarea",
    capability: { kind: "input", action: { clientKey: "input-action", sourceNode: { clientKey: "question" }, sourceLayer: { clientKey: "layer" } } },
  }],
  assets: [],
});

export class AuthoredInputSendWorld {
  constructor() {
    this.window = new Window({ url: "http://127.0.0.1:3000" });
    vi.stubGlobal("document", this.window.document);
    vi.stubGlobal("window", this.window);
    vi.stubGlobal("localStorage", this.window.localStorage);
    vi.stubGlobal("lucide", new Proxy({
      createElement: () => this.window.document.createElement("svg"),
    }, { get: (target, key) => target[key] ?? {} }));
    this.window.localStorage.clear();
    this.window.document.body.innerHTML = '<section id="threadView"></section><div id="toast" class="hidden"></div>';
    this.server = { rev: 1, val: 0, other: false, active: false };
    this.put = null;
    this.post = null;
    this.sentWith = 0;
    this.clicked = false;
    this.refused = false;
    const node = { id: 7, clientKey: "question", kind: "question", icon: "box", title: "Question", authoredDetail: AUTHORED_DETAIL };
    const actions = [{ id: 13, clientKey: "input-action", sourceNodeId: 7, sourceLayerId: 10, sourceLayerClientKey: "layer", kind: "input", ...ACTION }];
    const layer = {
      layer: { id: 99, clientKey: "layer", layout: { version: 1, placements: [{ nodeId: 7, x: 0.5, y: 0.5 }] } },
      nodes: [node], edges: [], actions,
    };
    this.thread = { id: THREAD, title: "Thread", harnessId: "fixture", projectId: null, permissionProfileId: null };
    this.state = {
      status: "accepted",
      currentInteractionId: 5,
      interactions: [{ id: 5, threadId: THREAD, sequence: 1, text: "Question", graphNodeId: 50, completionStatus: "accepted", completionOutput: { rootLayer: layer } }],
      visibleLayer: layer, nodes: [node], edges: [], actions,
      projects: [], permissionProfiles: [],
      modelSettings: { defaults: { harnessId: "fixture" }, harnesses: [{ id: "fixture", label: "Fixture", available: true }], providers: [], families: [] },
      modelCatalog: [], actionInvocations: [], pendingActionInvocations: [],
    };
    this.selection = { currentThreadId: THREAD, currentInteractionId: 5, selectedNodeId: null, layerPath: [] };
    const world = this;
    this.workspace = createProductWorkspace({
      root: this.window.document,
      getState: () => this.state,
      getThread: () => this.thread,
      selection: this.selection,
      showThread: () => {},
      showEmpty: () => {},
      contextDraftApi: { list: async () => ({ drafts: [], confirmations: [] }) },
      inputDraftApi: {
        get: async () => world.#draft(),
        commit: (_threadId, occurrence, value, expectedRevision) => {
          world.put = { expected: expectedRevision, val: valueOf(value.text), response: deferred(), result: null };
          return world.put.response.promise;
        },
        detach: vi.fn(),
      },
      onSubmitInteraction: (_text, _model, _contexts, _confirmationIds, _identityRevision, inputDraftRevision) => {
        world.post = { expected: inputDraftRevision, response: deferred(), result: null, reserved: 0 };
        return world.post.response.promise;
      },
    });
    this.workspace.render();
  }

  #draft() {
    return {
      threadId: THREAD,
      revision: this.server.rev,
      attachments: this.server.val === 0 ? [] : [{
        occurrence: OCCURRENCE, sourceNodeId: 7, action: ACTION,
        value: { text: answer(this.server.val) }, draftRevision: this.server.rev,
        committedAt: "2026-09-27T00:00:00Z",
      }],
      updatedAt: "2026-09-27T00:00:00Z",
    };
  }

  get input() {
    return this.window.document.querySelector("#detailContent [data-node-detail-runtime]")
      ?.shadowRoot?.querySelector("[data-gc-mount='input']");
  }

  // The composer holds text, and the question node is open with its input.
  async ready() {
    await settle();
    const prompt = this.window.document.querySelector("#threadPrompt");
    prompt.value = "Here is my answer";
    prompt.dispatchEvent(new this.window.Event("input"));
    this.window.document.querySelector('[data-node="7"]').click();
    await until(() => this.input && !this.input.disabled, "the authored input");
    await settle();
    return this;
  }

  async apply([name, arg]) {
    switch (name) {
      case "Type": {
        if (this.input.disabled) throw new Error("Type: the authored input is disabled");
        this.input.value = answer(arg);
        this.input.dispatchEvent(new this.window.Event("input", { bubbles: true }));
        break;
      }
      case "Commit": {
        this.input.dispatchEvent(new this.window.Event("change", { bubbles: true }));
        await until(() => this.put, "the commit request");
        break;
      }
      case "ClickSend": {
        const send = this.window.document.querySelector("#sendInteraction");
        if (send.disabled) throw new Error("ClickSend: Send is disabled");
        send.click();
        this.clicked = true;
        break;
      }
      case "ServeCommit": {
        const { put, server } = this;
        const replay = server.val === put.val && put.expected + 1 === server.rev;
        if (replay) put.result = "ok";
        else if (put.expected === server.rev) {
          server.val = put.val;
          server.rev += 1;
          put.result = "ok";
        } else put.result = "conflict";
        put.draft = this.#draft();
        break;
      }
      case "ServeSend": {
        const { post, server } = this;
        if (server.active) post.result = "in_progress";
        else if (post.expected !== server.rev) post.result = "conflict";
        else {
          const inputs = server.val !== 0 || server.other;
          post.reserved = server.val;
          server.val = 0;
          server.other = false;
          if (inputs) server.rev += 1;
          server.active = true;
          post.result = "ok";
        }
        break;
      }
      case "CommitReturns": {
        const { put } = this;
        this.put = null;
        if (put.result === "ok") put.response.resolve(put.draft);
        else put.response.reject(Object.assign(new Error("This interaction-input draft changed."), {
          status: 409, code: "input_draft_revision_conflict",
        }));
        break;
      }
      case "SendReturns": {
        const { post } = this;
        this.post = null;
        this.clicked = false;
        if (post.result === "ok") {
          this.sentWith = post.reserved;
          post.response.resolve({ id: 6 });
        } else {
          this.refused = post.result === "conflict";
          post.response.reject(Object.assign(new Error("The committed interaction inputs changed before Send."), {
            status: 409, code: "input_draft_revision_conflict",
          }));
        }
        break;
      }
      default:
        throw new Error(`Unreplayed AuthoredInputSend action ${name}`);
    }
    await settle();
  }

  // The refinement mapping onto the spec's observable variables.
  observe() {
    const put = this.put
      ? { st: this.put.result ? "answered" : "inflight", expected: this.put.expected, val: this.put.val }
      : { st: "none", expected: 0, val: 0 };
    // A clicked Send that has not posted yet is waiting on the commit.
    const send = this.post
      ? { st: this.post.result ? "answered" : "inflight", expected: this.post.expected }
      : { st: this.clicked ? "waiting" : "idle", expected: 0 };
    return {
      srvRev: this.server.rev,
      srvVal: this.server.val,
      srvOther: this.server.other,
      active: this.server.active,
      field: valueOf(this.input?.value ?? ""),
      put,
      send,
    };
  }

  dispose() {
    this.workspace.dispose();
    vi.unstubAllGlobals();
  }
}

export function projectModelState(state) {
  return {
    srvRev: state.srvRev,
    srvVal: state.srvVal,
    srvOther: state.srvOther,
    active: state.active,
    field: state.field,
    put: { st: state.put.st, expected: state.put.expected, val: state.put.val },
    send: { st: state.send.st, expected: state.send.expected },
  };
}

// Promises over the requests the real renderer made and the trace's ghosts
// (the answer entered at the click, and whether a commit was in flight).
export const PROMISES = {
  SendCarriesEnteredAnswer: (world, model) => model.outcome !== "sent" || model.intended === 0
    || world.sentWith === model.intended,
  SendNotRefusedByOwnAnswer: (world, model) => !(world.refused && model.raced),
};
