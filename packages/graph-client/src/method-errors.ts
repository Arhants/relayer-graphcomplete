/** The graph methods a harness program can call. Kept by hand so private helpers stay out of the hint. */
export const GRAPH_CLIENT_METHODS = Object.freeze([
  "getInteractionInput", "getPersonalPresentation", "getNode", "getNeighbors", "getLayer",
  "getNodePresentation", "replaceNodePresentation", "bindNode", "checkpointNodeDetail",
  "submitNode", "createEdge", "createEdges", "submitLayer", "addAction", "discardLayer",
  "proposeThreadIcon", "getCurrent", "advanceCurrent", "returnCurrent", "stopCurrent",
  "prepareComplete", "search", "submit", "getCompletionOutput",
] as const);

/** Names models guess in traces, and the method that actually exists. */
const GRAPH_METHOD_HINTS: Readonly<Record<string, string>> = Object.freeze({
  submitEdge: "createEdge", addEdge: "createEdge", submitEdges: "createEdges", addEdges: "createEdges",
  createNode: "submitNode", addNode: "submitNode", createLayer: "submitLayer", addLayer: "submitLayer",
  submitAction: "addAction", createAction: "addAction", submitActions: "addAction",
  checkpointDetail: "checkpointNodeDetail", checkpointNode: "checkpointNodeDetail",
  getInput: "getInteractionInput", getInteraction: "getInteractionInput",
  discard: "discardLayer", advance: "advanceCurrent", finalize: "submit", complete: "submit", submitGraph: "submit",
});

/** Names JavaScript itself probes on any object; they must stay undefined, not throw. */
const PASSTHROUGH = new Set(["then", "catch", "finally", "toJSON", "constructor", "inspect", "asymmetricMatch", "nodeType", "$$typeof"]);

export function graphMethodError(name: string): TypeError {
  const hint = GRAPH_METHOD_HINTS[name];
  return new TypeError(
    `graph.${name} is not a graph method.${hint === undefined ? "" : ` Use await graph.${hint}(...) instead.`}`
    + ` Graph methods: ${GRAPH_CLIENT_METHODS.join(", ")}.`,
  );
}

/**
 * Makes a guessed method name fail at the call site with the real name, instead
 * of "graph.submitEdge is not a function" after half the graph was written.
 * Methods run against the real client, so its private state keeps working.
 */
export function withGraphMethodErrors<T extends object>(client: T): T {
  return new Proxy(client, {
    get(target, property) {
      if (typeof property === "string" && !(property in target) && !PASSTHROUGH.has(property)) {
        throw graphMethodError(property);
      }
      const value = Reflect.get(target, property);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}
