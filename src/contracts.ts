export type GraphId = number;
export type RecordState = "draft" | "accepted" | "stopped";

export interface GraphNode {
  readonly id: GraphId;
  readonly leasedActionId?: GraphId | null;
  readonly kind: string;
  readonly icon: string;
  readonly title: string;
  readonly detail: string;
  readonly state: RecordState;
}

export interface GraphEdge {
  readonly id: GraphId;
  readonly endpoints: readonly [GraphId, GraphId];
  readonly state: RecordState;
}

export interface NodePlacement {
  readonly nodeId: GraphId;
  readonly x: number;
  readonly y: number;
}

export interface LayerLayout {
  readonly version: 1;
  readonly placements: readonly NodePlacement[];
}

export interface GraphLayer {
  readonly id: GraphId;
  readonly nodes: readonly GraphId[];
  readonly edges: readonly GraphId[];
  readonly layout?: LayerLayout | null;
  readonly state: RecordState;
}

export type ActionKind = "navigate" | "invoke" | "interaction.context";
export type NavigateRelation = "expand" | "reference";
export type ActionVariant = "chip" | "pill" | "wide" | "card";

export interface GraphAction {
  readonly id: GraphId;
  readonly sourceNodeId: GraphId;
  readonly sourceLayerId?: GraphId | null;
  readonly kind: ActionKind;
  readonly relation?: NavigateRelation | null;
  readonly label: string;
  readonly variant: ActionVariant;
  readonly icon?: string | null;
  readonly description?: string | null;
  readonly targetLayerId?: GraphId | null;
  readonly interactionText?: string | null;
  readonly state: RecordState;
}

export interface ResolvedGraphLayer {
  readonly layer: GraphLayer;
  readonly nodes: readonly GraphNode[];
  readonly edges: readonly GraphEdge[];
  readonly actions: readonly GraphAction[];
}

/** Pointer to one interaction whose completion identity and authority are already prepared. */
export interface CompletionInputGraph {
  readonly interactionNode: GraphId;
}

export type InputGraph = CompletionInputGraph;

export type CompletionLifecycle = "active" | "succeeded" | "stopped" | "failed";

export interface CompletionCurrentSnapshot {
  readonly completionId: GraphId;
  readonly lifecycle: CompletionLifecycle;
  readonly revision: number;
  readonly currentLayerId: GraphId | null;
  readonly finalLayerId: GraphId | null;
  readonly safeReason?: string;
}

export interface CompletionCurrent {
  snapshot(): Promise<CompletionCurrentSnapshot>;
  /**
   * Waits until this child's current moves past `afterRevision`, or ends, and returns it.
   * Without `afterRevision` it returns the current at once. A parent treats each move as
   * an event for organizing its own work.
   */
  next(afterRevision?: number): Promise<CompletionCurrentSnapshot>;
}

/** One change to a watched child's current. */
export interface CompletionChange {
  readonly child: CompletionHandle;
  readonly current: CompletionCurrentSnapshot;
}

/** Waits on several children at once, reporting each change to any child's current. */
export interface CompletionWatch {
  /** True once every watched child's current is terminal. */
  readonly settled: boolean;
  /**
   * Resolves as soon as at least one child's current has moved or ended since the last
   * call, with every change seen by then. The first call reports each child's current.
   * Resolves to no changes once the watch is settled.
   */
  changes(): Promise<readonly CompletionChange[]>;
}

export interface CompletionHandle {
  readonly completionId: GraphId;
  readonly current: CompletionCurrent;
  /** Resolves only from durable GraphComplete success. Observed lazily, on first read. */
  readonly result: Promise<ResolvedGraphLayer>;
  /**
   * Stops this child from the execution that invoked it.
   *
   * Only the direct parent may stop a completion. The child keeps its retained current
   * and reports `stopped`; the parent's own invoke stays unresolved and navigable.
   */
  stop(reason: string): Promise<void>;
}

/** Injected implementation of trusted preparation, execution, and durable settlement. */
export interface CompletionRuntime {
  complete(inputGraph: CompletionInputGraph): CompletionHandle;
}

export class CompletionTerminalError extends Error {
  constructor(
    readonly completionId: GraphId,
    readonly lifecycle: "stopped" | "failed",
    readonly current: CompletionCurrentSnapshot,
    readonly reason: string,
  ) {
    super(`Completion ${completionId} ${lifecycle}: ${reason}`);
    this.name = "CompletionTerminalError";
  }
}
