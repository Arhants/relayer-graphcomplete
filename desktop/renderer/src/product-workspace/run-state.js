// Explicit run states shown as symbols (PRD §8.1, :289). Shape, tooltip and accessible name carry
// the state; colour comes from the design's running, warning and danger roles.
export const THREAD_ACTIVITY = Object.freeze({
  running: Object.freeze({ label: "Running", icon: "LoaderCircle", live: true }),
  stopping: Object.freeze({ label: "Stopping…", icon: "Square", live: true }),
  needs_approval: Object.freeze({ label: "Needs approval", icon: "Hand", live: true }),
  failed: Object.freeze({ label: "Failed", icon: "OctagonX", live: false }),
});

const ACTIVE_STATUSES = new Set(["not_started", "running", "submitted", "waiting_for_approval"]);

// A thread's symbol from its latest interaction; the app server applies the same rule to thread lists.
export function interactionActivity(interaction) {
  const status = interaction?.completionStatus;
  if (ACTIVE_STATUSES.has(status) && interaction.stopRequested && !interaction.stopError) return "stopping";
  if (status === "waiting_for_approval") return "needs_approval";
  if (ACTIVE_STATUSES.has(status)) return "running";
  if (status === "failed") return "failed";
  return null;
}

// Node marks (visual redesign b-structure-spec §4): a hollow dashed draft, or the state of the
// latest child run the node's actions started. Accepted and never-invoked nodes carry no mark.
export const NODE_RUN_STATE = Object.freeze({
  draft: Object.freeze({ label: "Draft", icon: null }),
  running: Object.freeze({ label: "Running", icon: "LoaderCircle" }),
  stopped: Object.freeze({ label: "Stopped", icon: "Square" }),
  failed: Object.freeze({ label: "Failed", icon: "OctagonX" }),
});

export function nodeRunState(node, actions = [], invocations = []) {
  if (node?.state === "draft") return "draft";
  const actionIds = new Set(actions
    .filter((action) => String(action.sourceNodeId) === String(node?.id))
    .map((action) => String(action.id)));
  const latest = invocations
    .filter((invocation) => actionIds.has(String(invocation.actionId)))
    .reduce((newest, invocation) => (
      !newest || Number(invocation.resultInteractionId) > Number(newest.resultInteractionId) ? invocation : newest
    ), null);
  const status = latest?.resultCompletionStatus;
  if (["not_started", "running", "waiting_for_approval"].includes(status)) return "running";
  if (status === "stopped") return "stopped";
  if (status === "failed") return "failed";
  return null;
}
