import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CompletionTerminalError, complete, configureCompletionRuntime, watchCompletions } from "../src/index.js";
import type {
  CompletionCurrentSnapshot,
  CompletionHandle,
  CompletionInputGraph,
  CompletionRuntime,
  ResolvedGraphLayer,
} from "../src/index.js";

const inputGraph: CompletionInputGraph = { interactionNode: 41 };
const layer: ResolvedGraphLayer = {
  layer: {
    id: 7,
    nodes: [8],
    edges: [],
    layout: { version: 1, placements: [{ nodeId: 8, x: 0.5, y: 0.5 }] },
    state: "accepted",
  },
  nodes: [{ id: 8, kind: "answer", icon: "info", title: "Answer", detail: "Done", state: "accepted" }],
  edges: [],
  actions: [],
};

function activeCurrent(revision: number): Record<string, unknown> {
  return {
    completionId: 41,
    lifecycle: "active",
    headRevision: revision,
    currentLayerId: 6,
    finalLayerId: null,
  };
}

function jsonResponse(value: unknown, status: number): Response {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
}

function proxyErrorPage(): Response {
  return new Response("<html><body>502 Bad Gateway: /private/runtime/provider-secret</body></html>", {
    status: 502,
    headers: { "content-type": "text/html" },
  });
}

/** Stubs the broker with a scripted sequence of result observations. */
function stubBroker(
  observations: readonly Response[],
  overrides: { readonly start?: Response; readonly stop?: (body: unknown) => Response } = {},
): string[] {
  vi.stubEnv("RELAYER_COMPLETE_URL", "http://127.0.0.1:43125/api/completions");
  vi.stubEnv("RELAYER_COMPLETE_TOKEN", "broker-token");
  const requests: string[] = [];
  const remaining = [...observations];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    requests.push(`${init?.method ?? "GET"} ${url}`);
    if (String(url).endsWith("/stop")) {
      const stop = overrides.stop ?? (() => new Response("{}", { status: 200 }));
      return stop(JSON.parse(String(init?.body ?? "null")));
    }
    if (init?.method === "POST") {
      return overrides.start ?? new Response(JSON.stringify({ completionId: 41 }), { status: 201 });
    }
    const next = remaining.shift();
    if (next === undefined) throw new Error(`unscripted broker request: ${url}`);
    return next;
  }));
  return requests;
}

describe("complete", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });
  it("returns the configured runtime handle immediately for the exact prepared pointer", async () => {
    let resolveResult!: (result: ResolvedGraphLayer) => void;
    const result = new Promise<ResolvedGraphLayer>((resolve) => { resolveResult = resolve; });
    const snapshot: CompletionCurrentSnapshot = {
      completionId: 41,
      lifecycle: "active",
      revision: 2,
      currentLayerId: 6,
      finalLayerId: null,
    };
    const handle: CompletionHandle = Object.freeze({
      completionId: 41,
      current: Object.freeze({ snapshot: vi.fn(async () => snapshot), next: vi.fn(async () => snapshot) }),
      result,
      stop: vi.fn(async () => {}),
    });
    const runtimeComplete = vi.fn(() => handle);
    const release = configureCompletionRuntime({ complete: runtimeComplete });
    try {
      const returned = complete(inputGraph);

      expect(returned).toBe(handle);
      expect(runtimeComplete).toHaveBeenCalledWith(inputGraph);
      await expect(returned.current.snapshot()).resolves.toBe(snapshot);
      resolveResult(layer);
      await expect(returned.result).resolves.toBe(layer);
    } finally {
      release();
    }
  });

  it("fails synchronously when no completion runtime owns the process binding", () => {
    expect(() => complete(inputGraph)).toThrow("completion runtime is not configured");
  });

  it("rejects competing runtime owners and releases the exact binding idempotently", () => {
    const handle = {
      completionId: 41,
      current: { snapshot: vi.fn(), next: vi.fn() },
      result: Promise.resolve(layer),
      stop: vi.fn(),
    } satisfies CompletionHandle;
    const first: CompletionRuntime = { complete: () => handle };
    const second: CompletionRuntime = { complete: () => handle };
    const release = configureCompletionRuntime(first);
    try {
      expect(() => configureCompletionRuntime(second)).toThrow("already configured");
    } finally {
      release();
      release();
    }
    const releaseSecond = configureCompletionRuntime(second);
    releaseSecond();
  });

  it("exposes stopped and failed terminal state without fabricating a result layer", async () => {
    const current: CompletionCurrentSnapshot = {
      completionId: 41,
      lifecycle: "stopped",
      revision: 3,
      currentLayerId: 6,
      finalLayerId: null,
      safeReason: "cancelled",
    };
    const terminal = new CompletionTerminalError(41, "stopped", current, "cancelled");
    const handle: CompletionHandle = {
      completionId: 41,
      current: { snapshot: async () => current, next: async () => current },
      result: Promise.reject(terminal),
      stop: async () => {},
    };
    const release = configureCompletionRuntime({ complete: () => handle });
    try {
      await expect(complete(inputGraph).result).rejects.toBe(terminal);
      expect(terminal).toMatchObject({ completionId: 41, lifecycle: "stopped", current, reason: "cancelled" });
    } finally {
      release();
    }
  });

  it("uses the execution-scoped broker while returning the prepared completion ID synchronously", async () => {
    vi.stubEnv("RELAYER_COMPLETE_URL", "http://127.0.0.1:43125/api/completions");
    vi.stubEnv("RELAYER_COMPLETE_TOKEN", "broker-token");
    const requests: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      requests.push(`${init?.method ?? "GET"} ${url}`);
      if (init?.method === "POST") {
        expect(JSON.parse(String(init.body))).toEqual({ interactionNode: 41 });
        return new Response(JSON.stringify({ completionId: 41 }), { status: 201 });
      }
      if (url.endsWith("/current")) {
        return new Response(JSON.stringify(activeCurrent(2)), { status: 200 });
      }
      return new Response(JSON.stringify(layer), { status: 200 });
    }));

    const handle = complete(inputGraph);

    expect(handle.completionId).toBe(41);
    await expect(handle.current.snapshot()).resolves.toMatchObject({
      completionId: 41,
      lifecycle: "active",
      revision: 2,
    });
    await expect(handle.result).resolves.toEqual(layer);
    expect(requests[0]).toBe("POST http://127.0.0.1:43125/api/completions");
  });

  it.each([
    [422, "The source interaction has no model selection to inherit."],
    // Exactly the longest detail the broker's message may have.
    [400, "x".repeat(200)],
  ])("preserves a safe broker error detail when child launch is rejected with HTTP %i", async (status, error) => {
    stubBroker([], { start: jsonResponse({ error }, status) });

    await expect(complete(inputGraph).result).rejects.toThrow(
      new Error(`Completion broker returned HTTP ${status}: ${error}`),
    );
  });

  it.each([
    ["a server failure", jsonResponse({ error: "/private/runtime/provider-secret" }, 500)],
    ["a server failure without a JSON body", proxyErrorPage()],
    ["a line break", jsonResponse({ error: "The child was refused.\nInjected: a second line" }, 400)],
    ["a DEL character", jsonResponse({ error: "The child was refused.\u007f" }, 400)],
    ["an overlong message", jsonResponse({ error: "x".repeat(201) }, 400)],
    // 101 characters but 202 UTF-16 code units, which is how both clients measure it.
    ["an overlong message of astral characters", jsonResponse({ error: "\u{1F6AB}".repeat(101) }, 400)],
  ])("does not expose broker detail from %s", async (_case, start) => {
    stubBroker([], { start });

    await expect(complete(inputGraph).result).rejects.toThrow(
      new Error(`Completion broker returned HTTP ${start.status}`),
    );
  });

  it.each([
    ["HTTP 400: completion does not belong to this execution",
      () => jsonResponse({ error: "completion does not belong to this execution" }, 400)],
    // A refusal whose error is not a string names only its status.
    ["HTTP 409", () => jsonResponse({ error: { code: "idempotency_conflict", message: "different digest" } }, 409)],
    // So does a refusal without a JSON body, such as a proxy's error page.
    ["HTTP 502", proxyErrorPage],
  ])("names a refused observation by its status and safe detail: %s", async (message, refusal) => {
    stubBroker([refusal(), refusal()]);
    const handle = complete(inputGraph);

    await expect(handle.result).rejects.toThrow(new Error(`Completion broker returned ${message}`));
    await expect(handle.current.next()).rejects.toThrow(new Error(`Completion broker returned ${message}`));
  });

  it("rejects the result with a terminal error only for a stopped or failed child", async () => {
    const terminal = (lifecycle: string, reason: unknown) => jsonResponse({
      current: { ...activeCurrent(2), lifecycle },
      reason,
    }, 409);
    stubBroker([
      terminal("failed", "execution"),
      terminal("failed", ""),
      terminal("stopped", 42),
      terminal("active", "execution"),
    ]);

    await expect(complete(inputGraph).result).rejects.toMatchObject({ lifecycle: "failed", reason: "execution" });
    await expect(complete(inputGraph).result).rejects.toMatchObject({ lifecycle: "failed", reason: "" });
    // A reason that is not a string is not repeated.
    const stopped = complete(inputGraph).result;
    await expect(stopped).rejects.toBeInstanceOf(CompletionTerminalError);
    await expect(stopped).rejects.toMatchObject({ completionId: 41, lifecycle: "stopped", reason: "completion_failed" });
    // A conflict whose current is still active is a broker refusal, not a terminal state.
    const active = complete(inputGraph).result;
    await expect(active).rejects.not.toBeInstanceOf(CompletionTerminalError);
    await expect(active).rejects.toThrow(new Error("Completion broker returned HTTP 409"));
  });

  it("accepts only the status the broker answers current and stop with", async () => {
    stubBroker([jsonResponse(activeCurrent(2), 201)], { stop: () => jsonResponse({ lifecycle: "stopped" }, 201) });
    const handle = complete(inputGraph);

    await expect(handle.current.snapshot()).rejects.toThrow(new Error("Completion broker returned HTTP 201"));
    await expect(handle.stop("done")).rejects.toThrow(new Error("Completion broker returned HTTP 201"));
  });

  it("carries the broker token across a redirect only within the broker's origin", async () => {
    const landed: { host: string | undefined; authorization: string | undefined }[] = [];
    const server = createServer((request, response) => {
      const port = (server.address() as AddressInfo).port;
      const redirect = { "/api/completions/41/current": "localhost", "/api/completions/40/current": "127.0.0.1" }[
        request.url ?? ""
      ];
      if (request.method === "POST") {
        let body = "";
        request.on("data", (chunk) => body += chunk).on("end", () => {
          const { interactionNode } = JSON.parse(body) as { interactionNode: number };
          response.writeHead(201, { "content-type": "application/json" })
            .end(JSON.stringify({ completionId: interactionNode }));
        });
      } else if (redirect !== undefined) {
        response.writeHead(307, { location: `http://${redirect}:${port}/api/completions/77/current` }).end();
      } else {
        landed.push({ host: request.headers.host, authorization: request.headers.authorization });
        response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(activeCurrent(2)));
      }
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const port = (server.address() as AddressInfo).port;
      vi.stubEnv("RELAYER_COMPLETE_URL", `http://127.0.0.1:${port}/api/completions`);
      vi.stubEnv("RELAYER_COMPLETE_TOKEN", "broker-token");

      await complete(inputGraph).current.snapshot();
      await complete({ interactionNode: 40 }).current.snapshot();

      expect(landed).toEqual([
        { host: `localhost:${port}`, authorization: undefined },
        { host: `127.0.0.1:${port}`, authorization: "Bearer broker-token" },
      ]);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it("observes nothing until the child result is actually awaited", async () => {
    const requests = stubBroker([new Response(JSON.stringify(layer), { status: 200 })]);

    const handle = complete(inputGraph);
    await Promise.resolve();

    expect(requests.filter((request) => request.includes("/result"))).toEqual([]);
    await expect(handle.result).resolves.toEqual(layer);
    expect(requests.filter((request) => request.includes("/result"))).toHaveLength(1);
  });

  it("carries each observed revision forward instead of polling on a timer", async () => {
    const requests = stubBroker([
      new Response(JSON.stringify({ current: activeCurrent(3) }), { status: 202 }),
      new Response(JSON.stringify({ current: activeCurrent(4) }), { status: 202 }),
      new Response(JSON.stringify(layer), { status: 200 }),
    ]);

    await expect(complete(inputGraph).result).resolves.toEqual(layer);

    expect(requests.filter((request) => request.includes("/result"))).toEqual([
      "GET http://127.0.0.1:43125/api/completions/41/result",
      "GET http://127.0.0.1:43125/api/completions/41/result?afterRevision=3",
      "GET http://127.0.0.1:43125/api/completions/41/result?afterRevision=4",
    ]);
  });

  it("awaits the same observation once however often the result is read", async () => {
    const requests = stubBroker([new Response(JSON.stringify(layer), { status: 200 })]);

    const handle = complete(inputGraph);
    await Promise.all([handle.result, handle.result, handle.result]);

    expect(requests.filter((request) => request.includes("/result"))).toHaveLength(1);
  });

  it("leaves an unawaited handle silent rather than raising an unhandled rejection", async () => {
    const requests = stubBroker([], { start: new Response("{}", { status: 500 }) });

    complete(inputGraph);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(requests).toEqual(["POST http://127.0.0.1:43125/api/completions"]);
  });

  it("stops the child it invoked through the execution-scoped broker", async () => {
    const bodies: unknown[] = [];
    const requests = stubBroker([], {
      stop: (body) => {
        bodies.push(body);
        return new Response(JSON.stringify({ cancelled: true, lifecycle: "stopped" }), { status: 200 });
      },
    });

    await complete(inputGraph).stop("the parent no longer needs this branch");

    expect(requests).toEqual([
      "POST http://127.0.0.1:43125/api/completions",
      "POST http://127.0.0.1:43125/api/completions/41/stop",
    ]);
    expect(bodies).toEqual([{ reason: "the parent no longer needs this branch" }]);
  });

  it("rejects a stop that the broker refuses", async () => {
    stubBroker([], { stop: () => new Response("{}", { status: 400 }) });

    await expect(complete(inputGraph).stop("no longer needed")).rejects.toThrow("HTTP 400");
  });

  it("rejects malformed broker current snapshots instead of coercing identity fields", async () => {
    vi.stubEnv("RELAYER_COMPLETE_URL", "http://127.0.0.1:43125/api/completions");
    vi.stubEnv("RELAYER_COMPLETE_TOKEN", "broker-token");
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        return new Response(JSON.stringify({ completionId: 41 }), { status: 201 });
      }
      if (String(_url).endsWith("/current")) {
        return new Response(JSON.stringify({
          completionId: 41,
          lifecycle: "active",
          headRevision: "2",
          currentLayerId: 6,
          finalLayerId: null,
        }), { status: 200 });
      }
      return new Response(JSON.stringify(layer), { status: 200 });
    }));

    const handle = complete(inputGraph);
    await expect(handle.current.snapshot()).rejects.toThrow("invalid current snapshot");
    await expect(handle.result).resolves.toEqual(layer);
  });

  it("waits for a child's current to move past the revision the parent saw", async () => {
    const failed = { ...activeCurrent(6), lifecycle: "failed", safeReason: "execution" };
    const requests = stubBroker([
      new Response(JSON.stringify({ current: activeCurrent(3) }), { status: 202 }),
      // The broker's hold elapsed with nothing new, so the wait asks again.
      new Response(JSON.stringify({ current: activeCurrent(3) }), { status: 202 }),
      new Response(JSON.stringify({ current: activeCurrent(4) }), { status: 202 }),
      new Response(JSON.stringify({ current: failed }), { status: 409 }),
    ]);
    const handle = complete(inputGraph);

    await expect(handle.current.next()).resolves.toMatchObject({ revision: 3, lifecycle: "active" });
    await expect(handle.current.next(3)).resolves.toMatchObject({ revision: 4, lifecycle: "active" });
    await expect(handle.current.next(4)).resolves.toMatchObject({ revision: 6, lifecycle: "failed" });
    expect(requests.filter((request) => request.includes("/result"))).toEqual([
      "GET http://127.0.0.1:43125/api/completions/41/result",
      "GET http://127.0.0.1:43125/api/completions/41/result?afterRevision=3",
      "GET http://127.0.0.1:43125/api/completions/41/result?afterRevision=3",
      "GET http://127.0.0.1:43125/api/completions/41/result?afterRevision=4",
    ]);
  });

  it("reads the final current of a child that succeeded while the parent waited", async () => {
    const succeeded = { ...activeCurrent(5), lifecycle: "succeeded", currentLayerId: 7, finalLayerId: 7 };
    stubBroker([
      new Response(JSON.stringify(layer), { status: 200 }),
      new Response(JSON.stringify(succeeded), { status: 200 }),
    ]);

    await expect(complete(inputGraph).current.next(4))
      .resolves.toMatchObject({ revision: 5, lifecycle: "succeeded", finalLayerId: 7 });
  });

  it("reports each child's change as its own event and settles when every child ends", async () => {
    const { snapshot, releases, asked, child } = heldChildren();
    const watch = watchCompletions([child(1), child(2)]);

    const first = watch.changes();
    await Promise.resolve();
    releases.get("1:-")!(snapshot(1, 0));
    expect((await first).map(({ current }) => `${current?.completionId}@${current?.revision}`)).toEqual(["1@0"]);

    // Child 2's first request is still open; it is not asked again.
    const second = watch.changes();
    await Promise.resolve();
    releases.get("2:-")!(snapshot(2, 0));
    releases.get("1:0")!(snapshot(1, 1));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect((await second).map(({ current }) => `${current?.completionId}@${current?.revision}`).sort())
      .toEqual(["1@1", "2@0"]);

    const third = watch.changes();
    await Promise.resolve();
    releases.get("1:1")!(snapshot(1, 2, "succeeded"));
    releases.get("2:0")!(snapshot(2, 1, "failed"));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect((await third).map(({ current }) => current?.lifecycle).sort()).toEqual(["failed", "succeeded"]);
    expect(watch.settled).toBe(true);
    await expect(watch.changes()).resolves.toEqual([]);
    expect(asked).toEqual(["1:-", "2:-", "1:0", "1:1", "2:0"]);
  });

  it("returns each event to only one of two overlapping changes() calls", async () => {
    const { snapshot, releases, asked, child } = heldChildren();
    const watch = watchCompletions([child(1), child(2)]);

    const first = watch.changes();
    const second = watch.changes();
    await Promise.resolve();
    releases.get("1:-")!(snapshot(1, 0));
    expect((await first).map(({ current }) => `${current?.completionId}@${current?.revision}`)).toEqual(["1@0"]);

    // The second call starts after the first returns, so it waits for the next event.
    await new Promise((resolve) => setTimeout(resolve, 0));
    releases.get("2:-")!(snapshot(2, 0));
    expect((await second).map(({ current }) => `${current?.completionId}@${current?.revision}`)).toEqual(["2@0"]);
    expect(asked).toEqual(["1:-", "2:-", "1:0"]);
  });

  it("reports a child it can no longer observe once, and keeps reporting its sibling until settled", async () => {
    const { snapshot, releases, refusals, asked, child } = heldChildren();
    const watch = watchCompletions([child(1), child(2)]);

    const first = watch.changes();
    await Promise.resolve();
    releases.get("1:-")!(snapshot(1, 0));
    await first;

    // Child 1's observation fails while child 2 moves; both reach the parent together.
    const second = watch.changes();
    await Promise.resolve();
    refusals.get("1:0")!(new Error("Completion broker returned HTTP 500"));
    releases.get("2:-")!(snapshot(2, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
    const reported = await second;
    expect(reported.map((change) => (
      `${change.child.completionId}:${change.error?.message ?? change.current?.revision}`
    )).sort()).toEqual(["1:Completion broker returned HTTP 500", "2:0"]);
    expect(watch.settled).toBe(false);

    // Child 1 is not asked again; child 2's later events still arrive and settle the watch.
    const third = watch.changes();
    await Promise.resolve();
    releases.get("2:0")!(snapshot(2, 1, "succeeded"));
    expect((await third).map(({ current }) => `${current?.completionId}@${current?.revision}`)).toEqual(["2@1"]);
    expect(watch.settled).toBe(true);
    await expect(watch.changes()).resolves.toEqual([]);
    expect(asked).toEqual(["1:-", "2:-", "1:0", "2:0"]);
  });

  it("reports a child whose next() throws or rejects with a non-Error value, without rejecting", async () => {
    const { snapshot, releases, refusals, child } = heldChildren();
    const throwing: CompletionHandle = {
      ...child(3),
      current: { snapshot: async () => snapshot(3, 0), next: () => { throw new Error("next is unavailable"); } },
    };
    const watch = watchCompletions([child(1), child(2), throwing]);

    const first = watch.changes();
    await Promise.resolve();
    refusals.get("1:-")!(Object.create(null) as Error);
    releases.get("2:-")!(snapshot(2, 0, "succeeded"));
    await new Promise((resolve) => setTimeout(resolve, 0));
    const reported = await first;
    expect(reported.map((change) => (
      `${change.child.completionId}:${change.error?.message ?? change.current?.lifecycle}`
    )).sort()).toEqual(["1:Completion observation failed", "2:succeeded", "3:next is unavailable"]);
    expect(watch.settled).toBe(true);
  });

  it("reports a child whose start the broker refuses with the broker's safe detail", async () => {
    stubBroker([], {
      start: new Response(JSON.stringify({ error: "The harness configuration changed while this child was launching." }), {
        status: 409,
        headers: { "content-type": "application/json" },
      }),
    });
    const { snapshot, releases, child } = heldChildren();
    const refused = complete(inputGraph);
    const watch = watchCompletions([refused, child(2)]);

    const reported = await watch.changes();
    expect(reported).toHaveLength(1);
    const change = reported[0]!;
    expect(change.child).toBe(refused);
    expect(change.current).toBeUndefined();
    expect(change.error?.message).toBe(
      "Completion broker returned HTTP 409: The harness configuration changed while this child was launching.",
    );

    const next = watch.changes();
    await Promise.resolve();
    releases.get("2:-")!(snapshot(2, 0, "failed"));
    expect((await next).map(({ current }) => current?.lifecycle)).toEqual(["failed"]);
    expect(watch.settled).toBe(true);
  });
});

/** Children whose next() calls stay open until the test releases or refuses them by `completionId:afterRevision`. */
function heldChildren() {
  const snapshot = (completionId: number, revision: number, lifecycle = "active"): CompletionCurrentSnapshot => ({
    completionId, revision, lifecycle: lifecycle as CompletionCurrentSnapshot["lifecycle"],
    currentLayerId: revision, finalLayerId: lifecycle === "succeeded" ? revision : null,
  });
  const releases = new Map<string, (current: CompletionCurrentSnapshot) => void>();
  const refusals = new Map<string, (error: Error) => void>();
  const asked: string[] = [];
  const child = (completionId: number): CompletionHandle => ({
    completionId,
    current: {
      snapshot: async () => snapshot(completionId, 0),
      next: (afterRevision?: number) => {
        const key = `${completionId}:${afterRevision ?? "-"}`;
        asked.push(key);
        return new Promise((resolve, reject) => {
          releases.set(key, resolve);
          refusals.set(key, reject);
        });
      },
    },
    result: Promise.resolve(layer),
    stop: async () => {},
  });
  return { snapshot, releases, refusals, asked, child };
}
