import {
  CompletionTerminalError,
  type CompletionChange,
  type CompletionCurrentSnapshot,
  type CompletionHandle,
  type CompletionInputGraph,
  type CompletionRuntime,
  type CompletionWatch,
  type ResolvedGraphLayer,
} from "./contracts.js";

let configuredRuntime: CompletionRuntime | undefined;

/** Bind the process-local runtime behind canonical Complete. */
export function configureCompletionRuntime(runtime: CompletionRuntime): () => void {
  if (configuredRuntime !== undefined) {
    throw new Error("GraphComplete completion runtime is already configured");
  }
  configuredRuntime = runtime;
  let active = true;
  return () => {
    if (!active) return;
    active = false;
    if (configuredRuntime === runtime) configuredRuntime = undefined;
  };
}

/** Canonical external boundary for one already-prepared interaction pointer. */
export function complete(inputGraph: CompletionInputGraph): CompletionHandle {
  if (!Number.isSafeInteger(inputGraph.interactionNode) || inputGraph.interactionNode < 1) {
    throw new Error("complete() requires an already-prepared interactionNode");
  }
  return (configuredRuntime ?? completionRuntimeFromEnvironment()).complete(inputGraph);
}

function completionRuntimeFromEnvironment(environment: NodeJS.ProcessEnv = process.env): CompletionRuntime {
  const url = environment.RELAYER_COMPLETE_URL?.replace(/\/$/u, "");
  const token = environment.RELAYER_COMPLETE_TOKEN;
  if (!url || !token) throw new Error("GraphComplete completion runtime is not configured");
  return Object.freeze({
    complete(inputGraph: CompletionInputGraph): CompletionHandle {
      const completionId = inputGraph.interactionNode;
      const started = brokerRequest(url, token, "", {
        method: "POST",
        body: JSON.stringify({ interactionNode: completionId }),
      }).then(async (response) => {
        if (response.status !== 200 && response.status !== 201) throw await brokerRefusal(response);
        return response.json() as Promise<{ completionId: number }>;
      }).then((response) => {
        if (response.completionId !== completionId) {
          throw new Error("Completion broker returned a different completion identity");
        }
      });
      // Nothing awaits a fire-and-forget child, so its start failure must not surface
      // as an unhandled rejection. Every reader of the handle still observes it.
      started.catch(() => {});
      const snapshot = async (): Promise<CompletionCurrentSnapshot> => {
        await started;
        const response = await brokerRequest(url, token, `/${completionId}/current`);
        if (response.status !== 200) throw await brokerRefusal(response);
        return normalizeCurrent(await response.json());
      };
      let observation: Promise<ResolvedGraphLayer> | undefined;
      return Object.freeze({
        completionId,
        current: Object.freeze({
          snapshot,
          async next(afterRevision?: number): Promise<CompletionCurrentSnapshot> {
            await started;
            return observeNextCurrent(url, token, completionId, afterRevision);
          },
        }),
        // Observation begins on the first read, so an unawaited handle costs nothing.
        get result(): Promise<ResolvedGraphLayer> {
          observation ??= started.then(() => observeResult(url, token, completionId));
          return observation;
        },
        async stop(reason: string): Promise<void> {
          await started;
          const response = await brokerRequest(url, token, `/${completionId}/stop`, {
            method: "POST",
            body: JSON.stringify({ reason }),
          });
          if (response.status !== 200) throw await brokerRefusal(response);
        },
      });
    },
  });
}

/**
 * Waits for one child's current to move past `afterRevision`, or to end. The broker holds
 * each request until the current moves, answering unchanged when its hold elapses, so a
 * wait that outlasts the hold simply asks again.
 */
async function observeNextCurrent(
  url: string,
  token: string,
  completionId: number,
  afterRevision: number | undefined,
): Promise<CompletionCurrentSnapshot> {
  for (;;) {
    const query = afterRevision === undefined ? "" : `?afterRevision=${afterRevision}`;
    const response = await brokerRequest(url, token, `/${completionId}/result${query}`);
    const value = await responseBody(response);
    if (response.status === 200) {
      const current = await brokerRequest(url, token, `/${completionId}/current`);
      if (current.status !== 200) throw await brokerRefusal(current);
      return normalizeCurrent(await current.json());
    }
    if ((response.status === 202 || response.status === 409) && isRecord(value) && isRecord(value.current)) {
      const current = normalizeCurrent(value.current);
      if (response.status === 409 || afterRevision === undefined || current.revision > afterRevision) {
        return current;
      }
      continue;
    }
    throw brokerError(response.status, value);
  }
}

/**
 * Watches the children a parent launched. Each call to `changes()` resolves on the next
 * event: any child's current moving or ending. A child still unanswered keeps its request
 * open; an answered child is asked again after the revision it reported, so its next event
 * carries its latest current, with any moves made in between folded into it. A child whose
 * request fails is reported once with that error and not asked again, so it never holds
 * back its siblings. Overlapping calls take turns, so each event is returned by exactly one
 * of them.
 */
export function watchCompletions(children: Iterable<CompletionHandle>): CompletionWatch {
  const watched = new Map<number, CompletionHandle>();
  for (const child of children) watched.set(child.completionId, child);
  const seen = new Map<number, number>();
  const ended = new Set<number>();
  const pending = new Map<number, Promise<Answer>>();
  let turn: Promise<unknown> = Promise.resolve();
  const collect = async (): Promise<readonly CompletionChange[]> => {
    for (const [id, child] of watched) {
      if (ended.has(id) || pending.has(id)) continue;
      pending.set(id, answerNext(child, seen.get(id)));
    }
    if (pending.size === 0) return [];
    await Promise.race(pending.values());
    // Every request that has answered by now is one change; the unanswered ones stay open.
    const answered = await Promise.all([...pending].map(async ([id, request]) => (
      await Promise.race([request, Promise.resolve(undefined)]) === undefined ? undefined : id
    )));
    const changes: CompletionChange[] = [];
    for (const id of answered) {
      if (id === undefined) continue;
      const answer = await pending.get(id)!;
      pending.delete(id);
      if (answer.error !== undefined) {
        ended.add(id);
        changes.push(Object.freeze({ child: watched.get(id)!, error: answer.error }));
        continue;
      }
      const { current } = answer;
      seen.set(id, current.revision);
      if (current.lifecycle !== "active") ended.add(id);
      changes.push(Object.freeze({ child: watched.get(id)!, current }));
    }
    return changes;
  };
  return Object.freeze({
    get settled(): boolean {
      return ended.size === watched.size;
    },
    changes(): Promise<readonly CompletionChange[]> {
      const changes = turn.then(collect);
      turn = changes.catch(() => {});
      return changes;
    },
  });
}

type Answer = { current: CompletionCurrentSnapshot; error?: undefined } | { error: Error };

/**
 * Asks one watched child for its next current. A failed request, however it fails, answers
 * with its error, so the watch consumes it like any other answer.
 */
async function answerNext(child: CompletionHandle, afterRevision: number | undefined): Promise<Answer> {
  try {
    return { current: await child.current.next(afterRevision) };
  } catch (error) {
    if (error instanceof Error) return { error };
    let detail = "Completion observation failed";
    try {
      detail = String(error);
    } catch {
      // Keep the generic detail for a value that cannot be printed.
    }
    return { error: new Error(detail) };
  }
}

/**
 * Observes one child until it settles, one request per delivered revision.
 *
 * The broker holds each observation open until the completion advances past the last
 * revision this caller saw, so waiting costs one request per advance rather than a timer.
 */
async function observeResult(url: string, token: string, completionId: number): Promise<ResolvedGraphLayer> {
  let afterRevision: number | undefined;
  for (;;) {
    const query = afterRevision === undefined ? "" : `?afterRevision=${afterRevision}`;
    const response = await brokerRequest(url, token, `/${completionId}/result${query}`);
    const value = await responseBody(response);
    if (response.status === 200) return value as ResolvedGraphLayer;
    if (response.status === 202) {
      if (!isRecord(value) || !isRecord(value.current)) {
        throw new Error("Completion broker delivered an observation without a current");
      }
      afterRevision = normalizeCurrent(value.current).revision;
      continue;
    }
    if (response.status === 409 && isRecord(value) && isRecord(value.current)) {
      const current = normalizeCurrent(value.current);
      const lifecycle = current.lifecycle;
      if (lifecycle === "stopped" || lifecycle === "failed") {
        throw new CompletionTerminalError(
          completionId,
          lifecycle,
          current,
          typeof value.reason === "string" ? value.reason : "completion_failed",
        );
      }
    }
    throw brokerError(response.status, value);
  }
}

function brokerRequest(url: string, token: string, path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${url}${path}`, {
    ...init,
    headers: {
      accept: "application/json",
      authorization: `Bearer ${token}`,
      ...(init.body === undefined ? {} : { "content-type": "application/json" }),
      ...init.headers,
    },
  });
}

function normalizeCurrent(value: unknown): CompletionCurrentSnapshot {
  const lifecycle = isRecord(value) ? String(value.lifecycle) : "";
  const revision = isRecord(value) ? value.headRevision ?? value.revision : undefined;
  if (!isRecord(value)
    || !Number.isSafeInteger(value.completionId)
    || Number(value.completionId) < 1
    || !["active", "succeeded", "stopped", "failed"].includes(lifecycle)
    || !Number.isSafeInteger(revision)
    || Number(revision) < 0
    || !isNullableGraphId(value.currentLayerId)
    || !isNullableGraphId(value.finalLayerId)
    || !(value.safeReason === undefined || value.safeReason === null || typeof value.safeReason === "string")) {
    throw new Error("Completion broker returned an invalid current snapshot");
  }
  return {
    completionId: value.completionId as number,
    lifecycle: lifecycle as CompletionCurrentSnapshot["lifecycle"],
    revision: revision as number,
    currentLayerId: value.currentLayerId as number | null,
    finalLayerId: value.finalLayerId as number | null,
    ...(typeof value.safeReason === "string" ? { safeReason: value.safeReason } : {}),
  };
}

function isNullableGraphId(value: unknown): value is number | null {
  return value === null || (Number.isSafeInteger(value) && Number(value) > 0);
}

/** Reads a broker answer. A success must be JSON; a refusal need not be. */
function responseBody(response: Response): Promise<unknown> {
  return response.ok ? response.json() as Promise<unknown> : refusalBody(response);
}

/** A refusal without a JSON body, such as a proxy's error page, is still named by its status. */
async function refusalBody(response: Response): Promise<unknown> {
  try {
    return await response.json() as unknown;
  } catch {
    return undefined;
  }
}

async function brokerRefusal(response: Response): Promise<Error> {
  return brokerError(response.status, await refusalBody(response));
}

function brokerError(status: number, value: unknown): Error {
  const safeClientDetail = status >= 400
    && status < 500
    && isRecord(value)
    && typeof value.error === "string"
    && value.error.length <= 200
    && !/[\u0000-\u001f\u007f]/u.test(value.error);
  const detail = safeClientDetail && isRecord(value) ? `: ${String(value.error)}` : "";
  return new Error(`Completion broker returned HTTP ${status}${detail}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
