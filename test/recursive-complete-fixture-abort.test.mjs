import { afterEach, describe, expect, it, vi } from "vitest";

import { RelayerGraphClient } from "@relayer/graph-client";
import {
  RECURSIVE_FIXTURE_CHILD_TASK,
  recursiveCompleteFixtureFactory,
} from "./support/recursive-complete-fixture.mjs";

const originalMethods = new Map();

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function settlesAfterTurns(promise) {
  let outcome;
  promise.then((value) => { outcome = value; });
  await new Promise(setImmediate);
  await new Promise(setImmediate);
  return outcome;
}

function controlledChild(advanceCurrent) {
  const enteredAdvance = deferred();
  for (const [name, implementation] of Object.entries({
    getCurrent: async () => ({ headRevision: 1 }),
    submitNode: async () => undefined,
    submitLayer: async () => undefined,
    addAction: async () => undefined,
    advanceCurrent: (...args) => {
      enteredAdvance.resolve();
      return advanceCurrent(...args);
    },
  })) {
    originalMethods.set(name, RelayerGraphClient.prototype[name]);
    vi.spyOn(RelayerGraphClient.prototype, name).mockImplementation(implementation);
  }

  const controller = new AbortController();
  const observed = { childBlocks: true };
  const handle = recursiveCompleteFixtureFactory(observed)().complete({
    inputGraph: { id: 1, detail: RECURSIVE_FIXTURE_CHILD_TASK },
    graph: { acquireCapability: () => ({ url: "http://unused", token: "fixture", nodeId: 1 }) },
  }, controller.signal);
  return { controller, enteredAdvance, handle, observed };
}

function controlledParent({ childStart, childAdvance, failChildStart = false }) {
  let currentReads = 0;
  let currentAdvances = 0;
  const childAdvanceEntered = deferred();
  const childCompletionCreated = deferred();
  const stopCalls = [];
  let childHandle;
  let childNativeSettled;
  const observed = { childBlocks: true };

  const methods = {
    getCurrent: async () => ({ headRevision: currentReads++ === 0 ? 0 : 1 }),
    submitNode: async () => undefined,
    submitLayer: async () => undefined,
    addAction: async (_source, action) => action.kind === "invoke" ? { id: 3 } : undefined,
    advanceCurrent: async () => {
      if (currentAdvances++ === 0) return { revision: 1 };
      childAdvanceEntered.resolve();
      return childAdvance.promise;
    },
    prepareComplete: async () => ({ interactionNode: 2 }),
    returnCurrent: async () => undefined,
  };
  for (const [name, implementation] of Object.entries(methods)) {
    originalMethods.set(name, RelayerGraphClient.prototype[name]);
    vi.spyOn(RelayerGraphClient.prototype, name).mockImplementation(implementation);
  }

  let harness;
  const completeChild = () => {
    const childResult = deferred();
    void childResult.promise.catch(() => undefined);
    const controller = new AbortController();
    childHandle = {
      completionId: 2,
      result: childResult.promise,
      stop: async () => {
        stopCalls.push("stop");
        controller.abort();
        await childNativeSettled;
        childResult.reject(new Error("child was stopped"));
      },
      current: { snapshot: async () => ({ lifecycle: "stopped", revision: 2 }) },
    };
    childCompletionCreated.resolve();
    if (failChildStart) {
      childStart.promise.then(() => childResult.reject(new Error("child startup failed")));
    } else {
      childStart.promise.then(() => {
        const execution = harness.complete({
          inputGraph: { id: 2, detail: RECURSIVE_FIXTURE_CHILD_TASK },
          graph: { acquireCapability: () => ({ url: "http://unused", token: "fixture", nodeId: 2 }) },
        }, controller.signal);
        childNativeSettled = execution.settled;
        void execution.settled.then((outcome) => {
          if (outcome.status === "failed") childResult.reject(new Error("child execution failed"));
        });
      });
    }
    return childHandle;
  };

  harness = recursiveCompleteFixtureFactory(observed, () => "http://unused", completeChild)();
  const parent = harness.complete({
    inputGraph: { id: 1, detail: "Parent task" },
    completionBroker: { token: "fixture" },
    graph: { acquireCapability: () => ({ url: "http://unused", token: "fixture", nodeId: 1 }) },
  });
  return {
    childAdvanceEntered,
    childCompletionCreated,
    childHandle: () => childHandle,
    observed,
    parent,
    stopCalls,
  };
}

afterEach(() => {
  for (const [name, implementation] of originalMethods) {
    RelayerGraphClient.prototype[name] = implementation;
  }
  originalMethods.clear();
  vi.restoreAllMocks();
});

describe("recursive fixture cancellation readiness", () => {
  it("settles when abort arrives before the advance response", async () => {
    const advanceResponse = deferred();
    const child = controlledChild(() => advanceResponse.promise);

    await child.enteredAdvance.promise;
    child.controller.abort();
    advanceResponse.resolve();

    expect(await settlesAfterTurns(child.handle.settled)).toMatchObject({ status: "failed" });
  });

  it("announces readiness after installing cancellation and propagates setup failure", async () => {
    const advanceResponse = deferred();
    const child = controlledChild(() => advanceResponse.promise);

    await child.enteredAdvance.promise;
    advanceResponse.resolve();
    await child.observed.childReadiness;
    child.controller.abort();
    expect(await settlesAfterTurns(child.handle.settled)).toMatchObject({ status: "failed" });
  });

  it("rejects parent readiness when child publication fails", async () => {
    const setupFailure = new Error("advance failed");
    const child = controlledChild(() => Promise.reject(setupFailure));

    await child.enteredAdvance.promise;
    await expect(child.observed.childReadiness).rejects.toBe(setupFailure);
    expect(await settlesAfterTurns(child.handle.settled)).toMatchObject({ status: "failed" });
  });

  it("parent waits through delayed child startup and publication before stopping", async () => {
    const childStart = deferred();
    const childAdvance = deferred();
    const parent = controlledParent({ childStart, childAdvance });

    await parent.childCompletionCreated.promise;
    expect(await settlesAfterTurns(parent.parent.settled)).toBeUndefined();
    expect(parent.stopCalls).toEqual([]);

    childStart.resolve();
    await parent.childAdvanceEntered.promise;
    expect(await settlesAfterTurns(parent.parent.settled)).toBeUndefined();
    expect(parent.stopCalls).toEqual([]);

    childAdvance.resolve({ revision: 2 });
    await expect(parent.parent.settled).resolves.toMatchObject({ status: "exited" });
    expect(parent.stopCalls).toEqual(["stop"]);
    expect(parent.observed.stoppedChild).toMatchObject({ lifecycle: "stopped", revision: 2 });
  });

  it("parent fails promptly when child startup fails before readiness", async () => {
    const childStart = deferred();
    const childAdvance = deferred();
    const parent = controlledParent({ childStart, childAdvance, failChildStart: true });

    await parent.childCompletionCreated.promise;
    childStart.resolve();
    await expect(parent.parent.settled).resolves.toMatchObject({ status: "failed" });
    expect(parent.stopCalls).toEqual([]);
  });
});
