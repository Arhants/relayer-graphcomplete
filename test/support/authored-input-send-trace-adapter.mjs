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

// Another node's Node Detail whose input has the same mount ID.
const OTHER_DETAIL = compiledPackage({
  version: 1,
  components: [{ id: "form", order: 0, html: '<label>Other <textarea aria-label="Other answer" data-gc-mount="input"></textarea></label>', css: "" }],
  mounts: [{
    id: "input", componentId: "form", kind: "capability", host: "textarea",
    capability: { kind: "input", action: { clientKey: "other-input", sourceNode: { clientKey: "other" }, sourceLayer: { clientKey: "layer" } } },
  }],
  assets: [],
});

// The same input beside an image whose asset loads until the world lets it.
const SLOW_ASSET_DETAIL = compiledPackage({
  version: 1,
  components: [{ id: "form", order: 0, html: '<label>Answer <textarea aria-label="Your answer" data-gc-mount="input"></textarea></label><img alt="Illustration" data-asset-mount="picture">', css: "" }],
  mounts: [{
    id: "input", componentId: "form", kind: "capability", host: "textarea",
    capability: { kind: "input", action: { clientKey: "input-action", sourceNode: { clientKey: "question" }, sourceLayer: { clientKey: "layer" } } },
  }, { id: "picture", componentId: "form", kind: "asset", host: "img", assetId: "picture" }],
  assets: [{ id: "picture", digestSha256: "c".repeat(64), mediaType: "image/png", representation: "image" }],
});

export class AuthoredInputSendWorld {
  // contextDrafts: unconfirmed annotation drafts, which open the draft-send
  // warning on Send. authored: false shows the ordinary Node Details input,
  // committed by its ✓ button, instead of the authored detail.
  // slowAsset: the authored detail also shows an image whose asset loads
  // until loadAsset() is called. otherNode: node 8 shows another authored
  // input with the same mount ID.
  constructor({ contextDrafts = [], authored = true, slowAsset = false, otherNode = false } = {}) {
    this.authored = authored;
    this.assetGate = deferred();
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
    const node = {
      id: 7, clientKey: "question", kind: "question", icon: "box", title: "Question",
      ...(authored ? { authoredDetail: slowAsset ? SLOW_ASSET_DETAIL : AUTHORED_DETAIL } : {}),
    };
    const other = { id: 8, clientKey: "other", kind: "question", icon: "box", title: "Other", authoredDetail: OTHER_DETAIL };
    const nodes = otherNode ? [node, other] : [node];
    const actions = [
      { id: 13, clientKey: "input-action", sourceNodeId: 7, sourceLayerId: 10, sourceLayerClientKey: "layer", kind: "input", ...ACTION },
      ...(otherNode ? [{ id: 14, clientKey: "other-input", sourceNodeId: 8, sourceLayerId: 10, sourceLayerClientKey: "layer", kind: "input", control: "text", prompt: "Other answer" }] : []),
    ];
    const layer = {
      layer: { id: 99, clientKey: "layer", layout: { version: 1, placements: nodes.map((item, index) => ({ nodeId: item.id, x: 0.3 + 0.4 * index, y: 0.5 })) } },
      nodes, edges: [], actions,
    };
    this.thread = { id: THREAD, title: "Thread", harnessId: "fixture", projectId: null, permissionProfileId: null };
    this.state = {
      status: "accepted",
      currentInteractionId: 5,
      interactions: [{ id: 5, threadId: THREAD, sequence: 1, text: "Question", graphNodeId: 50, completionStatus: "accepted", completionOutput: { rootLayer: layer } }],
      visibleLayer: layer, nodes, edges: [], actions,
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
      contextDraftApi: { list: async () => ({ drafts: contextDrafts, confirmations: [] }) },
      resolveNodeDetailAsset: async (asset) => {
        await world.assetGate.promise;
        return { ...asset, url: `blob:http://127.0.0.1:3000/${asset.id}` };
      },
      inputDraftApi: {
        get: async () => world.#draft(),
        commit: (_threadId, occurrence, value, expectedRevision) => {
          world.put = { expected: expectedRevision, val: valueOf(value.text), response: deferred(), result: null };
          return world.put.response.promise;
        },
        detach: (world.detachRequests = vi.fn()),
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
    if (!this.authored) return this.window.document.querySelector("#nodeInputActions textarea");
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
        if (this.authored) this.input.dispatchEvent(new this.window.Event("change", { bubbles: true }));
        else this.window.document.querySelector('#nodeInputActions [data-input-control-role="commit"]').click();
        await until(() => this.put, "the commit request");
        break;
      }
      case "ClickSend": {
        const send = this.window.document.querySelector("#sendInteraction");
        if (send.disabled) throw new Error("ClickSend: Send is disabled");
        send.click();
        await settle();
        // With no commit to wait for, the Send has posted, or it stopped at
        // the click because an answer did not save.
        this.clicked = Boolean(this.put || this.post);
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
      case "CommitFails": {
        this.put.result = "failed";
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
        else if (put.result === "failed") put.response.reject(Object.assign(new Error("The input could not be saved."), { status: 503 }));
        else put.response.reject(Object.assign(new Error("This interaction-input draft changed."), {
          status: 409, code: "input_draft_revision_conflict",
        }));
        // Whether a Send still waits is read from the real Send button once
        // the renderer settles (below): a Send stopped by the failed commit
        // must release it, and one that posts anyway shows up as a POST.
        this.readSendAfterSettle = put.result !== "ok";
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
    if (this.readSendAfterSettle) {
      this.readSendAfterSettle = false;
      this.clicked = !this.post && this.window.document.querySelector("#sendInteraction").disabled;
    }
  }

  // A turn created elsewhere in the thread, such as by an authored invoke,
  // arrives and becomes the latest.
  async newerTurnArrives({ text = "Invoked", invoked = false } = {}) {
    const [first] = this.state.interactions;
    this.state.interactions = [...this.state.interactions, { ...first, id: 6, sequence: 2, text }];
    if (invoked) this.state.actionInvocations = [...this.state.actionInvocations, { id: 1, resultInteractionId: 6 }];
    this.state.currentInteractionId = 6;
    this.selection.currentInteractionId = 6;
    this.workspace.render();
    await settle();
  }

  async loadAsset() {
    this.assetGate.resolve();
    await settle();
  }

  // The persisted record of the thread's send whose turn has not loaded.
  sentRecord() {
    const state = JSON.parse(this.window.localStorage.getItem("relayerComposerDraftsV1") || "{}");
    return state.sentThreadFollowups?.[String(THREAD)] ?? null;
  }

  get promptText() {
    return this.window.document.querySelector("#threadPrompt").value;
  }

  async typePrompt(text) {
    const prompt = this.window.document.querySelector("#threadPrompt");
    prompt.value = text;
    prompt.dispatchEvent(new this.window.Event("input"));
    await settle();
  }

  async settled() {
    await settle();
  }

  async click(selector) {
    this.window.document.querySelector(selector).click();
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
      // The authored input is locked while its commit is busy or a Send is
      // in flight, so the reserved revision cannot race an edit.
      locked: Boolean(this.input?.disabled),
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
    locked: state.put.st !== "none" || state.send.st !== "idle",
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
