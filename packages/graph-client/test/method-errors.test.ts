import { afterEach, describe, expect, it, vi } from "vitest";
import { GRAPH_CLIENT_METHODS, NodeObject, RelayerGraphClient, withGraphMethodErrors } from "../src/index.js";

const ENVIRONMENT = { RELAYER_GRAPH_URL: "http://127.0.0.1:1", RELAYER_GRAPH_TOKEN: "token", RELAYER_NODE_ID: "1" };

describe("guessed graph method names", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("fails at the call site with the real name and the method list", () => {
    const graph = RelayerGraphClient.fromEnv(ENVIRONMENT) as RelayerGraphClient & Record<string, unknown>;
    expect(() => graph.submitEdge).toThrow(/graph\.submitEdge is not a graph method\. Use await graph\.createEdge\(\.\.\.\) instead\./);
    expect(() => graph.addNode).toThrow(/Use await graph\.submitNode/);
    expect(() => graph.frobnicate).toThrow(/graph\.frobnicate is not a graph method\. Graph methods: getInteractionInput, .*, submit, getCompletionOutput\./);
  });

  it("lists only methods the client really has", () => {
    for (const name of GRAPH_CLIENT_METHODS) {
      expect(typeof (RelayerGraphClient.prototype as unknown as Record<string, unknown>)[name], name).toBe("function");
    }
  });

  it("keeps real methods, private state, properties and await working through the wrapper", async () => {
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
      const request = JSON.parse(String(init.body)) as Record<string, unknown>;
      return new Response(JSON.stringify({ node: { id: 10, kind: "concept", icon: "box", title: "Queue", detail: "Waiting", state: "draft", clientKey: request.clientKey } }), {
        status: 200, headers: { "content-type": "application/json" },
      });
    }));
    const graph = RelayerGraphClient.fromEnv(ENVIRONMENT);
    expect(graph).toBeInstanceOf(RelayerGraphClient);
    expect(graph.capability.nodeId).toBe(1);
    expect(typeof graph.visualAssets.scope).toBe("function");
    const node = new NodeObject("box", "Queue", "Waiting", "concept", "queue");
    // submitNode reads and writes #private fields; a naive Proxy would break that.
    const first = await graph.submitNode(node);
    const second = await graph.submitNode(node);
    expect(first.id).toBe(10);
    expect(second).toBe(first);
    // `await graph` probes .then; that must read as undefined, not throw.
    expect(await graph).toBe(graph);
  });

  it("is only applied by fromEnv, so direct construction is unchanged", () => {
    const direct = new RelayerGraphClient({ url: "http://127.0.0.1:1", token: "token", nodeId: 1 }) as RelayerGraphClient & Record<string, unknown>;
    expect(direct.submitEdge).toBeUndefined();
    const wrapped = withGraphMethodErrors(direct);
    expect(() => wrapped.submitEdge).toThrow(TypeError);
  });
});
