export const EXPERIMENTAL_AUTHORING_STRATEGIES = [
  "function-increments-v1",
  "saved-module-v1",
  "decompose-publish-v1",
] as const;

export type ExperimentalAuthoringStrategy =
  (typeof EXPERIMENTAL_AUTHORING_STRATEGIES)[number];

export function javascriptExperimentalAuthoringGuidance(
  strategy: ExperimentalAuthoringStrategy | undefined,
  interactionNodeId: number,
): string {
  if (strategy === undefined) return "";
  if (strategy === "function-increments-v1") {
    return `Experimental authoring strategy — function increments. Prefer a small program made of reusable functions that each do one real job: construct fresh node-specific content, checkpoint one Node Detail, submit one stable-keyed record group, or assemble one coherent layer. Keep task facts as data passed into those functions. Run the smallest useful function path first and preserve successful functions and stable keys while repairing only the failing path. Recursive JavaScript functions are ordinary computation inside this completion; they are neither provider-native helpers nor semantic child Complete calls. This guidance does not require a particular topology, helper count, or publication schedule.`;
  }
  if (strategy === "saved-module-v1") {
    return `Experimental authoring strategy — reusable saved module. You may keep the graph-authoring source in .relayer/authoring-experiments/${interactionNodeId}/graph.mjs inside the current workspace and make small edits to that one file. Keep credentials, capability values, provider state, and task-private source material out of the file. The module should define reusable functions that construct fresh owner-bound graph objects and should keep stable client keys for retries. Execute its bytes through the same graph-authoring Node boundary described above; a saved file grants no additional filesystem, network, graph, or completion authority and does not publish anything by itself. Do not place the module in a temporary directory or commit it as product source.`;
  }
  return `Experimental authoring strategy — decomposition and useful early publication. Decide whether the work benefits from ordinary JavaScript helper functions, provider-native helpers, or a semantic child complete(inputGraph) call. These are distinct: functions only structure local computation; provider-native helpers remain inside this completion and share its semantic identity; only an explicit complete(inputGraph) call creates a separately accepted semantic child. Use no mechanism merely to satisfy the experiment. When a small coherent graph already gives the user a truthful, decision-useful result, consider publishing it with advanceCurrent before continuing deeper work; never publish empty placeholders or claims not yet supported by completed work. The model retains control of decomposition, observation, concurrency, and final submission; there is no required helper, child, node, call, or recursion count.`;
}

export function pythonExperimentalAuthoringGuidance(
  strategy: ExperimentalAuthoringStrategy | undefined,
  interactionNodeId: number,
): string {
  if (strategy === undefined) return "";
  if (strategy === "function-increments-v1") {
    return `Experimental authoring strategy — function increments. Prefer small reusable Python functions that each do one real job: construct fresh node-specific content, checkpoint one Node Detail, submit one stable-keyed record group, or assemble one coherent layer. Keep task facts as data passed into those functions. Run the smallest useful function path first and preserve successful functions and stable keys while repairing only the failing path. Recursive Python functions are ordinary computation inside this completion; they are neither Prime RLM helpers nor semantic child Complete calls. This guidance does not require a particular topology, helper count, or publication schedule.`;
  }
  if (strategy === "saved-module-v1") {
    return `Experimental authoring strategy — reusable saved module. You may keep reusable Python authoring helpers in .relayer/authoring-experiments/${interactionNodeId}/graph_helpers.py inside the current workspace and make small edits to that one file. Keep credentials, capability values, provider state, and task-private source material out of it. Functions should accept the active GraphSession or graph objects explicitly, construct fresh owner-bound values, and retain stable client keys for retries. Import or reload the helper from the ordinary Prime IPython execution; the saved file grants no additional filesystem, network, graph, or completion authority and publishes nothing by itself. Do not place it in a temporary directory or commit it as product source.`;
  }
  return `Experimental authoring strategy — decomposition and useful early publication. Decide whether the work benefits from ordinary Python helper functions, Prime-native RLM helpers, or a semantic child complete(input_graph) call. These are distinct: functions only structure local computation; native helpers remain inside this completion and share its semantic identity; only an explicit complete(input_graph) call creates a separately accepted semantic child. Use no mechanism merely to satisfy the experiment. When a small coherent graph already gives the user a truthful, decision-useful result, consider publishing it with advance_current before continuing deeper work; never publish empty placeholders or claims not yet supported by completed work. The model retains control of decomposition, observation, concurrency, and final submission; there is no required helper, child, node, call, or recursion count.`;
}
