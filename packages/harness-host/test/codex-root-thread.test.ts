import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { describe, expect, it, vi } from "vitest";
import { createNoopHarnessTraceSink } from "../src/trace.js";
import {
  runCodexAppServerTurn,
  type CodexAppServerSpawn,
} from "../src/implementations/codex-app-server.js";
import { CodexBasicHarness } from "../src/implementations/codex-basic.js";
import type { HarnessConfiguration, HarnessRunContext, HarnessSessionState } from "../src/types.js";

// The persistent root thread across root turns, through the real app-server transport.
// The emulated app-server keeps Codex 0.147.0's rollout rules: a thread has a rollout only
// in the CODEX_HOME whose turn/start ran on it, and thread/resume without one fails with
// "no rollout found for thread id ...". Each provider definition has its own CODEX_HOME.

const configuration: HarnessConfiguration = {
  schemaVersion: 1,
  name: "codex-basic",
  implementation: "codex.basic",
  implementationVersion: 1,
  permissionBindings: { full: { sandboxMode: "danger-full-access", approvalPolicy: "never" } },
  settings: { model: "gpt-test", modelReasoningEffort: "medium", webSearchMode: "disabled", skipGitRepoCheck: true },
};

describe("Codex persistent root thread", () => {
  it("starts a fresh root thread when a follow-up selects another Codex provider", async () => {
    const codex = new EmulatedCodex();
    const harness = codex.harness();

    await harness.complete(rootTurn(1, "provider-a"));
    await harness.complete(rootTurn(2, "provider-b"));
    await harness.complete(rootTurn(3, "provider-b"));
    await harness.complete(rootTurn(4, "provider-a"));

    expect(codex.threadRequests).toEqual([
      "provider-a thread/start -> thread-1",
      // Provider A's thread has no rollout in provider B's home: it is not resumed there.
      "provider-b thread/start -> thread-2",
      "provider-b thread/resume thread-2",
      "provider-a thread/start -> thread-3",
    ]);
    expect(harness.state()).toEqual(pinned("thread-3", "provider-a"));
  });

  it("does not pin a root thread whose turn was stopped before turn/start", async () => {
    const codex = new EmulatedCodex();
    const stop = new AbortController();
    const harness = codex.harness({
      // The user's Stop lands after thread/start answered and before turn/start is sent.
      afterThreadIdentity: (resumed) => { if (!resumed) stop.abort(new Error("Stopped by user")); },
    });

    await expect(harness.complete(rootTurn(1, "provider-a"), stop.signal)).rejects.toThrow("Stopped by user");
    expect(harness.state()).toEqual({});
    await harness.complete(rootTurn(2, "provider-a"));

    // thread-1 has no rollout, so the next root turn never tries to resume it.
    expect(codex.threadRequests).toEqual([
      "provider-a thread/start -> thread-1",
      "provider-a thread/start -> thread-2",
    ]);
    expect(harness.state()).toEqual(pinned("thread-2", "provider-a"));
  });

  it("starts fresh in the same turn when the saved root thread has no rollout", async () => {
    const codex = new EmulatedCodex();
    // Saved by an earlier release: no provider definition, and the thread was never materialized.
    const harness = codex.harness({ savedState: { codexThreadId: "lost-thread", codexThreadPersonalPresentationVersionId: null } });

    await harness.complete(rootTurn(1, "provider-a"));
    await harness.complete(rootTurn(2, "provider-a"));

    expect(codex.threadRequests).toEqual([
      "provider-a thread/resume lost-thread (no rollout)",
      "provider-a thread/start -> thread-1",
      "provider-a thread/resume thread-1",
    ]);
    expect(harness.state()).toEqual(pinned("thread-1", "provider-a"));
  });

  it("keeps resuming a saved root thread from an earlier release and binds it to its provider", async () => {
    const codex = new EmulatedCodex();
    codex.rollouts.set("legacy-thread", "provider-a");
    const harness = codex.harness({ savedState: { codexThreadId: "legacy-thread", codexThreadPersonalPresentationVersionId: null } });

    expect(harness.state()).toEqual({ codexThreadId: "legacy-thread", codexThreadPersonalPresentationVersionId: null });
    await harness.complete(rootTurn(1, "provider-a"));

    expect(codex.threadRequests).toEqual(["provider-a thread/resume legacy-thread"]);
    expect(harness.state()).toEqual(pinned("legacy-thread", "provider-a"));
  });

  it("forgets the root thread when the harness is force-shut down during a root turn", async () => {
    const codex = new EmulatedCodex();
    const harness = codex.harness();
    await harness.complete(rootTurn(1, "provider-a"));
    codex.hangTurns = true;

    // An invoked child running at force shutdown leaves the root thread alone.
    const child = harness.complete({ ...rootTurn(2, "provider-a"), origin: { kind: "invoke", sourceCompletionId: 1, actionId: 7 } });
    await vi.waitFor(() => expect(codex.turnStarts).toBe(2));
    harness.forceShutdown();
    await expect(child).rejects.toThrow("force-closed");
    expect(harness.state()).toMatchObject({ codexThreadId: "thread-1" });

    // A root turn running at force shutdown was killed mid-conversation: its thread is forgotten.
    const root = harness.complete(rootTurn(3, "provider-a"));
    await vi.waitFor(() => expect(codex.turnStarts).toBe(3));
    harness.forceShutdown();
    await expect(root).rejects.toThrow("force-closed");
    expect(harness.state()).toEqual({});
  });
});

function pinned(threadId: string, providerId: string): HarnessSessionState {
  return {
    codexThreadId: threadId,
    codexThreadPersonalPresentationVersionId: null,
    codexThreadProviderDefinitionId: providerId,
  };
}

function rootTurn(id: number, providerId: string): HarnessRunContext {
  const inputGraph = { id, kind: "user-interaction", icon: "user", title: "Q", detail: "Q", state: "accepted" as const };
  return {
    origin: { kind: "root" },
    inputGraph,
    interactionInput: { interaction: inputGraph, contexts: [] },
    graph: { interactionNodeId: id, acquireCapability: () => ({ url: "http://127.0.0.1:1", token: `token-${id}`, nodeId: id }) },
    trace: createNoopHarnessTraceSink(),
    approvals: { request: async () => { throw new Error("unused approval channel"); } },
    model: { providerId, adapterId: "openai-api", modelId: "gpt-5.2" },
    access: {
      kind: "secret",
      contract: "secret@1",
      providerId,
      adapterId: "openai-api",
      adapterImplementationVersion: "1",
      endpoint: "https://api.openai.test/v1",
      fields: { "api-key": `key-${providerId}` },
      // The provider definition's own CODEX_HOME (provider-adapter-registry.mjs).
      runtime: { runtimeId: "codex", version: "0.147.0", executable: process.execPath, environment: { CODEX_HOME: providerId } },
    },
  };
}

/** Codex app-server processes sharing on-disk rollouts, keyed by CODEX_HOME. */
class EmulatedCodex {
  readonly rollouts = new Map<string, string>();
  readonly threadRequests: string[] = [];
  turnStarts = 0;
  hangTurns = false;
  private nextThread = 0;
  private nextTurn = 0;

  harness(options: {
    readonly savedState?: HarnessSessionState;
    readonly afterThreadIdentity?: (resumed: boolean) => void;
  } = {}): CodexBasicHarness {
    return new CodexBasicHarness({
      threadId: 1,
      permissionProfileId: "full",
      permissionBinding: configuration.permissionBindings.full!,
      workingDirectory: process.cwd(),
      configuration,
      ...(options.savedState === undefined ? {} : { savedState: options.savedState }),
    }, {
      writeCodexApiKeyAuthFile: async () => undefined,
      removeCodexApiKeyAuthFile: async () => undefined,
      runAppServerTurn: (turn) => runCodexAppServerTurn({
        ...turn,
        spawnProcess: this.spawn,
        shutdownGraceMs: 5,
        onThreadId: async (threadId) => {
          await turn.onThreadId(threadId);
          options.afterThreadIdentity?.(turn.savedThreadId === threadId);
        },
      }),
    });
  }

  private readonly spawn: CodexAppServerSpawn = (_command, _args, spawnOptions) => {
    const home = spawnOptions.env?.CODEX_HOME;
    if (home === undefined) throw new Error("the emulated app-server needs CODEX_HOME");
    return new EmulatedAppServer((message, server) => this.handle(home, message, server)) as unknown as ChildProcessWithoutNullStreams;
  };

  private handle(home: string, message: Record<string, any>, server: EmulatedAppServer): void {
    const { id, method, params } = message;
    if (method === "initialize") server.respond(id, {});
    if (method === "thread/start") {
      const threadId = `thread-${++this.nextThread}`;
      this.threadRequests.push(`${home} thread/start -> ${threadId}`);
      server.respond(id, { thread: { id: threadId } });
    }
    if (method === "thread/resume") {
      if (this.rollouts.get(params.threadId) !== home) {
        this.threadRequests.push(`${home} thread/resume ${params.threadId} (no rollout)`);
        server.fail(id, `no rollout found for thread id ${params.threadId}`);
        return;
      }
      this.threadRequests.push(`${home} thread/resume ${params.threadId}`);
      server.respond(id, { thread: { id: params.threadId } });
    }
    if (method === "turn/start") {
      this.turnStarts += 1;
      // turn/start materializes the rollout in this home.
      if (!this.rollouts.has(params.threadId)) this.rollouts.set(params.threadId, home);
      const turnId = `turn-${++this.nextTurn}`;
      server.respond(id, { turn: { id: turnId, status: "inProgress" } });
      if (!this.hangTurns) {
        setImmediate(() => server.notify("turn/completed", {
          threadId: params.threadId,
          turn: { id: turnId, status: "completed", error: null },
        }));
      }
    }
  }
}

class EmulatedAppServer extends EventEmitter {
  readonly stdin = new PassThrough();
  readonly stdout = new PassThrough();
  readonly stderr = new PassThrough();
  // No process id: termination goes through kill() below, never a real process group.
  readonly pid = undefined;
  exitCode: number | null = null;
  signalCode: NodeJS.Signals | null = null;
  private buffer = "";

  constructor(onMessage: (message: Record<string, any>, server: EmulatedAppServer) => void) {
    super();
    this.stdin.on("data", (chunk) => {
      this.buffer += chunk.toString();
      for (let newline = this.buffer.indexOf("\n"); newline >= 0; newline = this.buffer.indexOf("\n")) {
        const line = this.buffer.slice(0, newline);
        this.buffer = this.buffer.slice(newline + 1);
        onMessage(JSON.parse(line) as Record<string, any>, this);
      }
    });
    setImmediate(() => this.emit("spawn"));
  }

  respond(id: unknown, result: unknown): void {
    queueMicrotask(() => this.stdout.write(`${JSON.stringify({ id, result })}\n`));
  }

  fail(id: unknown, message: string): void {
    queueMicrotask(() => this.stdout.write(`${JSON.stringify({ id, error: { code: -32600, message } })}\n`));
  }

  notify(method: string, params: unknown): void {
    if (this.exitCode === null && this.signalCode === null) this.stdout.write(`${JSON.stringify({ method, params })}\n`);
  }

  kill(signal: NodeJS.Signals = "SIGTERM"): boolean {
    if (this.exitCode !== null || this.signalCode !== null) return true;
    this.signalCode = signal;
    this.emit("exit", null, signal);
    return true;
  }
}
