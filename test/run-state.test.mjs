import { describe, expect, it } from "vitest";

import { interactionActivity, nodeRunState } from "../desktop/renderer/src/product-workspace/run-state.js";

describe("explicit run-state symbols", () => {
  it("derives a thread's symbol from its latest interaction like the app server does", () => {
    const activity = (completionStatus, stop = {}) => interactionActivity({ completionStatus, ...stop });
    expect(["not_started", "submitted", "running", "waiting_for_approval", "failed", "accepted", "stopped", "cancelled"].map((status) => activity(status)))
      .toEqual(["running", "running", "running", "needs_approval", "failed", null, null, null]);
    expect(activity("running", { stopRequested: true })).toBe("stopping");
    expect(activity("waiting_for_approval", { stopRequested: true })).toBe("stopping");
    expect(activity("running", { stopRequested: true, stopError: "Could not stop" })).toBe("running");
    expect(interactionActivity(undefined)).toBeNull();
  });

  it("marks a node as draft, or with the latest child run its actions started", () => {
    const node = { id: 1 };
    const actions = [{ id: 10, sourceNodeId: 1 }, { id: 11, sourceNodeId: 1 }, { id: 20, sourceNodeId: 2 }];
    const invocation = (actionId, resultInteractionId, resultCompletionStatus) => ({ actionId, resultInteractionId, resultCompletionStatus });
    expect(nodeRunState({ id: 1, state: "draft" }, actions, [invocation(10, 5, "running")])).toBe("draft");
    expect(nodeRunState(node, actions, [])).toBeNull();
    expect(nodeRunState(node, actions, [invocation(10, 5, "accepted")])).toBeNull();
    expect(nodeRunState(node, actions, [invocation(10, 5, "failed"), invocation(11, 6, "running")])).toBe("running");
    expect(nodeRunState(node, actions, [invocation(10, 7, "stopped"), invocation(11, 6, "running")])).toBe("stopped");
    expect(nodeRunState(node, actions, [invocation(11, 6, "failed")])).toBe("failed");
    expect(nodeRunState(node, actions, [invocation(20, 9, "running")])).toBeNull();
  });
});
